const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../models/database.model');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountWelcomeEmail,
} = require('../utils/mailer');

const router = express.Router();

// Fallback in-memory OTP cache in case of database connectivity issues
const memOtpStore = new Map();

// Automatically ensure the email_otps table exists on initialization
const authTablesReady = (async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        otp_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash CHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
    `);
    return true;
  } catch (err) {
    console.error('Could not initialize authentication tables:', err.message);
    return false;
  }
})();

// Helper to query unified user details
async function fetchUserByEmail(email) {
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.role,
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
     WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  );
  return result.rows[0];
}

/**
 * 1. Standard Password Login
 * POST /api/auth/login
 */
router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await fetchUserByEmail(email);

  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );

  delete user.password_hash;
  res.json({ token, user });
}));

router.get('/signup/branches', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, code FROM branches WHERE is_active = TRUE ORDER BY name'
  );
  res.json({ data: result.rows });
}));

router.post('/signup', asyncHandler(async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const companyName = String(req.body.companyName || '').trim();
  const branchId = String(req.body.branchId || '').trim();
  const password = String(req.body.password || '');

  if (!fullName || fullName.length > 160) {
    return res.status(400).json({ error: 'Enter your name (up to 160 characters).' });
  }
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!phone || phone.length > 40) {
    return res.status(400).json({ error: 'Enter a phone number (up to 40 characters).' });
  }
  if (companyName.length > 180) {
    return res.status(400).json({ error: 'Company name must be 180 characters or fewer.' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
    return res.status(400).json({ error: 'Select a valid NanoSpace branch.' });
  }
  if (!password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password is required and must be no more than 72 UTF-8 bytes.' });
  }

  const branchResult = await pool.query(
    'SELECT id FROM branches WHERE id = $1 AND is_active = TRUE',
    [branchId]
  );
  if (!branchResult.rowCount) {
    return res.status(400).json({ error: 'That branch is not available for registration.' });
  }

  const existing = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(email) = $1
     UNION ALL
     SELECT 1 FROM customers WHERE LOWER(email) = $1
     LIMIT 1`,
    [email]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: 'An account already exists for this email address.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users(full_name, email, password_hash, role, branch_id)
       VALUES($1, $2, $3, 'CUSTOMER', $4)
       RETURNING id`,
      [fullName, email, passwordHash, branchId]
    );
    await client.query(
      `INSERT INTO customers(user_id, branch_id, full_name, email, phone, company_name)
       VALUES($1, $2, $3, $4, $5, $6)`,
      [userResult.rows[0].id, branchId, fullName, email, phone, companyName || null]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account already exists for this email address.' });
    }
    throw error;
  } finally {
    client.release();
  }

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const emailResult = await sendAccountWelcomeEmail({
    email,
    userName: fullName,
    userId: email,
    role: 'Customer',
    loginUrl: `${frontendUrl}/`,
  });
  res.status(201).json({
    success: true,
    message: 'Your NanoSpace customer account is ready. You can now sign in.',
    welcomeEmail: {
      sent: Boolean(emailResult.success && !emailResult.isMock),
      simulated: Boolean(emailResult.isMock && process.env.NODE_ENV !== 'production'),
    },
  });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  if (!(await authTablesReady)) {
    return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
  }

  const result = await pool.query(
    'SELECT id, full_name FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
    [email]
  );
  const user = result.rows[0];
  const response = {
    success: true,
    message: 'If an active account exists for that email, password reset instructions will be sent.',
  };

  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
      await client.query(
        'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [tokenHash, user.id, expiresAt]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const emailResult = await sendPasswordResetEmail(email, resetUrl, user.full_name);
    if (!emailResult.success) {
      await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
      return res.status(503).json({ error: 'Could not deliver reset instructions. Please try again later.' });
    }

    if (emailResult.isMock && process.env.NODE_ENV !== 'production') {
      response.devResetToken = resetToken;
    }
  }

  res.json(response);
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: 'This password reset link is invalid or has expired. Request a new one.' });
  }
  if (!password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password is required and must be no more than 72 UTF-8 bytes.' });
  }
  if (!(await authTablesReady)) {
    return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenResult = await client.query(
      `SELECT reset_token.user_id, users.email, users.full_name
       FROM password_reset_tokens reset_token
       JOIN users ON users.id = reset_token.user_id
       WHERE reset_token.token_hash = $1 AND reset_token.expires_at > NOW()
       FOR UPDATE OF reset_token`,
      [tokenHash]
    );
    if (!tokenResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This password reset link is invalid or has expired. Request a new one.' });
    }

    const user = tokenResult.rows[0];
    await client.query(
      'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [user.user_id, passwordHash]
    );
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.user_id]);
    await client.query('COMMIT');

    const emailResult = await sendPasswordChangedEmail(user.email, user.full_name);
    if (!emailResult.success) {
      console.error(`Password changed, but security email could not be delivered for user ${user.user_id}:`, emailResult.error || 'Unknown delivery error');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  res.json({ success: true, message: 'Your password has been reset. You can now sign in.' });
}));

/**
 * 2. Send 6-Digit Email OTP
 * POST /api/auth/send-otp
 */
router.post('/send-otp', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const user = await fetchUserByEmail(email);

  if (!user) {
    return res.status(404).json({
      error: 'No account registered with this email address. Please check your spelling or contact your administrator.',
    });
  }

  if (!user.is_active) {
    return res.status(403).json({
      error: 'This account has been deactivated. Please contact your workspace manager.',
    });
  }

  // Generate a cryptographically secure 6-digit numeric OTP code
  const otpCode = String(crypto.randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otpCode, 8);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Persist to DB
  try {
    await pool.query('DELETE FROM email_otps WHERE LOWER(email) = LOWER($1)', [email]);
    await pool.query(
      `INSERT INTO email_otps (email, otp_code, otp_hash, expires_at, attempts)
       VALUES ($1, $2, $3, $4, 0)`,
      [email, otpCode, otpHash, expiresAt]
    );
  } catch (err) {
    console.error('Error saving OTP to PostgreSQL, falling back to memory store:', err.message);
  }

  // In-memory backup
  memOtpStore.set(email, {
    otpCode,
    expiresAt: expiresAt.getTime(),
    attempts: 0,
  });

  // Do not report a successful OTP request unless a real email was accepted.
  const emailResult = await sendOtpEmail(email, otpCode, user.full_name);
  if (!emailResult.success || (emailResult.isMock && process.env.NODE_ENV === 'production')) {
    memOtpStore.delete(email);
    try {
      await pool.query('DELETE FROM email_otps WHERE LOWER(email) = LOWER($1)', [email]);
    } catch (cleanupError) {
      console.error('Could not remove an undeliverable OTP record:', cleanupError.message);
    }
    return res.status(502).json({
      error: 'Verification email could not be delivered. Check the production SMTP configuration and try again.',
    });
  }

  const isDev = process.env.NODE_ENV !== 'production';

  res.json({
    success: true,
    message: `Verification code sent to ${email}`,
    email,
    expiresInSeconds: 600,
    // Provide devOtp during local development / testing so testers can proceed without SMTP delay
    ...(isDev ? { devOtp: otpCode } : {}),
  });
}));

/**
 * 3. Verify OTP & Authenticate
 * POST /api/auth/login-otp
 */
router.post('/login-otp', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
  }

  let valid = false;
  let record = null;

  // 1. Check PostgreSQL DB
  try {
    const dbRes = await pool.query(
      `SELECT * FROM email_otps
       WHERE LOWER(email) = LOWER($1) AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );
    record = dbRes.rows[0];
  } catch (err) {
    console.warn('DB read failed for email_otps:', err.message);
  }

  if (record) {
    if (record.attempts >= 5) {
      await pool.query('DELETE FROM email_otps WHERE id = $1', [record.id]).catch(() => {});
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (record.otp_code === otp || (await bcrypt.compare(otp, record.otp_hash))) {
      valid = true;
      await pool.query('DELETE FROM email_otps WHERE LOWER(email) = LOWER($1)', [email]).catch(() => {});
    } else {
      await pool.query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1', [record.id]).catch(() => {});
      return res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
    }
  } else {
    // Check fallback memory cache
    const memRecord = memOtpStore.get(email);
    if (!memRecord || Date.now() > memRecord.expiresAt) {
      memOtpStore.delete(email);
      return res.status(400).json({ error: 'Verification code has expired or does not exist. Please request a new code.' });
    }

    if (memRecord.attempts >= 5) {
      memOtpStore.delete(email);
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (memRecord.otpCode === otp) {
      valid = true;
      memOtpStore.delete(email);
    } else {
      memRecord.attempts += 1;
      return res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
    }
  }

  if (!valid) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }

  // Load user data
  const user = await fetchUserByEmail(email);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User account is inactive or not found.' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );

  delete user.password_hash;
  res.json({
    token,
    user,
    message: 'Signed in successfully via email OTP.',
  });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

/**
 * 4. Update Current User Profile (Full Name, Email, Avatar/Profile Picture)
 * PATCH/PUT /api/auth/profile
 */
const updateProfileHandler = asyncHandler(async (req, res) => {
  const { name, fullName, email, avatar, avatarUrl, phone, companyName, gstin, panNumber, address } = req.body;
  const newName = (name || fullName || '').trim();
  const newEmail = email ? email.trim().toLowerCase() : null;
  const avatarProvided = avatar !== undefined || avatarUrl !== undefined;
  const newAvatar = avatar !== undefined ? avatar : (avatarUrl !== undefined ? avatarUrl : null);

  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const normalizedGstin = gstin === undefined ? undefined : String(gstin).trim().toUpperCase();
  const normalizedPan = panNumber === undefined ? undefined : String(panNumber).trim().toUpperCase();
  if (normalizedGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizedGstin)) {
    return res.status(400).json({ error: 'Please enter a valid 15-character GSTIN.' });
  }
  if (normalizedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
    return res.status(400).json({ error: 'Please enter a valid 10-character PAN number.' });
  }

  // If email is changing, ensure it is not taken by another user
  if (newEmail && newEmail !== req.user.email.toLowerCase()) {
    const conflict = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
      [newEmail, req.user.id]
    );
    if (conflict.rowCount > 0) {
      return res.status(409).json({ error: 'This email address is already registered to another account.' });
    }
  }

  const updateResult = await pool.query(
    `UPDATE users
     SET full_name = COALESCE(NULLIF($2, ''), full_name),
         email = COALESCE($3, email),
         avatar = CASE WHEN $4::boolean THEN $5 ELSE avatar END,
         avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, email, role, branch_id, is_active, avatar, avatar_url`,
    [
      req.user.id,
      newName,
      newEmail,
      avatarProvided,
      newAvatar ? String(newAvatar).trim() : null,
    ]
  );

  if (!updateResult.rowCount) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Keep the customer account's profile fields in sync with the authenticated user.
  if (req.user.role === 'CUSTOMER') {
    await pool.query(
      `UPDATE customers
       SET full_name = COALESCE(NULLIF($2, ''), full_name),
           email = COALESCE($3, email),
           phone = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE phone END,
           company_name = CASE WHEN $6::boolean THEN NULLIF($7, '') ELSE company_name END,
           gstin = CASE WHEN $8::boolean THEN NULLIF($9, '') ELSE gstin END,
           pan_number = CASE WHEN $10::boolean THEN NULLIF($11, '') ELSE pan_number END,
           address = CASE WHEN $12::boolean THEN NULLIF($13, '') ELSE address END,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        req.user.id, newName, newEmail,
        phone !== undefined, phone === undefined ? null : String(phone).trim(),
        companyName !== undefined, companyName === undefined ? null : String(companyName).trim(),
        gstin !== undefined, normalizedGstin ?? null,
        panNumber !== undefined, normalizedPan ?? null,
        address !== undefined, address === undefined ? null : String(address).trim(),
      ]
    );
  }

  // Fetch full unified user profile
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
    [req.user.id]
  );

  res.json({
    success: true,
    message: 'Profile updated successfully.',
    user: result.rows[0],
    data: result.rows[0],
  });
});

router.patch('/profile', authenticate, updateProfileHandler);
router.put('/profile', authenticate, updateProfileHandler);

module.exports = router;
