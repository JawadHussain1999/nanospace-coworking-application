const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { generateAgreementPdf } = require('../utils/pdfHelper');
const staffRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'];

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT ag.*, c.full_name AS customer_name, c.company_name, c.email AS customer_email,
                    w.name AS workspace_name, b.name AS branch_name
             FROM agreements ag
             JOIN customers c ON c.id = ag.customer_id
             LEFT JOIN workspaces w ON w.id = ag.workspace_id
             LEFT JOIN branches b ON b.id = ag.branch_id
             WHERE 1=1`;

  if (u.role === 'CUSTOMER') {
    p.push(u.id);
    sql += ` AND c.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND ag.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY ag.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    customer: r.customer_name,
    branch: r.branch_name,
    date: r.start_date ? String(r.start_date).slice(0, 10) : '',
    amount: `₹${Number(r.contract_value || 0).toLocaleString('en-IN')}`,
  }));

  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT ag.*, c.full_name AS customer_name, c.company_name, c.email AS customer_email, b.name AS branch_name
     FROM agreements ag
     JOIN customers c ON c.id = ag.customer_id
     LEFT JOIN branches b ON b.id = ag.branch_id
     WHERE ag.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Agreement not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      customer: r.customer_name,
      branch: r.branch_name,
      date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      amount: `₹${Number(r.contract_value || 0).toLocaleString('en-IN')}`,
    }
  });
}));

router.get('/:id/pdf', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT ag.*, c.full_name AS customer_name, c.company_name, c.email AS customer_email, b.name AS branch_name
     FROM agreements ag
     JOIN customers c ON c.id = ag.customer_id
     LEFT JOIN branches b ON b.id = ag.branch_id
     WHERE ag.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Agreement not found.' });
  const pdfBuffer = await generateAgreementPdf(result.rows[0]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=agreement-${result.rows[0].agreement_number || req.params.id}.pdf`);
  res.send(pdfBuffer);
}));

router.post('/', allowRoles(...staffRoles), ah(async (req, res) => {
  const u = req.user;
  const { customerId, customer, branchId, branch, workspaceId, startDate, date, endDate, contractValue, amount, depositAmount, status = 'ACTIVE', terms } = req.body;

  let branchResolved = u.role === 'SUPER_ADMIN' ? (branchId || branch) : u.branch_id;
  if (branchResolved && !/^[0-9a-f]{8}-/i.test(branchResolved)) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [branchResolved]);
    branchResolved = bRes.rows[0]?.id || u.branch_id;
  }
  if (!branchResolved) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branchResolved = bRes.rows[0]?.id;
  }

  let custId = customerId;
  if (!custId || !/^[0-9a-f]{8}-/i.test(custId)) {
    const cRes = await pool.query('SELECT id FROM customers WHERE full_name ILIKE $1 OR email ILIKE $1 LIMIT 1', [customer || '']);
    custId = cRes.rows[0]?.id;
  }
  if (!custId) {
    const cRes = await pool.query('SELECT id FROM customers LIMIT 1');
    custId = cRes.rows[0]?.id;
  }

  const sDate = startDate || date || new Date().toISOString().slice(0, 10);
  const val = Number(contractValue || (typeof amount === 'string' ? amount.replace(/[^\d.]/g, '') : amount) || 100000);
  const num = `AG-${Math.floor(100 + Math.random() * 900)}`;

  const result = await pool.query(
    `INSERT INTO agreements(agreement_number, customer_id, branch_id, workspace_id, start_date, end_date, contract_value, deposit_amount, status, terms, created_by)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [num, custId, branchResolved, workspaceId || null, sDate, endDate || null, val, Number(depositAmount) || 0, String(status).toUpperCase(), terms || null, u.id]
  );

  res.status(201).json({ data: result.rows[0] });
}));

router.patch('/:id/status', allowRoles(...staffRoles), ah(async (req, res) => {
  const { status } = req.body;
  const normalized = String(status).toUpperCase();
  const result = await pool.query(
    `UPDATE agreements SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [req.params.id, normalized]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Agreement not found.' });
  res.json({ data: result.rows[0] });
}));

router.patch('/:id', allowRoles(...staffRoles), ah(async (req, res) => {
  const { contractValue, amount, depositAmount, startDate, endDate, status, terms } = req.body;
  const val = contractValue || (amount ? Number(String(amount).replace(/[^\d.]/g, '')) : null);
  const result = await pool.query(
    `UPDATE agreements
     SET contract_value=COALESCE($2, contract_value),
         deposit_amount=COALESCE($3, deposit_amount),
         start_date=COALESCE($4, start_date),
         end_date=COALESCE($5, end_date),
         status=COALESCE($6, status),
         terms=COALESCE($7, terms),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [req.params.id, val, depositAmount, startDate, endDate, status ? String(status).toUpperCase() : null, terms]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Agreement not found.' });
  res.json({ data: result.rows[0] });
}));

module.exports = router;
