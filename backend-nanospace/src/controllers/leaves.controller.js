const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const staffRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'];

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT l.*, u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
             FROM leaves l
             JOIN users u ON u.id = l.user_id
             LEFT JOIN branches b ON b.id = l.branch_id
             WHERE 1=1`;

  if (u.role === 'EMPLOYEE') {
    p.push(u.id);
    sql += ` AND l.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND l.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY l.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    name: r.employee_name,
    email: r.employee_email,
    branch: r.branch_name,
    type: r.leave_type,
    dates: r.start_date === r.end_date ? String(r.start_date).slice(0, 10) : `${String(r.start_date).slice(0, 10)} to ${String(r.end_date).slice(0, 10)}`,
  }));

  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT l.*, u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
     FROM leaves l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN branches b ON b.id = l.branch_id
     WHERE l.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Leave request not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      name: r.employee_name,
      email: r.employee_email,
      branch: r.branch_name,
      type: r.leave_type,
      dates: r.start_date === r.end_date ? String(r.start_date).slice(0, 10) : `${String(r.start_date).slice(0, 10)} to ${String(r.end_date).slice(0, 10)}`,
    }
  });
}));

router.post('/', ah(async (req, res) => {
  const u = req.user;
  const { leaveType, type, startDate, start, endDate, end, days = 1, reason, dates } = req.body;
  const lType = leaveType || type || 'Casual Leave';
  const sDate = startDate || start || (dates ? dates.split(' to ')[0] : new Date().toISOString().slice(0, 10));
  const eDate = endDate || end || (dates ? dates.split(' to ')[1] || sDate : sDate);
  const branchId = u.branch_id || (await pool.query('SELECT id FROM branches LIMIT 1')).rows[0]?.id;

  const result = await pool.query(
    `INSERT INTO leaves(user_id, branch_id, leave_type, start_date, end_date, days, reason, status)
     VALUES($1, $2, $3, $4, $5, $6, $7, 'PENDING')
     RETURNING *`,
    [u.id, branchId, lType, sDate, eDate, Number(days) || 1, reason || 'Leave requested by employee']
  );

  res.status(201).json({
    data: {
      ...result.rows[0],
      name: u.full_name,
      email: u.email,
      type: result.rows[0].leave_type,
      dates: sDate === eDate ? String(sDate).slice(0, 10) : `${String(sDate).slice(0, 10)} to ${String(eDate).slice(0, 10)}`,
    }
  });
}));

router.patch('/:id/status', allowRoles(...staffRoles), ah(async (req, res) => {
  const { status } = req.body;
  const normalized = String(status).toUpperCase();
  const valid = ['PENDING', 'ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED'];
  if (!valid.includes(normalized)) return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });

  const result = await pool.query(
    `UPDATE leaves
     SET status=$2, approved_by=$3, updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [req.params.id, normalized, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Leave request not found.' });
  res.json({ data: result.rows[0] });
}));

router.patch('/:id', ah(async (req, res) => {
  const { leaveType, type, startDate, endDate, days, reason, status } = req.body;
  const lType = leaveType || type;
  const normalizedStatus = status ? String(status).toUpperCase() : null;

  const result = await pool.query(
    `UPDATE leaves
     SET leave_type=COALESCE($2, leave_type),
         start_date=COALESCE($3, start_date),
         end_date=COALESCE($4, end_date),
         days=COALESCE($5, days),
         reason=COALESCE($6, reason),
         status=COALESCE($7, status),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [req.params.id, lType || null, startDate || null, endDate || null, days || null, reason || null, normalizedStatus]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Leave request not found.' });
  res.json({ data: result.rows[0] });
}));

router.delete('/:id', ah(async (req, res) => {
  const u = req.user;
  const p = [req.params.id];
  let sql = 'DELETE FROM leaves WHERE id=$1';
  if (u.role === 'EMPLOYEE') {
    p.push(u.id);
    sql += ` AND user_id=$2 AND status='PENDING'`;
  }
  const result = await pool.query(sql, p);
  if (!result.rowCount) return res.status(404).json({ error: 'Leave request not found or cannot be deleted.' });
  res.json({ success: true, message: 'Leave request deleted.' });
}));

module.exports = router;
