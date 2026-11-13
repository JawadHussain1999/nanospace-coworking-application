const crypto = require('crypto');

async function createPasswordSetupLink(client, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  await client.query(
    'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, userId, expiresAt]
  );

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

module.exports = { createPasswordSetupLink };
