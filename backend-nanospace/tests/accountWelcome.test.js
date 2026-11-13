const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPasswordSetupLink } = require('../src/utils/accountWelcome');

test('password setup link stores only a hashed, expiring token', async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  const originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://nanospace.example/';

  try {
    const link = await createPasswordSetupLink(client, 'user-id');
    const token = new URL(link).searchParams.get('token');
    const deleteQuery = queries.find(({ sql }) => sql.startsWith('DELETE'));
    const insertQuery = queries.find(({ sql }) => sql.startsWith('INSERT'));
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(deleteQuery.params[0], 'user-id');
    assert.equal(insertQuery.params[0], crypto.createHash('sha256').update(token).digest('hex'));
    assert.notEqual(insertQuery.params[0], token);
    assert.equal(insertQuery.params[1], 'user-id');
    const expiresAt = new Date(insertQuery.params[2]).getTime();
    assert.ok(expiresAt > Date.now());
    assert.ok(expiresAt <= Date.now() + 30 * 60 * 1000);
  } finally {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  }
});
