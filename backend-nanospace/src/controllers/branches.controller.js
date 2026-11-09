const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { saveBranchRazorpayCredentials } = require('../utils/razorpay');

router.get('/', ah(async (req, res) => {
  const result = req.user.role === 'SUPER_ADMIN'
    ? await pool.query('SELECT * FROM branches ORDER BY name')
    : await pool.query('SELECT * FROM branches WHERE id = $1', [req.user.branch_id]);
  res.json({ data: result.rows });
}));
router.post('/', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  const { name, code, address } = req.body;
  const floorCount = Number(req.body.floorCount ?? req.body.floor_count ?? 1);
  if (!name || !code) return res.status(400).json({ error: 'name and code are required.' });
  if (!Number.isInteger(floorCount) || floorCount < 1) {
    return res.status(400).json({ error: 'floorCount must be a positive whole number.' });
  }
  const result = await pool.query(
    'INSERT INTO branches(name,code,address,floor_count) VALUES($1,$2,$3,$4) RETURNING *',
    [name.trim(), code.trim().toUpperCase(), address || null, floorCount]
  );
  res.status(201).json({ data: result.rows[0] });
}));
router.patch('/:id', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  const { name, code, address, isActive } = req.body;
  const rawFloorCount = req.body.floorCount ?? req.body.floor_count;
  const floorCount = rawFloorCount === undefined ? null : Number(rawFloorCount);
  if (floorCount !== null && (!Number.isInteger(floorCount) || floorCount < 1)) {
    return res.status(400).json({ error: 'floorCount must be a positive whole number.' });
  }
  const result = await pool.query(
    `UPDATE branches SET name=COALESCE($2,name), code=COALESCE($3,code),
     address=COALESCE($4,address), is_active=COALESCE($5,is_active),
     floor_count=COALESCE($6,floor_count), updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [req.params.id, name, code ? code.toUpperCase() : null, address, isActive, floorCount]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Branch not found.' });
  res.json({ data: result.rows[0] });
}));

router.get('/:id/payment-account', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  const result = await pool.query(
    `SELECT b.id, b.name, account.razorpay_key_id,
            (account.razorpay_key_secret_encrypted IS NOT NULL) AS configured
     FROM branches b
     LEFT JOIN branch_payment_accounts account ON account.branch_id = b.id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Branch not found.' });
  res.json({ data: result.rows[0] });
}));

router.put('/:id/payment-account', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  const { keyId, keySecret } = req.body;
  const normalizedKeyId = String(keyId || '').trim();
  const normalizedKeySecret = String(keySecret || '').trim();
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(normalizedKeyId)) {
    return res.status(400).json({ error: 'Enter a valid Razorpay test or live Key ID.' });
  }
  if (process.env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY &&
      !/^[a-f0-9]{64}$/i.test(process.env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY)) {
    return res.status(503).json({ error: 'Razorpay credential encryption is misconfigured. Contact the system administrator.' });
  }

  const branch = await pool.query('SELECT id FROM branches WHERE id = $1', [req.params.id]);
  if (!branch.rowCount) return res.status(404).json({ error: 'Branch not found.' });

  try {
    await saveBranchRazorpayCredentials(req.params.id, {
      keyId: normalizedKeyId,
      keySecret: normalizedKeySecret,
    });
  } catch (error) {
    if (error.message.includes('RAZORPAY_CREDENTIALS_ENCRYPTION_KEY')) {
      return res.status(503).json({ error: 'Razorpay credential encryption is not configured. Contact the system administrator.' });
    }
    if (error.message.includes('required when configuring')) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  res.json({ success: true, data: { branchId: req.params.id, keyId: normalizedKeyId, configured: true } });
}));
module.exports = router;
