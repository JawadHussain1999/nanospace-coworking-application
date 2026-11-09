const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { generatePayslipPdf } = require('../utils/pdfHelper');
const staffRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT pr.*, u.full_name AS employee_name, u.email AS employee_email, u.role, b.name AS branch_name
             FROM payroll pr
             JOIN users u ON u.id = pr.user_id
             LEFT JOIN branches b ON b.id = pr.branch_id
             WHERE 1=1`;

  if (u.role === 'EMPLOYEE') {
    p.push(u.id);
    sql += ` AND pr.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND pr.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY pr.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    name: r.employee_name,
    email: r.employee_email,
    branch: r.branch_name,
    period: r.pay_period,
    amount: `₹${Number(r.net_salary || 0).toLocaleString('en-IN')}`,
    date: r.pay_date ? String(r.pay_date).slice(0, 10) : '',
  }));

  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT pr.*, u.full_name AS employee_name, u.email AS employee_email, u.role, b.name AS branch_name
     FROM payroll pr
     JOIN users u ON u.id = pr.user_id
     LEFT JOIN branches b ON b.id = pr.branch_id
     WHERE pr.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payroll record not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      name: r.employee_name,
      email: r.employee_email,
      branch: r.branch_name,
      period: r.pay_period,
      amount: `₹${Number(r.net_salary || 0).toLocaleString('en-IN')}`,
      date: r.pay_date ? String(r.pay_date).slice(0, 10) : '',
    }
  });
}));

router.get('/:id/payslip', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT pr.*, u.full_name AS employee_name, u.email AS employee_email, u.role, b.name AS branch_name
     FROM payroll pr
     JOIN users u ON u.id = pr.user_id
     LEFT JOIN branches b ON b.id = pr.branch_id
     WHERE pr.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payroll record not found.' });
  const pdfBuffer = await generatePayslipPdf(result.rows[0]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=payslip-${req.params.id}.pdf`);
  res.send(pdfBuffer);
}));

router.post('/', allowRoles(...staffRoles), ah(async (req, res) => {
  const { userId, email, payPeriod, period, basicSalary, allowances = 0, deductions = 0, amount, netSalary, payDate, notes } = req.body;
  const pPeriod = payPeriod || period || 'Oct 2026';
  let targetUser;

  if (userId) {
    const uRes = await pool.query('SELECT id, branch_id FROM users WHERE id=$1', [userId]);
    targetUser = uRes.rows[0];
  } else if (email) {
    const uRes = await pool.query('SELECT id, branch_id FROM users WHERE email=$1', [email.trim().toLowerCase()]);
    targetUser = uRes.rows[0];
  } else {
    // Default to first employee in current branch
    const uRes = await pool.query('SELECT id, branch_id FROM users WHERE role="EMPLOYEE" LIMIT 1');
    targetUser = uRes.rows[0];
  }

  if (!targetUser) return res.status(400).json({ error: 'Valid employee is required for payroll.' });

  const basic = Number(basicSalary || amount || netSalary || 30000);
  const allow = Number(allowances || 0);
  const deduct = Number(deductions || 0);
  const net = Number(netSalary || (basic + allow - deduct));
  const pDate = payDate || new Date().toISOString().slice(0, 10);

  const result = await pool.query(
    `INSERT INTO payroll(user_id, branch_id, pay_period, basic_salary, allowances, deductions, net_salary, pay_date, status, notes)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
     ON CONFLICT(user_id, pay_period) DO UPDATE
     SET basic_salary=EXCLUDED.basic_salary, allowances=EXCLUDED.allowances, deductions=EXCLUDED.deductions,
         net_salary=EXCLUDED.net_salary, pay_date=EXCLUDED.pay_date, notes=EXCLUDED.notes
     RETURNING *`,
    [targetUser.id, targetUser.branch_id, pPeriod, basic, allow, deduct, net, pDate, notes || null]
  );

  res.status(201).json({ data: result.rows[0] });
}));

router.post('/:id/process', allowRoles(...staffRoles), ah(async (req, res) => {
  const result = await pool.query(
    `UPDATE payroll
     SET status='PROCESSED', processed_at=NOW(), updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payroll record not found.' });
  res.json({ data: result.rows[0] });
}));

router.patch('/:id', allowRoles(...staffRoles), ah(async (req, res) => {
  const { basicSalary, allowances, deductions, netSalary, status, payDate, notes } = req.body;
  const result = await pool.query(
    `UPDATE payroll
     SET basic_salary=COALESCE($2, basic_salary),
         allowances=COALESCE($3, allowances),
         deductions=COALESCE($4, deductions),
         net_salary=COALESCE($5, net_salary),
         status=COALESCE($6, status),
         pay_date=COALESCE($7, pay_date),
         notes=COALESCE($8, notes),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [req.params.id, basicSalary, allowances, deductions, netSalary, status ? String(status).toUpperCase() : null, payDate, notes]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payroll record not found.' });
  res.json({ data: result.rows[0] });
}));

module.exports = router;
