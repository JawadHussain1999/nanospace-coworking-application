const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { generateInvoicePdf } = require('../utils/pdfHelper');
const staffRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'];

function formatDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT inv.*, c.full_name AS customer_name, c.company_name, c.email AS customer_email, b.name AS branch_name
             FROM invoices inv
             JOIN customers c ON c.id = inv.customer_id
             LEFT JOIN branches b ON b.id = inv.branch_id
             WHERE 1=1`;

  if (u.role === 'CUSTOMER') {
    p.push(u.id);
    sql += ` AND c.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND inv.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY inv.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    id: r.invoice_number || r.id,
    _id: r.id,
    customer: r.customer_name,
    branch: r.branch_name,
    date: formatDateOnly(r.issue_date),
    issued_at: r.created_at,
    amount: `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`,
  }));

  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT inv.*, c.full_name AS customer_name, c.company_name, c.email AS customer_email, b.name AS branch_name
     FROM invoices inv
     JOIN customers c ON c.id = inv.customer_id
     LEFT JOIN branches b ON b.id = inv.branch_id
     WHERE (inv.id::text = $1 OR inv.invoice_number = $1)
       AND (
         $2 = 'SUPER_ADMIN'
         OR ($2 = 'CUSTOMER' AND c.user_id = $3)
         OR ($2 NOT IN ('SUPER_ADMIN', 'CUSTOMER') AND inv.branch_id = $4)
       )`,
    [req.params.id, req.user.role, req.user.id, req.user.branch_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Invoice not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      id: r.invoice_number || r.id,
      _id: r.id,
      customer: r.customer_name,
      branch: r.branch_name,
      date: formatDateOnly(r.issue_date),
      issued_at: r.created_at,
      amount: `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`,
    }
  });
}));

router.get('/:id/pdf', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT inv.*, c.full_name AS customer_name, c.company_name, c.email AS customer_email, b.name AS branch_name
     FROM invoices inv
     JOIN customers c ON c.id = inv.customer_id
     LEFT JOIN branches b ON b.id = inv.branch_id
     WHERE (inv.id::text = $1 OR inv.invoice_number = $1)
       AND (
         $2 = 'SUPER_ADMIN'
         OR ($2 = 'CUSTOMER' AND c.user_id = $3)
         OR ($2 NOT IN ('SUPER_ADMIN', 'CUSTOMER') AND inv.branch_id = $4)
       )`,
    [req.params.id, req.user.role, req.user.id, req.user.branch_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Invoice not found.' });
  const invoice = result.rows[0];
  const pdfBuffer = await generateInvoicePdf(invoice);
  const filename = String(invoice.invoice_number || req.params.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${filename}.pdf"`);
  res.send(pdfBuffer);
}));

router.post('/', allowRoles(...staffRoles), ah(async (req, res) => {
  const u = req.user;
  const { customerId, customer, branchId, branch, dueDate, date, totalAmount, amount, status = 'PENDING', notes } = req.body;

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

  const dDate = dueDate || date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const total = Number(totalAmount || (typeof amount === 'string' ? amount.replace(/[^\d.]/g, '') : amount) || 8500);
  const subtotal = Number((total / 1.18).toFixed(2));
  const tax = Number((total - subtotal).toFixed(2));
  const num = `INV-${Math.floor(100 + Math.random() * 900)}`;

  const result = await pool.query(
    `INSERT INTO invoices(invoice_number, customer_id, branch_id, issue_date, due_date, subtotal, tax_amount, total_amount, paid_amount, status, notes)
     VALUES($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, 0, $8, $9)
     RETURNING *`,
    [num, custId, branchResolved, dDate, subtotal, tax, total, String(status).toUpperCase(), notes || null]
  );

  res.status(201).json({
    data: {
      ...result.rows[0],
      id: result.rows[0].invoice_number,
      amount: `₹${total.toLocaleString('en-IN')}`,
    }
  });
}));

router.patch('/:id', allowRoles(...staffRoles), ah(async (req, res) => {
  const { status, totalAmount, amount, dueDate, notes } = req.body;
  const val = totalAmount || (amount ? Number(String(amount).replace(/[^\d.]/g, '')) : null);
  const result = await pool.query(
    `UPDATE invoices
     SET status=COALESCE($2, status),
         total_amount=COALESCE($3, total_amount),
         due_date=COALESCE($4, due_date),
         notes=COALESCE($5, notes),
         updated_at=NOW()
     WHERE id::text = $1 OR invoice_number = $1
     RETURNING *`,
    [req.params.id, status ? String(status).toUpperCase() : null, val, dueDate, notes]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ data: result.rows[0] });
}));

module.exports = router;
