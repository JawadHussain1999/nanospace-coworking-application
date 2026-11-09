const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');

router.get('/', ah(async (req, res) => {
  const { role, id, branch_id } = req.user;
  const p = [];
  let sql = `SELECT c.*, b.name AS branch_name,
                    COALESCE((SELECT SUM(bk.advance_amount) FROM bookings bk WHERE bk.customer_id = c.id AND bk.status != 'CANCELLED'), 0) AS advance_amount
             FROM customers c
             LEFT JOIN branches b ON b.id = c.branch_id
             WHERE 1=1`;

  if (role === 'CUSTOMER') {
    p.push(id);
    sql += ` AND c.user_id = $${p.length}`;
  } else if (role !== 'SUPER_ADMIN') {
    p.push(branch_id);
    sql += ` AND c.branch_id = $${p.length}`;
  } else if (req.query.branch && req.query.branch.toLowerCase() !== 'all branches') {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.query.branch]);
    if (bRes.rowCount) {
      p.push(bRes.rows[0].id);
      sql += ` AND c.branch_id = $${p.length}`;
    }
  }

  sql += ' ORDER BY c.created_at DESC';
  const result = await pool.query(sql, p);
  res.json({ data: result.rows });
}));

router.get('/:id/documents', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT d.*, b.name AS branch_name
     FROM documents d
     LEFT JOIN branches b ON b.id = d.branch_id
     WHERE d.customer_id::text = $1
     ORDER BY d.created_at DESC`,
    [req.params.id]
  );
  res.json({ data: result.rows });
}));

router.post('/', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'), ah(async (req, res) => {
  const { fullName, email, phone, companyName, gstin, panNumber, branchId, branch } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim();
  const normalizedGstin = gstin === undefined ? null : String(gstin).trim().toUpperCase();
  const normalizedPan = panNumber === undefined ? null : String(panNumber).trim().toUpperCase();
  if (!String(fullName || '').trim()) return res.status(400).json({ error: 'Customer name is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'A valid customer email address is required.' });
  }
  if (!normalizedPhone) return res.status(400).json({ error: 'A customer phone number is required.' });
  if (normalizedGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizedGstin)) {
    return res.status(400).json({ error: 'Please enter a valid 15-character GSTIN.' });
  }
  if (normalizedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
    return res.status(400).json({ error: 'Please enter a valid 10-character PAN number.' });
  }

  let assignedBranch = req.user.role === 'SUPER_ADMIN' ? (branchId || branch) : req.user.branch_id;
  if (assignedBranch && !/^[0-9a-f]{8}-/i.test(assignedBranch)) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [assignedBranch]);
    assignedBranch = bRes.rows[0]?.id || req.user.branch_id;
  }
  if (!assignedBranch) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    assignedBranch = bRes.rows[0]?.id;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let userId = null;
    if (req.user.role === 'SUPER_ADMIN') {
      const passwordHash = await bcrypt.hash('nanospace123', 12);
      const userResult = await client.query(
        `INSERT INTO users(full_name, email, password_hash, role, branch_id)
         VALUES($1, $2, $3, 'CUSTOMER', $4)
         RETURNING id`,
        [fullName.trim(), normalizedEmail, passwordHash, assignedBranch]
      );
      userId = userResult.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO customers(user_id, branch_id, full_name, email, phone, company_name, gstin, pan_number, plan, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'Dedicated Member', 'ACTIVE') RETURNING *`,
      [userId, assignedBranch, fullName.trim(), normalizedEmail, normalizedPhone, companyName || null, normalizedGstin, normalizedPan]
    );
    await client.query('COMMIT');
    res.status(201).json({
      data: result.rows[0],
      ...(userId ? { loginCreated: true } : {}),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/:id', ah(async (req, res) => {
  const { role, id, branch_id } = req.user;
  const p = [req.params.id];
  let sql = `SELECT c.*, b.name AS branch_name
             FROM customers c
             LEFT JOIN branches b ON b.id = c.branch_id
             WHERE c.id = $1`;

  if (role === 'CUSTOMER') {
    p.push(id);
    sql += ` AND c.user_id = $${p.length}`;
  } else if (role !== 'SUPER_ADMIN') {
    p.push(branch_id);
    sql += ` AND c.branch_id = $${p.length}`;
  }

  const result = await pool.query(sql, p);
  if (!result.rowCount) return res.status(404).json({ error: 'Customer not found.' });
  res.json({ data: result.rows[0] });
}));

router.patch('/:id', ah(async (req, res) => {
  const { role, id, branch_id } = req.user;
  const { fullName, email, phone, companyName, gstin, panNumber, address, plan, status } = req.body;
  const statusVal = status !== undefined ? String(status).trim().toUpperCase() : null;
  const normalizedGstin = gstin === undefined ? undefined : String(gstin).trim().toUpperCase();
  const normalizedPan = panNumber === undefined ? undefined : String(panNumber).trim().toUpperCase();
  if (normalizedGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizedGstin)) {
    return res.status(400).json({ error: 'Please enter a valid 15-character GSTIN.' });
  }
  if (normalizedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
    return res.status(400).json({ error: 'Please enter a valid 10-character PAN number.' });
  }
  const result = role === 'SUPER_ADMIN'
    ? await pool.query(
          `UPDATE customers
           SET full_name=COALESCE($2, full_name),
               email=COALESCE($3, email),
               phone=COALESCE($4, phone),
               company_name=COALESCE($5, company_name),
               gstin=COALESCE($6, gstin),
               pan_number=COALESCE($7, pan_number),
               address=COALESCE($8, address),
               plan=COALESCE($9, plan),
               status=COALESCE($10, status),
               updated_at=NOW()
           WHERE id=$1 RETURNING *`,
          [req.params.id, fullName || null, email || null, phone || null, companyName || null, normalizedGstin ?? null, normalizedPan ?? null, address ?? null, plan || null, statusVal]
        )
    : role === 'CUSTOMER'
        ? await pool.query(
          `UPDATE customers
           SET full_name=COALESCE($3, full_name),
                 email=COALESCE($4, email),
                 phone=COALESCE($5, phone),
                 company_name=COALESCE($6, company_name),
                 gstin=CASE WHEN $7::boolean THEN NULLIF($8, '') ELSE gstin END,
                 pan_number=CASE WHEN $9::boolean THEN NULLIF($10, '') ELSE pan_number END,
                 address=CASE WHEN $11::boolean THEN NULLIF($12, '') ELSE address END,
                 updated_at=NOW()
           WHERE id=$1 AND user_id=$2 RETURNING *`,
            [
              req.params.id, id, fullName || null, email || null, phone || null, companyName || null,
              gstin !== undefined, normalizedGstin ?? null,
              panNumber !== undefined, normalizedPan ?? null,
              address !== undefined, address === undefined ? null : String(address).trim(),
            ]
        )
        : await pool.query(
          `UPDATE customers
           SET full_name=COALESCE($3, full_name),
                 email=COALESCE($4, email),
                 phone=COALESCE($5, phone),
                 company_name=COALESCE($6, company_name),
                 gstin=COALESCE($7, gstin),
                 pan_number=COALESCE($8, pan_number),
                 address=COALESCE($9, address),
                 plan=COALESCE($10, plan),
                 status=COALESCE($11, status),
                 updated_at=NOW()
           WHERE id=$1 AND branch_id=$2 RETURNING *`,
            [req.params.id, branch_id, fullName || null, email || null, phone || null, companyName || null, normalizedGstin ?? null, normalizedPan ?? null, address ?? null, plan || null, statusVal]
        );

  if (!result.rowCount) return res.status(404).json({ error: 'Customer not found.' });
  res.json({ data: result.rows[0] });
}));

module.exports = router;
