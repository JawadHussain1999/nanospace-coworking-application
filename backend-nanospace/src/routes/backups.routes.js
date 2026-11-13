const router = require('express').Router();
const pool = require('../db/pool');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { BACKUP_TABLE, createBackup, ensureBackupStorage } = require('../utils/dailyBackups');

function sendZip(res, fileName, zipData) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', zipData.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(zipData);
}

router.get('/', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  await ensureBackupStorage(pool);
  const result = await pool.query(
    `SELECT id, backup_date, backup_type, file_name, record_counts, archive_size, created_at
     FROM ${BACKUP_TABLE}
     ORDER BY created_at DESC
     LIMIT 100`
  );
  res.json({ data: result.rows });
}));

router.post('/', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  try {
    const result = await createBackup(pool, { type: 'MANUAL' });
    sendZip(res, result.backup.file_name, result.zipData);
  } catch (error) {
    if (error.code === 'BACKUP_IN_PROGRESS') {
      return res.status(409).json({ error: 'A backup is already being created. Please try again shortly.' });
    }
    throw error;
  }
}));

router.get('/:id/download', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  await ensureBackupStorage(pool);
  const result = await pool.query(
    `SELECT file_name, zip_data
     FROM ${BACKUP_TABLE}
     WHERE id::text = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Backup not found or expired.' });

  const { file_name: fileName, zip_data: zipData } = result.rows[0];
  sendZip(res, fileName.replace(/["\r\n]/g, '_'), zipData);
}));

module.exports = router;
