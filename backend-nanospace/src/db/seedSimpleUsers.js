require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seedSimpleUsers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch branches
    const branchRes = await client.query('SELECT id, code, name FROM branches');
    const branches = {};
    for (const b of branchRes.rows) {
      branches[b.code] = b;
    }
    const kphb = branches['KPHB'] || branchRes.rows[0];

    if (!kphb) {
      throw new Error('No branches found in database! Please run db setup first.');
    }

    const password = 'nanospace123';
    const passwordHash = await bcrypt.hash(password, 12);

    // List of users to ensure exist
    const userList = [
      {
        fullName: 'NanoSpace Super Admin',
        email: 'superadmin@nanospace.in',
        role: 'SUPER_ADMIN',
        branchId: null
      },
      {
        fullName: 'NanoSpace Super Admin',
        email: 'admin@nanospace.in',
        role: 'SUPER_ADMIN',
        branchId: null
      },
      {
        fullName: 'KPHB Branch Admin',
        email: 'branchadmin@nanospace.in',
        role: 'BRANCH_ADMIN',
        branchId: kphb.id
      },
      {
        fullName: 'KPHB Branch Reception',
        email: 'reception@nanospace.in',
        role: 'RECEPTION_ADMIN',
        branchId: kphb.id
      },
      {
        fullName: 'KPHB Branch Reception',
        email: 'branchreception@nanospace.in',
        role: 'RECEPTION_ADMIN',
        branchId: kphb.id
      },
      {
        fullName: 'NanoSpace Customer',
        email: 'customer@nanospace.in',
        role: 'CUSTOMER',
        branchId: kphb.id,
        isCustomer: true
      },
      {
        fullName: 'NanoSpace Employee',
        email: 'employee@nanospace.in',
        role: 'EMPLOYEE',
        branchId: kphb.id
      }
    ];

    console.log('Seeding simple users with password: ' + password);

    for (const u of userList) {
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, branch_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (email) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             branch_id = EXCLUDED.branch_id,
             is_active = TRUE
         RETURNING id, full_name, email, role, branch_id`,
        [u.fullName, u.email, passwordHash, u.role, u.branchId]
      );
      const user = userRes.rows[0];
      console.log(`User configured: ${user.email} (${user.role})`);

      // If customer, ensure record exists in `customers` table
      if (u.isCustomer) {
        await client.query(
          `INSERT INTO customers (user_id, branch_id, full_name, email, phone, company_name)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE
           SET branch_id = EXCLUDED.branch_id,
               full_name = EXCLUDED.full_name,
               email = EXCLUDED.email,
               phone = EXCLUDED.phone,
               company_name = EXCLUDED.company_name`,
          [user.id, kphb.id, u.fullName, u.email, '+91 9876543210', 'NanoSpace Client Corp']
        );
        console.log(`Customer profile configured for: ${user.email}`);
      }
    }

    // Also update existing demo users password to nanospace123 for convenience
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE email LIKE '%@nanospace.local' OR email LIKE '%@nanospace.in'`,
      [passwordHash]
    );

    await client.query('COMMIT');
    console.log('Successfully seeded all users and updated credentials!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding users:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedSimpleUsers();
