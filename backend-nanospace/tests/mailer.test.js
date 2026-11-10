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
