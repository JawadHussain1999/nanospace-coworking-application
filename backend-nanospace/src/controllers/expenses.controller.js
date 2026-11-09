const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const staffRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT ex.*, b.name AS branch_name
             FROM expenses ex
             LEFT JOIN branches b ON b.id = ex.branch_id
             WHERE 1=1`;

  if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND ex.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY ex.expense_date DESC, ex.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    id: r.expense_number || r.id,
    _id: r.id,
    branch: r.branch_name,
    date: r.expense_date ? String(r.expense_date).slice(0, 10) : '',
    amount: `₹${Number(r.amount || 0).toLocaleString('en-IN')}`,
  }));

  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT ex.*, b.name AS branch_name
     FROM expenses ex
     LEFT JOIN branches b ON b.id = ex.branch_id
     WHERE ex.id::text = $1 OR ex.expense_number = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Expense record not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      id: r.expense_number || r.id,
      _id: r.id,
      branch: r.branch_name,
      date: r.expense_date ? String(r.expense_date).slice(0, 10) : '',
      amount: `₹${Number(r.amount || 0).toLocaleString('en-IN')}`,
    }
  });
}));

router.post('/', allowRoles(...staffRoles), ah(async (req, res) => {
  const u = req.user;
  const { category, branchId, branch, amount, date, expenseDate, vendor, status = 'COMPLETED', notes } = req.body;

  let branchResolved = u.role === 'SUPER_ADMIN' ? (branchId || branch) : u.branch_id;
  if (branchResolved && !/^[0-9a-f]{8}-/i.test(branchResolved)) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [branchResolved]);
    branchResolved = bRes.rows[0]?.id || u.branch_id;
  }
  if (!branchResolved) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branchResolved = bRes.rows[0]?.id;
  }

  const expDate = expenseDate || date || new Date().toISOString().slice(0, 10);
  const expAmount = Number(typeof amount === 'string' ? amount.replace(/[^\d.]/g, '') : amount) || 0;
  const num = `EX-${Math.floor(100 + Math.random() * 900)}`;

  const result = await pool.query(
    `INSERT INTO expenses(expense_number, branch_id, category, expense_date, amount, vendor, status, notes, created_by)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [num, branchResolved, category || 'Office Supplies', expDate, expAmount, vendor || null, String(status).toUpperCase(), notes || null, u.id]
  );

  res.status(201).json({
    data: {
      ...result.rows[0],
      id: result.rows[0].expense_number,
      amount: `₹${expAmount.toLocaleString('en-IN')}`,
    }
  });
}));

router.patch('/:id', allowRoles(...staffRoles), ah(async (req, res) => {
  const { category, amount, status, notes, vendor } = req.body;
  const val = amount ? Number(String(amount).replace(/[^\d.]/g, '')) : null;
  const result = await pool.query(
    `UPDATE expenses
     SET category=COALESCE($2, category),
         amount=COALESCE($3, amount),
         status=COALESCE($4, status),
         vendor=COALESCE($5, vendor),
         notes=COALESCE($6, notes),
         updated_at=NOW()
     WHERE id::text = $1 OR expense_number = $1
     RETURNING *`,
    [req.params.id, category, val, status ? String(status).toUpperCase() : null, vendor, notes]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Expense record not found.' });
  res.json({ data: result.rows[0] });
}));

router.delete('/:id', allowRoles(...staffRoles), ah(async (req, res) => {
  const result = await pool.query(
    `DELETE FROM expenses WHERE id::text = $1 OR expense_number = $1 RETURNING id`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Expense record not found.' });
  res.json({ success: true, message: 'Expense record deleted.' });
}));

module.exports = router;
