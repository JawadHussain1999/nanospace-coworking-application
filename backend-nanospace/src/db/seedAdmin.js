require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

(async () => {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  try {
    if (!name || !email || !password) {
      throw new Error('ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set in .env.');
    }
    if (password.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
    }
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rowCount) {
      console.log(`Admin already exists: ${email}`);
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (full_name,email,password_hash,role)
       VALUES ($1,$2,$3,'SUPER_ADMIN')`,
      [name, email, hash]
    );
    console.log(`Created Super Admin: ${email}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
