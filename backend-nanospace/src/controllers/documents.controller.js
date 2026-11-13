const router = require('express').Router();
const multer = require('multer');
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT d.id, d.customer_id, d.user_id, d.branch_id, d.document_type, d.file_name,
                    d.mime_type, d.file_size, d.status, d.created_at, d.reviewed_at,
                    c.full_name AS customer_name, c.email AS customer_email,
                    u.full_name AS employee_name, u.email AS employee_email,
                    b.name AS branch_name
             FROM documents d
             LEFT JOIN customers c ON c.id = d.customer_id
             LEFT JOIN users u ON u.id = d.user_id
             LEFT JOIN branches b ON b.id = d.branch_id
             WHERE 1=1`;

  if (u.role === 'CUSTOMER') {
    p.push(u.id);
    sql += ` AND (c.user_id=$${p.length} OR d.user_id=$${p.length})`;
  } else if (u.role === 'EMPLOYEE') {
    p.push(u.id);
    sql += ` AND d.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND d.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY d.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    fileName: r.file_name,
    size: r.file_size,
    documentType: r.document_type,
    customerName: r.customer_name || r.employee_name,
    customerEmail: r.customer_email || r.employee_email,
    branch: r.branch_name,
    uploadedAt: r.created_at,
  }));

  res.json({ data: rows });
}));

router.get('/customer/:id', ah(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `SELECT d.id, d.customer_id, d.user_id, d.branch_id, d.document_type, d.file_name,
            d.mime_type, d.file_size, d.status, d.created_at,
            c.full_name AS customer_name, c.email AS customer_email, b.name AS branch_name
     FROM documents d
     LEFT JOIN customers c ON c.id = d.customer_id
     LEFT JOIN branches b ON b.id = d.branch_id
     WHERE d.customer_id::text = $1 OR c.user_id::text = $1 OR c.email = $1
     ORDER BY d.created_at DESC`,
    [id]
  );
  const rows = result.rows.map(r => ({
    ...r,
    fileName: r.file_name,
    size: r.file_size,
    documentType: r.document_type,
    customerName: r.customer_name,
    branch: r.branch_name,
    uploadedAt: r.created_at,
  }));
  res.json({ data: rows });
}));

router.get('/employee/:id', ah(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `SELECT d.id, d.customer_id, d.user_id, d.branch_id, d.document_type, d.file_name,
            d.mime_type, d.file_size, d.status, d.created_at,
            u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
     FROM documents d
     LEFT JOIN users u ON u.id = d.user_id
     LEFT JOIN branches b ON b.id = d.branch_id
     WHERE d.user_id::text = $1 OR u.email = $1
     ORDER BY d.created_at DESC`,
    [id]
  );
  const rows = result.rows.map(r => ({
    ...r,
    fileName: r.file_name,
    size: r.file_size,
    documentType: r.document_type,
    customerName: r.employee_name,
    branch: r.branch_name,
    uploadedAt: r.created_at,
  }));
  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Document not found.' });
  const doc = result.rows[0];

  // If client wants file download / blob
  if (req.headers.accept?.includes('application/pdf') || req.headers.accept?.includes('image/') || req.query.download === 'true') {
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
    return res.send(doc.file_data || Buffer.from(''));
  }

  res.json({
    data: {
      ...doc,
      fileName: doc.file_name,
      size: doc.file_size,
      documentType: doc.document_type,
      uploadedAt: doc.created_at,
    }
  });
}));

router.post('/upload', upload.single('file'), ah(async (req, res) => {
  const u = req.user;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'A file is required for document upload.' });

  const { customerId, employeeId, documentType, branch } = req.body;
  let branchId = u.branch_id;
  if (branch) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [branch]);
    if (bRes.rowCount) branchId = bRes.rows[0].id;
  }
  if (!branchId) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branchId = bRes.rows[0]?.id;
  }

  let custId = null;
  let targetUserId = null;

  if (customerId) {
    const cRes = await pool.query('SELECT id, branch_id FROM customers WHERE id::text = $1 OR email = $1 LIMIT 1', [customerId]);
    if (cRes.rowCount) {
      custId = cRes.rows[0].id;
      if (!branchId) branchId = cRes.rows[0].branch_id;
    }
  }

  if (employeeId || u.role === 'EMPLOYEE') {
    targetUserId = employeeId || u.id;
  }

  if (u.role === 'CUSTOMER' && !custId) {
    const cRes = await pool.query('SELECT id, branch_id FROM customers WHERE user_id = $1 LIMIT 1', [u.id]);
    if (cRes.rowCount) {
      custId = cRes.rows[0].id;
      branchId = cRes.rows[0].branch_id;
    }
  }

  const result = await pool.query(
    `INSERT INTO documents(customer_id, user_id, branch_id, document_type, file_name, mime_type, file_size, file_data, status, uploaded_by)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
     RETURNING id, customer_id, user_id, branch_id, document_type, file_name, mime_type, file_size, status, created_at`,
    [custId, targetUserId, branchId, documentType || 'Other', file.originalname, file.mimetype, file.size, file.buffer, u.id]
  );

  res.status(201).json({ data: result.rows[0] });
}));

router.patch('/:id/status', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'), ah(async (req, res) => {
  const status = typeof req.body?.status === 'string' ? req.body.status.trim().toUpperCase() : '';
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Document status must be APPROVED or REJECTED.' });
  }

  const params = [req.params.id, status, req.user.id];
  let sql = `UPDATE documents
             SET status=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW()
             WHERE id=$1`;
  if (req.user.role !== 'SUPER_ADMIN') {
    params.push(req.user.branch_id);
    sql += ` AND branch_id=$${params.length}`;
  }
  sql += ' RETURNING id, document_type, file_name, status, reviewed_at';

  const result = await pool.query(sql, params);
  if (!result.rowCount) return res.status(404).json({ error: 'Document not found.' });
  res.json({ data: result.rows[0] });
}));

router.delete('/:id', ah(async (req, res) => {
  const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Document not found.' });
  res.json({ success: true, message: 'Document deleted.' });
}));

module.exports = router;
