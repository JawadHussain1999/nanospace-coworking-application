const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');

router.get('/', ah(async (req, res) => {
  const result = await pool.query("SELECT data FROM settings WHERE branch_id IS NULL AND settings_key='organization' LIMIT 1");
  if (!result.rowCount) {
    return res.json({
      data: {
        organizationName: 'NanoSpace Coworking',
        currency: 'INR',
        taxRatePercent: 18,
        operatingHours: { open: '08:00', close: '22:00' },
        securityDepositMonths: 2,
        noticePeriodDays: 30,
        autoInvoicing: true,
        smsNotifications: true,
        emailNotifications: true,
      }
    });
  }
  res.json({ data: result.rows[0].data });
}));

router.patch('/', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  const body = req.body;
  const result = await pool.query(
    `INSERT INTO settings(branch_id, settings_key, data, updated_by)
     VALUES(NULL, 'organization', $1::jsonb, $2)
     ON CONFLICT(branch_id) DO UPDATE
     SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=NOW()
     RETURNING data`,
    [JSON.stringify(body), req.user.id]
  );
  res.json({ data: result.rows[0].data });
}));

router.get('/branches/:branchId', ah(async (req, res) => {
  const { branchId } = req.params;
  const result = await pool.query('SELECT data FROM settings WHERE branch_id = $1 LIMIT 1', [branchId]);
  if (!result.rowCount) {
    const bRes = await pool.query('SELECT name, code FROM branches WHERE id = $1', [branchId]);
    const b = bRes.rows[0];
    return res.json({
      data: {
        branchName: b?.name || 'Branch',
        operatingHours: '08:00 - 22:00',
        accessControl: 'Biometric + RFID Keycard',
        amenities: ['High-speed WiFi', 'Meeting Rooms', 'Cafeteria', 'Power Backup', 'Printing'],
        visitorRegistrationRequired: true,
      }
    });
  }
  res.json({ data: result.rows[0].data });
}));

router.patch('/branches/:branchId', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const { branchId } = req.params;
  const body = req.body;
  const result = await pool.query(
    `INSERT INTO settings(branch_id, settings_key, data, updated_by)
     VALUES($1, 'branch', $2::jsonb, $3)
     ON CONFLICT(branch_id) DO UPDATE
     SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=NOW()
     RETURNING data`,
    [branchId, JSON.stringify(body), req.user.id]
  );
  res.json({ data: result.rows[0].data });
}));

module.exports = router;
