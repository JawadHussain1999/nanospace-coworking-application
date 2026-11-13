const { strToU8, zip } = require('fflate');

const BACKUP_TABLE = 'application_backups';
const ADVISORY_LOCK_ID = 841923517;
const RETENTION_DAYS = 30;
let storageReady;

function getIndiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvCell(value) {
  return `"${csvValue(value).replace(/"/g, '""')}"`;
}

function rowsToCsv(fields, rows) {
  const lines = [
    fields.map((field) => csvCell(field.name)).join(','),
    ...rows.map((row) => fields.map((field) => csvCell(row[field.name])).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function buildZipArchive(entries) {
  const files = Object.create(null);
  for (const entry of entries) {
    files[entry.name] = typeof entry.content === 'string'
      ? strToU8(entry.content)
      : new Uint8Array(entry.content);
  }
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.from(data));
    });
  });
}

async function ensureBackupStorage(pool) {
  if (!storageReady) {
    storageReady = pool.query(`
      CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        backup_date DATE NOT NULL,
        backup_type VARCHAR(16) NOT NULL CHECK (backup_type IN ('DAILY', 'MANUAL')),
        file_name VARCHAR(255) NOT NULL,
        zip_data BYTEA NOT NULL,
        record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        archive_size BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_application_backups_daily_date
        ON ${BACKUP_TABLE}(backup_date) WHERE backup_type = 'DAILY';
      CREATE INDEX IF NOT EXISTS idx_application_backups_created_at
        ON ${BACKUP_TABLE}(created_at DESC);
    `).catch((error) => {
      storageReady = null;
      throw error;
    });
  }
  await storageReady;
}

async function createBackup(pool, { type = 'MANUAL' } = {}) {
  const backupType = String(type).toUpperCase();
  if (!['DAILY', 'MANUAL'].includes(backupType)) {
    throw new Error('Backup type must be DAILY or MANUAL.');
  }

  await ensureBackupStorage(pool);
  const client = await pool.connect();
  let lockAcquired = false;
  let transactionOpen = false;
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [ADVISORY_LOCK_ID]
    );
    lockAcquired = Boolean(lockResult.rows[0]?.acquired);
    if (!lockAcquired) {
      const error = new Error('Another backup is currently being created.');
      error.code = 'BACKUP_IN_PROGRESS';
      throw error;
    }

    const backupDate = getIndiaDate();
    if (backupType === 'DAILY') {
      const existing = await client.query(
        `SELECT id, backup_date, backup_type, file_name, record_counts, archive_size, created_at
         FROM ${BACKUP_TABLE}
         WHERE backup_date = $1 AND backup_type = 'DAILY'
         LIMIT 1`,
        [backupDate]
      );
      if (existing.rowCount) return { created: false, backup: existing.rows[0] };
    }

    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionOpen = true;
    const tablesResult = await client.query(
      `SELECT relation.relname AS table_name
       FROM pg_class relation
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind IN ('r', 'p')
         AND relation.relispartition = FALSE
         AND relation.relname <> $1
       ORDER BY relation.relname`,
      [BACKUP_TABLE]
    );

    const entries = [];
    const recordCounts = {};
    for (const { table_name: tableName } of tablesResult.rows) {
      const result = await client.query(`SELECT * FROM public.${quoteIdentifier(tableName)}`);
      const safeTableName = tableName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeTableName}-${Buffer.from(tableName, 'utf8').toString('hex')}.csv`;
      entries.push({
        name: `tables/${fileName}`,
        content: rowsToCsv(result.fields, result.rows),
      });
      recordCounts[tableName] = result.rowCount;
    }

    const manifest = {
      format: 'NanoSpace full records backup',
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata',
      backupDate,
      tables: recordCounts,
      note: 'CSV files contain raw database values and should not be opened directly in spreadsheet software. The application_backups table is excluded to avoid recursively archiving backups.',
    };
    entries.push({
      name: 'manifest.json',
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    });
    const zipData = await buildZipArchive(entries);
    await client.query('COMMIT');
    transactionOpen = false;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `nanospace-backup-${backupType.toLowerCase()}-${backupDate}-${timestamp}.zip`;
    const insertResult = await client.query(
      `INSERT INTO ${BACKUP_TABLE}
         (backup_date, backup_type, file_name, zip_data, record_counts, archive_size)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, backup_date, backup_type, file_name, record_counts, archive_size, created_at`,
      [backupDate, backupType, fileName, zipData, JSON.stringify(recordCounts), zipData.length]
    );
    await client.query(
      `DELETE FROM ${BACKUP_TABLE}
       WHERE created_at < NOW() - ($1::integer * INTERVAL '1 day')`,
      [RETENTION_DAYS]
    );

    return { created: true, backup: insertResult.rows[0], zipData };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Could not roll back the database backup snapshot:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
      } catch (error) {
        console.error('Could not release the database backup lock:', error.message);
      }
    }
    client.release();
  }
}

function startDailyBackupScheduler(pool) {
  let isRunning = false;
  let lastFailedAt = 0;
  const run = async () => {
    if (isRunning || Date.now() - lastFailedAt < 15 * 60 * 1000) return;
    isRunning = true;
    try {
      await createBackup(pool, { type: 'DAILY' });
      lastFailedAt = 0;
    } catch (error) {
      lastFailedAt = Date.now();
      console.error('Daily database backup failed:', error.message);
    } finally {
      isRunning = false;
    }
  };

  void run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  BACKUP_TABLE,
  RETENTION_DAYS,
  buildZipArchive,
  createBackup,
  csvCell,
  ensureBackupStorage,
  getIndiaDate,
  rowsToCsv,
  startDailyBackupScheduler,
};
