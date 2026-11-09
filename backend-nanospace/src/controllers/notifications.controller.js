const router = require('express').Router();
const pool = require('../models/database.model');
const Notification = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const notifications = await Notification.findForUser(req.user.id);
  res.json({ data: notifications });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ success: true, message: 'All notifications marked as read.' });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, message, read_at, created_at
     FROM notifications
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ data: result.rows[0] });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const notification = await Notification.markReadForUser(req.params.id, req.user.id);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ data: notification });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ success: true, message: 'Notification removed.' });
}));

module.exports = router;
