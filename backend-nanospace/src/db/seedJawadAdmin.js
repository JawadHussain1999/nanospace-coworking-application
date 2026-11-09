require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

(async () => {
  const name = 'Jawad Hussain';
  const email = 'jawadhussain9014@gmail.com';
  const password = process.env.ADMIN_PASSWORD || 'nanospace123';

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'SUPER_ADMIN', true)
       ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           role = 'SUPER_ADMIN',
           is_active = true,
           password_hash = EXCLUDED.password_hash
       RETURNING id, full_name, email, role, is_active`,
      [name, email, hash]
    );

    console.log('Super Admin successfully configured:', result.rows[0]);
  } catch (err) {
    console.error('Failed to configure Super Admin:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
