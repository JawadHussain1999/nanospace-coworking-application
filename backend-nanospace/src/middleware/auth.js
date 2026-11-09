const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication token is required.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role,
              COALESCE(u.avatar, u.avatar_url) AS avatar,
              COALESCE(u.avatar_url, u.avatar) AS avatar_url,
              COALESCE(u.branch_id, c.branch_id) AS branch_id,
              u.is_active,
              COALESCE(b.name, CASE WHEN u.role = 'SUPER_ADMIN' THEN 'All Branches' ELSE 'Nanakramguda' END) AS branch_name,
              COALESCE(b.name, CASE WHEN u.role = 'SUPER_ADMIN' THEN 'All Branches' ELSE 'Nanakramguda' END) AS branch,
              c.id AS customer_id,
              c.phone,
              c.company_name,
              c.gstin,
              c.pan_number,
              c.address
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
       LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, c.branch_id)
       WHERE u.id = $1`,
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    next(err);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

function assertBranchAccess(user, branchId) {
  if (user.role === 'SUPER_ADMIN') return true;
  return Boolean(user.branch_id && branchId && user.branch_id === branchId);
}

module.exports = { authenticate, allowRoles, assertBranchAccess };
