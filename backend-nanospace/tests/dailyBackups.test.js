const test = require('node:test');
const assert = require('node:assert/strict');
const { strFromU8, unzipSync } = require('fflate');
const {
  buildZipArchive,
  createBackup,
  csvCell,
  getIndiaDate,
  rowsToCsv,
} = require('../src/utils/dailyBackups');

test('CSV export quotes delimiters, newlines, buffers, and structured values', () => {
  assert.equal(csvCell('A "quoted", value\nnext line'), '"A ""quoted"", value\nnext line"');
  assert.equal(csvCell(Buffer.from([0, 1, 2])), '"AAEC"');
  assert.equal(csvCell({ enabled: true }), '"{""enabled"":true}"');
  assert.equal(
    rowsToCsv(
      [{ name: 'id' }, { name: 'value' }],
      [{ id: 7, value: 'with,comma' }]
    ),
    '"id","value"\r\n"7","with,comma"\r\n'
  );
});

test('backup dates use the Asia/Kolkata calendar day', () => {
  assert.equal(getIndiaDate(new Date('2026-01-01T18:31:00.000Z')), '2026-01-02');
});

test('backup ZIP contains a valid local ZIP file header', async () => {
  const zip = await buildZipArchive([
    { name: 'manifest.json', content: '{"format":"test"}' },
    { name: 'tables/users.csv', content: '"id"\r\n' },
  ]);
  assert.equal(zip.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(zip.length > 100);
  const entries = unzipSync(zip);
  assert.equal(strFromU8(entries['manifest.json']), '{"format":"test"}');
  assert.equal(strFromU8(entries['tables/users.csv']), '"id"\r\n');
});

test('full backup queries every public table, stores the archive, and excludes its own archive table', async () => {
  const statements = [];
  const tableRows = {
    users: {
      fields: [{ name: 'id' }, { name: 'full_name' }],
      rows: [{ id: 'user-1', full_name: 'Sample User' }],
    },
    documents: {
      fields: [{ name: 'id' }, { name: 'file_data' }],
      rows: [{ id: 'document-1', file_data: Buffer.from([1, 2, 3]) }],
    },
  };
  const client = {
    async query(sql, values = []) {
      statements.push({ sql, values });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }], rowCount: 1 };
      if (sql.includes('FROM pg_class')) {
        return { rows: [{ table_name: 'documents' }, { table_name: 'users' }], rowCount: 2 };
      }
      const tableMatch = sql.match(/SELECT \* FROM public\."([^"]+)"/);
      if (tableMatch) return { ...tableRows[tableMatch[1]], rowCount: tableRows[tableMatch[1]].rows.length };
      if (sql.includes('INSERT INTO application_backups')) {
        return {
          rows: [{
            id: 'backup-id',
            backup_date: '2026-01-02',
            backup_type: 'MANUAL',
            file_name: values[2],
            record_counts: JSON.parse(values[4]),
            archive_size: values[5],
            created_at: new Date().toISOString(),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = {
    async query(sql) {
      statements.push({ sql, values: [] });
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return client;
    },
  };

  const result = await createBackup(pool);
  assert.equal(result.created, true);
  assert.equal(result.backup.backup_type, 'MANUAL');
  assert.ok(Buffer.isBuffer(result.zipData));
  const files = unzipSync(result.zipData);
  assert.match(strFromU8(files['tables/users-7573657273.csv']), /Sample User/);
  assert.match(strFromU8(files['tables/documents-646f63756d656e7473.csv']), /"AQID"/);
  assert.ok(statements.some(({ sql }) => sql.includes('DELETE FROM application_backups')));
  const tableDiscovery = statements.find(({ sql }) => sql.includes('FROM pg_class'));
  assert.equal(tableDiscovery.values[0], 'application_backups');
});
