const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { createPasswordSetupLink } = require('../utils/accountWelcome');
const { sendAccountWelcomeEmail } = require('../utils/mailer');

router.get('/', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const result = req.user.role === 'SUPER_ADMIN'
    ? await pool.query(`
        SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.is_active, u.created_at, b.name AS branch_name,
               COALESCE(u.avatar, u.avatar_url) AS avatar, COALESCE(u.avatar_url, u.avatar) AS avatar_url
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        ORDER BY u.created_at DESC
      `)
    : await pool.query(`
        SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.is_active, u.created_at, b.name AS branch_name,
               COALESCE(u.avatar, u.avatar_url) AS avatar, COALESCE(u.avatar_url, u.avatar) AS avatar_url
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.branch_id = $1
        ORDER BY u.created_at DESC
      `, [req.user.branch_id]);

  res.json({ data: result.rows });
}));

router.get('/:id', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.is_active, u.created_at, b.name AS branch_name,
            COALESCE(u.avatar, u.avatar_url) AS avatar, COALESCE(u.avatar_url, u.avatar) AS avatar_url
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });
  res.json({ data: result.rows[0] });
}));

router.post('/', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const { fullName, email, password, role, branchId, branch } = req.body;
  const normalizedName = String(fullName || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !role) {
    return res.status(400).json({ error: 'A full name, valid email and role are required.' });
  }
  const allowed = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN', 'EMPLOYEE', 'CUSTOMER'];
  const normalizedRole = String(role).toUpperCase().replace(/[\s-]+/g, '_');
  if (req.user.role === 'BRANCH_ADMIN' && !['RECEPTION_ADMIN', 'EMPLOYEE', 'CUSTOMER'].includes(normalizedRole)) {
    return res.status(403).json({ error: 'Branch Admin cannot create this role.' });
  }
  if (!allowed.includes(normalizedRole)) return res.status(400).json({ error: 'Invalid role.' });

  let assignedBranch = req.user.role === 'SUPER_ADMIN' ? (branchId || branch || null) : req.user.branch_id;
  if (assignedBranch && !/^[0-9a-f]{8}-/i.test(assignedBranch)) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [assignedBranch]);
    assignedBranch = bRes.rows[0]?.id || null;
  }
  if (normalizedRole !== 'SUPER_ADMIN' && !assignedBranch) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    assignedBranch = bRes.rows[0]?.id || null;
  }

  const pass = password || crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hash(pass, 12);
  const client = await pool.connect();
  let createdUser;
  let passwordSetupUrl;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users(full_name, email, password_hash, role, branch_id)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role, branch_id, is_active, created_at`,
      [normalizedName, normalizedEmail, hash, normalizedRole, assignedBranch]
    );
    createdUser = result.rows[0];

    if (normalizedRole === 'CUSTOMER') {
      await client.query(
        `INSERT INTO customers(user_id, branch_id, full_name, email, phone, company_name)
         VALUES($1, $2, $3, $4, $5, $6)`,
        [createdUser.id, assignedBranch, normalizedName, normalizedEmail, req.body.phone || null, req.body.companyName || null]
      );
    }

    passwordSetupUrl = await createPasswordSetupLink(client, createdUser.id);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const emailResult = await sendAccountWelcomeEmail({
    email: createdUser.email,
    userName: createdUser.full_name,
    userId: createdUser.email,
    role: createdUser.role,
    loginUrl: `${frontendUrl}/`,
    passwordSetupUrl,
  });
  res.status(201).json({
    data: {
      ...createdUser,
      welcomeEmail: {
        sent: Boolean(emailResult.success && !emailResult.isMock),
        simulated: Boolean(emailResult.isMock && process.env.NODE_ENV !== 'production'),
      },
    },
  });
}));

router.patch('/:id/status', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  let active;
  if (typeof req.body.isActive === 'boolean') {
    active = req.body.isActive;
  } else if (typeof req.body.status === 'string') {
    active = req.body.status.toLowerCase() === 'active';
  } else {
    active = Boolean(req.body.active);
  }

  const result = await pool.query(
    'UPDATE users SET is_active=$2, updated_at=NOW() WHERE id=$1 RETURNING id, full_name, email, role, branch_id, is_active',
    [req.params.id, active]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });

  const userRes = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.is_active, u.created_at, b.name AS branch_name
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1`,
    [req.params.id]
  );
  res.json({ data: userRes.rows[0] || result.rows[0] });
}));

router.patch('/:id', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const { fullName, name, email, role, branchId, branch, status, isActive, avatar, avatarUrl } = req.body;
  const fName = fullName || name;
  const avatarProvided = avatar !== undefined || avatarUrl !== undefined;
  const newAvatar = avatar !== undefined ? avatar : (avatarUrl !== undefined ? avatarUrl : null);

  // Role validation and authorization
  let normRole = null;
  if (role) {
    normRole = String(role).toUpperCase().replace(/[\s-]+/g, '_');
    const allowedRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN', 'EMPLOYEE', 'CUSTOMER'];
    if (!allowedRoles.includes(normRole)) {
      return res.status(400).json({ error: `Invalid role: ${role}. Allowed roles: ${allowedRoles.join(', ')}` });
    }
    // Only Super Admin can change roles
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Super Admin can edit and change user roles.' });
    }
  }

  // Branch resolution
  let resolvedBranchId = null;
  const branchInput = branchId || branch;
  if (branchInput) {
    if (String(branchInput).toLowerCase() === 'all branches' || String(branchInput).toLowerCase() === 'all') {
      resolvedBranchId = null;
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchInput)) {
      resolvedBranchId = branchInput;
    } else {
      const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [branchInput]);
      if (bRes.rowCount) resolvedBranchId = bRes.rows[0].id;
    }
  }

  let activeVal = null;
  if (typeof isActive === 'boolean') activeVal = isActive;
  else if (typeof status === 'string') activeVal = status.toLowerCase() === 'active';

  const updateResult = await pool.query(
    `UPDATE users
     SET full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         role = COALESCE($4, role),
         branch_id = CASE
           WHEN $5::boolean THEN $6
           ELSE branch_id
         END,
         is_active = COALESCE($7, is_active),
         avatar = CASE WHEN $8::boolean THEN $9 ELSE avatar END,
         avatar_url = CASE WHEN $8::boolean THEN $9 ELSE avatar_url END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, email, role, branch_id, is_active, avatar, avatar_url`,
    [
      req.params.id,
      fName ? fName.trim() : null,
      email ? email.trim().toLowerCase() : null,
      normRole,
      Boolean(branchInput !== undefined),
      resolvedBranchId,
      activeVal,
      avatarProvided,
      newAvatar ? String(newAvatar).trim() : null
    ]
  );

  if (!updateResult.rowCount) return res.status(404).json({ error: 'User not found.' });

  const updatedUser = updateResult.rows[0];

  // If role was updated to CUSTOMER, ensure customer record exists
  if (updatedUser.role === 'CUSTOMER') {
    await pool.query(
      `INSERT INTO customers(user_id, branch_id, full_name, email)
       VALUES($1, $2, $3, $4)
       ON CONFLICT(user_id) DO UPDATE
       SET full_name = EXCLUDED.full_name, branch_id = COALESCE(EXCLUDED.branch_id, customers.branch_id)`,
      [updatedUser.id, updatedUser.branch_id, updatedUser.full_name, updatedUser.email]
    );
  }

  // Fetch full details with branch name
  const fullRes = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.is_active, u.created_at, b.name AS branch_name,
            COALESCE(u.avatar, u.avatar_url) AS avatar, COALESCE(u.avatar_url, u.avatar) AS avatar_url
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1`,
    [req.params.id]
  );

  res.json({ data: fullRes.rows[0] || updatedUser });
}));

router.delete('/:id', allowRoles('SUPER_ADMIN'), ah(async (req, res) => {
  const { id } = req.params;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const existing = await pool.query('SELECT id, email, role, full_name FROM users WHERE id = $1', [id]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const targetUser = existing.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clean up OTP records
    await client.query('DELETE FROM email_otps WHERE LOWER(email) = LOWER($1)', [targetUser.email]).catch(() => {});

    // Nullify references in audit/management tables
    await client.query('UPDATE customers SET user_id = NULL WHERE user_id = $1', [id]).catch(() => {});
    await client.query('UPDATE bookings SET created_by = NULL WHERE created_by = $1', [id]).catch(() => {});
    await client.query('UPDATE quotations SET created_by = NULL WHERE created_by = $1', [id]).catch(() => {});
    await client.query('UPDATE complaints SET created_by = NULL WHERE created_by = $1', [id]).catch(() => {});
    await client.query('UPDATE complaints SET assigned_to = NULL WHERE assigned_to = $1', [id]).catch(() => {});
    await client.query('UPDATE agreements SET created_by = NULL WHERE created_by = $1', [id]).catch(() => {});
    await client.query('UPDATE expenses SET created_by = NULL WHERE created_by = $1', [id]).catch(() => {});
    await client.query('UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = $1', [id]).catch(() => {});
    await client.query('UPDATE documents SET reviewed_by = NULL WHERE reviewed_by = $1', [id]).catch(() => {});
    await client.query('UPDATE settings SET updated_by = NULL WHERE updated_by = $1', [id]).catch(() => {});
    await client.query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [id]).catch(() => {});
    await client.query('UPDATE leaves SET approved_by = NULL WHERE approved_by = $1', [id]).catch(() => {});

    // Delete dependent tables
    await client.query('DELETE FROM notifications WHERE user_id = $1', [id]).catch(() => {});
    await client.query('DELETE FROM attendance WHERE user_id = $1', [id]).catch(() => {});
    await client.query('DELETE FROM leaves WHERE user_id = $1', [id]).catch(() => {});
    await client.query('DELETE FROM payroll WHERE user_id = $1', [id]).catch(() => {});
    await client.query('DELETE FROM documents WHERE user_id = $1', [id]).catch(() => {});

    // Delete user
    await client.query('DELETE FROM users WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true, message: `User "${targetUser.full_name}" has been deleted.`, id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
