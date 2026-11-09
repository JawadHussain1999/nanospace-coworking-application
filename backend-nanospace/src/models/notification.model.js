const pool = require('../models/database.model');

class Notification {
  static async findForUser(userId) {
    const result = await pool.query(
      `SELECT id, title, message, read_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async markReadForUser(id, userId) {
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, message, read_at, created_at`,
      [id, userId]
    );
    return result.rows[0] || null;
  }
}

module.exports = Notification;
