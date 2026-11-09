const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');

router.get('/', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email, b.name AS branch_name
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             LEFT JOIN branches b ON b.id = al.branch_id
             WHERE 1=1`;

  if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND al.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY al.created_at DESC LIMIT 100';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    actor: r.actor_name || r.actor_email || 'System',
    branch: r.branch_name || 'All branches',
    createdAt: r.created_at,
  }));

  res.json({ data: rows });
}));

router.get('/:id', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const result = await pool.query(
    `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email, b.name AS branch_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN branches b ON b.id = al.branch_id
     WHERE al.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Audit log record not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      actor: r.actor_name || r.actor_email || 'System',
      branch: r.branch_name || 'All branches',
      createdAt: r.created_at,
    }
  });
}));

module.exports = router;
