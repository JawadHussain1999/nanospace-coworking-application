const test = require('node:test');
const assert = require('node:assert/strict');

const smtpEnvironmentKeys = [
  'NODE_ENV',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SERVICE',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
];

function withoutSmtpCredentials(callback) {
  const previousEnvironment = Object.fromEntries(
    smtpEnvironmentKeys.map((key) => [key, process.env[key]])
  );
  for (const key of smtpEnvironmentKeys) delete process.env[key];
  process.env.NODE_ENV = 'production';
  delete require.cache[require.resolve('../src/utils/mailer')];

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      delete require.cache[require.resolve('../src/utils/mailer')];
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

async function withMockSmtp(callback) {
  const previousEnvironment = Object.fromEntries(
    smtpEnvironmentKeys.map((key) => [key, process.env[key]])
  );
  const nodemailer = require('nodemailer');
  const originalCreateTransport = nodemailer.createTransport;
  const messages = [];
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'mailer@example.test';
  process.env.SMTP_PASS = 'test-password';
  nodemailer.createTransport = () => ({
    sendMail: async (message) => {
      messages.push(message);
      return { messageId: 'test-message' };
    },
  });
  delete require.cache[require.resolve('../src/utils/mailer')];

  try {
    await callback(messages);
  } finally {
    delete require.cache[require.resolve('../src/utils/mailer')];
    nodemailer.createTransport = originalCreateTransport;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('production OTP delivery fails closed without SMTP and does not log the code', async () => {
  await withoutSmtpCredentials(async () => {
    const output = [];
    const originalLog = console.log;
    console.log = (...values) => output.push(values.join(' '));
    try {
      const { sendOtpEmail } = require('../src/utils/mailer');
      const result = await sendOtpEmail('customer@example.com', '123456');
      assert.equal(result.success, false);
      assert.equal(result.isMock, true);
      assert.equal(output.some((line) => line.includes('123456')), false);
    } finally {
      console.log = originalLog;
    }
  });
});

test('quotation email reports missing production SMTP configuration', async () => {
  await withoutSmtpCredentials(async () => {
    const { sendQuotationEmail } = require('../src/utils/mailer');
    await assert.rejects(
      sendQuotationEmail({ email: 'customer@example.com' }),
      /SMTP is not configured/
    );
  });
});

test('account welcome email reports missing production SMTP configuration', async () => {
  await withoutSmtpCredentials(async () => {
    const { sendAccountWelcomeEmail } = require('../src/utils/mailer');
    const result = await sendAccountWelcomeEmail({
      email: 'customer@example.com',
      userName: 'NanoSpace Customer',
      userId: 'customer@example.com',
      role: 'Customer',
      loginUrl: 'https://nanospace.example/',
    });
    assert.equal(result.success, false);
    assert.equal(result.isMock, true);
  });
});

test('customer booking email distinguishes pending requests from confirmed bookings and escapes customer data', async () => {
  await withMockSmtp(async (messages) => {
    const { sendCustomerBookingEmail } = require('../src/utils/mailer');
    const pendingResult = await sendCustomerBookingEmail({
      email: 'customer@example.org',
      customerName: '<img src=x onerror=alert(1)>',
      bookingId: 'NS-HQ-123',
      bookingStatus: 'REQUESTED',
      branchName: '<script>alert(1)</script>',
      workspaceName: 'Desk & Room',
      schedule: 'Jun 1, 2026',
      totalAmount: '₹1,000',
      advanceAmount: '₹500',
      paymentUrl: 'https://razorpay.example/pay',
    });

    assert.equal(pendingResult.success, true);
    assert.equal(messages[0].to, 'customer@example.org');
    assert.match(messages[0].subject, /Booking request received/);
    assert.match(messages[0].html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(messages[0].html, /<script>alert\(1\)<\/script>/);
    assert.match(messages[0].text, /not confirmed yet/);
    assert.match(messages[0].text, /not matched automatically/);
    assert.match(messages[0].text, /https:\/\/razorpay\.example\/pay/);

    const confirmedResult = await sendCustomerBookingEmail({
      email: 'customer@example.org',
      customerName: 'NanoSpace Customer',
      bookingId: 'NS-HQ-124',
      bookingStatus: 'CONFIRMED',
      branchName: 'Head Office',
      workspaceName: 'Desk 4',
      schedule: 'Jun 2, 2026',
      totalAmount: '₹1,000',
      advanceAmount: '₹500',
    });

    assert.equal(confirmedResult.success, true);
    assert.match(messages[1].subject, /Booking confirmed/);
    assert.match(messages[1].text, /booking is confirmed/);
    assert.doesNotMatch(messages[1].text, /Pay the advance/);

    await sendCustomerBookingEmail({
      email: 'customer@example.org',
      customerName: 'NanoSpace Customer',
      bookingId: 'NS-HQ-125',
      bookingStatus: 'CANCELLED',
      branchName: 'Head Office',
      workspaceName: 'Desk 4',
      schedule: 'Jun 2, 2026',
      totalAmount: '₹1,000',
      advanceAmount: '₹500',
      eventType: 'CANCELLED',
    });
    assert.match(messages[2].subject, /Booking cancelled/);
    assert.match(messages[2].text, /has been cancelled/);

    await sendCustomerBookingEmail({
      email: 'customer@example.org',
      customerName: 'NanoSpace Customer',
      bookingId: 'NS-HQ-126',
      bookingStatus: 'CONFIRMED',
      branchName: 'Head Office',
      workspaceName: 'Desk 4',
      schedule: 'Jun 3, 2026',
      totalAmount: '₹1,000',
      advanceAmount: '₹500',
      eventType: 'UPDATED',
    });
    assert.match(messages[3].subject, /Booking updated/);
    assert.match(messages[3].text, /booking details have changed/);
  });
});

test('payment receipt and password change emails contain confirmation details without secrets', async () => {
  await withMockSmtp(async (messages) => {
    const { sendCustomerPaymentEmail, sendPasswordChangedEmail } = require('../src/utils/mailer');
    const paymentResult = await sendCustomerPaymentEmail({
      email: 'customer@example.org',
      customerName: 'NanoSpace Customer',
      paymentNumber: 'PAY-123',
      amount: '₹500.00',
      paymentMethod: 'ONLINE',
      paymentDate: 'Jun 1, 2026',
      transactionReference: 'txn-123',
      invoiceNumber: 'INV-123',
      bookingId: 'NS-HQ-123',
      bookingStatus: 'CONFIRMED',
    });
    assert.equal(paymentResult.success, true);
    assert.match(messages[0].subject, /Payment received/);
    assert.match(messages[0].text, /txn-123/);
    assert.match(messages[0].text, /INV-123/);
    assert.match(messages[0].text, /booking is now confirmed/);

    const passwordResult = await sendPasswordChangedEmail(
      'customer@example.org',
      'NanoSpace Customer'
    );
    assert.equal(passwordResult.success, true);
    assert.match(messages[1].subject, /password was changed/);
    assert.match(messages[1].text, /changed successfully/);
    assert.doesNotMatch(messages[1].text, /password\s*:/i);
  });
});
