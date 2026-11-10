require("dotenv").config();

const pg = require("pg");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function testConnection() {
  try {
    const result = await pool.query(`
      SELECT
        NOW() AS current_time,
        current_database() AS database_name,
        current_user AS database_user
    `);

    console.log("✅ Neon PostgreSQL connected successfully!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();
