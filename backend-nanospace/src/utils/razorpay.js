const crypto = require('crypto');
const pool = require('../models/database.model');

function isRazorpayDemoMode() {
  return process.env.RAZORPAY_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

function getEncryptionKey() {
  const value = process.env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('RAZORPAY_CREDENTIALS_ENCRYPTION_KEY must be configured as 64 hexadecimal characters.');
  }
  return Buffer.from(value, 'hex');
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}

function decryptSecret(value) {
  const [ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored Razorpay credentials are invalid.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function getBranchRazorpayCredentials(branchId, db = pool) {
  const result = await db.query(
    `SELECT razorpay_key_id, razorpay_key_secret_encrypted
     FROM branch_payment_accounts WHERE branch_id = $1`,
    [branchId]
  );
  if (!result.rowCount) return null;
  return {
    keyId: result.rows[0].razorpay_key_id,
    keySecret: decryptSecret(result.rows[0].razorpay_key_secret_encrypted),
  };
}

async function saveBranchRazorpayCredentials(branchId, { keyId, keySecret }) {
  const existing = await pool.query(
    'SELECT razorpay_key_secret_encrypted FROM branch_payment_accounts WHERE branch_id = $1',
    [branchId]
  );
  const encryptedSecret = keySecret
    ? encryptSecret(keySecret)
    : existing.rows[0]?.razorpay_key_secret_encrypted;
  if (!encryptedSecret) {
    throw new Error('Razorpay Key Secret is required when configuring payments for the first time.');
  }
  await pool.query(
    `INSERT INTO branch_payment_accounts(branch_id, razorpay_key_id, razorpay_key_secret_encrypted)
     VALUES($1, $2, $3)
     ON CONFLICT (branch_id) DO UPDATE
     SET razorpay_key_id = EXCLUDED.razorpay_key_id,
         razorpay_key_secret_encrypted = EXCLUDED.razorpay_key_secret_encrypted,
         updated_at = NOW()`,
    [branchId, keyId, encryptedSecret]
  );
}

async function razorpayRequest(credentials, path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`Razorpay could not be reached: ${error.message}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const description = payload?.error?.description || payload?.error?.reason;
    throw new Error(description ? `Razorpay: ${description}` : `Razorpay request failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function createRazorpayOrder(credentials, { amount, receipt, notes }) {
  return razorpayRequest(credentials, '/orders', 'POST', {
    amount,
    currency: 'INR',
    receipt,
    expire_by: Math.floor(Date.now() / 1000) + 15 * 60,
    notes,
  });
}

async function getRazorpayOrder(credentials, orderId) {
  return razorpayRequest(credentials, `/orders/${encodeURIComponent(orderId)}`);
}

async function getRazorpayOrderPayments(credentials, orderId) {
  const result = await razorpayRequest(credentials, `/orders/${encodeURIComponent(orderId)}/payments`);
  return Array.isArray(result.items) ? result.items : [];
}

async function captureRazorpayPayment(credentials, paymentId, amount) {
  return razorpayRequest(
    credentials,
    `/payments/${encodeURIComponent(paymentId)}/capture`,
    'POST',
    { amount, currency: 'INR' }
  );
}

async function verifyRazorpayPayment(credentials, { orderId, paymentId, signature, amount }) {
  const expected = crypto
    .createHmac('sha256', credentials.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  let received;
  try {
    received = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;

  const payment = await razorpayRequest(credentials, `/payments/${encodeURIComponent(paymentId)}`);
  if (payment.order_id !== orderId || Number(payment.amount) !== amount || payment.currency !== 'INR') {
    return false;
  }
  if (payment.status === 'authorized') {
    const captured = await captureRazorpayPayment(credentials, paymentId, amount);
    return captured.status === 'captured';
  }
  return payment.status === 'captured';
}

module.exports = {
  createRazorpayOrder,
  captureRazorpayPayment,
  decryptSecret,
  encryptSecret,
  isRazorpayDemoMode,
  getRazorpayOrderPayments,
  getBranchRazorpayCredentials,
  getRazorpayOrder,
  saveBranchRazorpayCredentials,
  verifyRazorpayPayment,
};
