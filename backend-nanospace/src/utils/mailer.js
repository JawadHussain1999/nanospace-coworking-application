const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = (process.env.SMTP_USER || '').trim();
  const rawPass = (process.env.SMTP_PASS || '').trim();
  // Strip spaces if user pasted a 16-character Google App Password with spaces
  const pass = rawPass.replace(/\s+/g, '');

  if (user && pass) {
    if (host.includes('gmail') || process.env.SMTP_SERVICE === 'gmail' || (!host && user.endsWith('@gmail.com'))) {
      console.log(`[NanoSpace Mailer] 🚀 Initializing Gmail SMTP service for ${user}...`);
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    } else if (host) {
      console.log(`[NanoSpace Mailer] 🚀 Initializing Custom SMTP (${host}:${port}) for ${user}...`);
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        },
      });
    }
  }

  if (!transporter) {
    console.warn(`\n[NanoSpace Mailer] No SMTP credentials configured in .env.`);
    console.warn(`Emails cannot be delivered until SMTP_USER and SMTP_PASS are set in backend-nanospace/.env.`);
    console.warn(`Development auth endpoints provide test-only verification/reset tokens when using the mail mock.\n`);

    transporter = {
      isMock: true,
      sendMail: async (options) => {
        console.log(`[NanoSpace Mailer Sim] Code generated for ${options.to}`);
        return { messageId: 'simulated-' + Date.now(), isMock: true };
      },
    };
  }

  return transporter;
}

/**
 * Send 6-digit OTP login verification email
 */
async function sendOtpEmail(email, otp, userName = 'NanoSpace Member') {
  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Workspace" <${user}>` : '"NanoSpace Platform" <no-reply@nanospace.in>');
  const subject = `Your NanoSpace verification code: ${otp}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NanoSpace Verification Code</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .email-container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.08); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 28px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
        .header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
        .body-content { padding: 32px 28px; }
        .greeting { font-size: 15px; color: #334155; margin-bottom: 16px; }
        .instruction { font-size: 14px; line-height: 1.5; color: #64748b; margin-bottom: 24px; }
        .otp-box { background: #f0fdf4; border: 2px dashed #86efac; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #15803d; display: inline-block; }
        .expiry-note { font-size: 12px; color: #64748b; margin-top: 10px; font-weight: 500; }
        .security-warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 12.5px; color: #92400e; margin-top: 24px; }
        .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8; }
        .footer strong { color: #475569; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>NanoSpace Workspace</h1>
          <p>Secure Single Sign-On Verification</p>
        </div>
        <div class="body-content">
          <div class="greeting">Hello <strong>${userName}</strong>,</div>
          <p class="instruction">
            We received a request to sign in to your NanoSpace account using a one-time verification code.
          </p>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="expiry-note">⏱️ Expires in 10 minutes</div>
          </div>
          <p class="instruction" style="margin-bottom: 0;">
            Enter this code on the sign-in page to access your workspace.
          </p>
          <div class="security-warning">
            <strong>Security Notice:</strong> Never share this code with anyone. NanoSpace support staff will never ask for your verification code. If you did not request this, please ignore this email.
          </div>
        </div>
        <div class="footer">
          © 2026 NanoSpace Co-working Management Platform.<br />
          Crafted by <strong>Jawad Hussain</strong> with ♥
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const transport = getTransporter();
    if (transport.isMock && process.env.NODE_ENV === 'production') {
      return {
        success: false,
        isMock: true,
        error: 'SMTP is not configured for production email delivery.',
      };
    }
    const result = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject,
      html,
      text: `Hello ${userName},\n\nYour NanoSpace verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nCrafted by Jawad Hussain.`,
    });
    if (result.isMock) {
      console.log('[NanoSpace Mailer] Simulated OTP email delivery complete.');
    } else {
      console.log(`[NanoSpace Mailer] OTP email accepted by SMTP (MessageId: ${result.messageId})`);
    }
    return { success: true, isMock: Boolean(result.isMock) };
  } catch (error) {
    console.error('[NanoSpace Mailer] OTP email delivery failed:', error.message);
    return { success: false, error: 'SMTP could not deliver the verification email.' };
  }
}

async function sendPasswordResetEmail(email, resetUrl, userName = 'NanoSpace Member') {
  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Workspace" <${user}>` : '"NanoSpace Platform" <no-reply@nanospace.in>');
  const safeName = String(userName).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));

  try {
    const transport = getTransporter();
    if (transport.isMock && process.env.NODE_ENV === 'production') {
      return { success: false, isMock: true };
    }

    const result = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Reset your NanoSpace password',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:24px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;color:#1e293b">
          <h1 style="font-size:22px">Reset your NanoSpace password</h1>
          <p>Hello <strong>${safeName}</strong>,</p>
          <p>We received a request to reset the password for your NanoSpace account. This link expires in 30 minutes and can only be used once.</p>
          <p style="margin:28px 0"><a href="${resetUrl}" style="background:#3730a3;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Choose a new password</a></p>
          <p>If you did not request a password reset, you can ignore this email.</p>
        </div>
      `,
      text: `Hello ${userName},\n\nReset your NanoSpace password using this link (valid for 30 minutes):\n${resetUrl}\n\nIf you did not request a reset, ignore this email.`,
    });

    return { success: true, isMock: Boolean(result.isMock) };
  } catch (error) {
    console.error(`Could not send password reset email to ${email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Booking notification email to Admins (Super Admin and Branch Admin)
 */
async function sendBookingNotificationEmail({
  adminEmail,
  adminName = 'Admin',
  bookingId,
  customerName,
  customerEmail,
  branchName,
  workspaceName,
  amount,
  bookedAt,
  schedule,
}) {
  console.log(`\n========================================`);
  console.log(`📢 [NanoSpace NOTIFICATION] Booking Alert for ${adminName} (${adminEmail}):`);
  console.log(`   Booking ID: ${bookingId} | Branch: ${branchName}`);
  console.log(`   Customer: ${customerName} (${customerEmail})`);
  console.log(`   Date & Time: ${bookedAt}`);
  console.log(`   Schedule: ${schedule} | Amount: ${amount}`);
  console.log(`========================================\n`);

  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Alerts" <${user}>` : '"NanoSpace Platform" <alerts@nanospace.in>');
  const subject = `🔔 New Booking Alert: ${bookingId} - ${customerName} (${branchName})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Booking Alert</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .box { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.08); }
        .hdr { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 28px 24px; text-align: center; color: #ffffff; }
        .hdr h2 { margin: 0; font-size: 20px; font-weight: 800; }
        .hdr p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
        .cnt { padding: 28px 24px; }
        .spec-list { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin: 20px 0; }
        .spec-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
        .spec-row:not(:last-child) { border-bottom: 1px dashed #e2e8f0; }
        .spec-lbl { color: #64748b; font-weight: 500; }
        .spec-val { color: #0f172a; font-weight: 700; text-align: right; }
        .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="hdr">
          <h2>New Booking Confirmed</h2>
          <p>Booked at ${bookedAt}</p>
        </div>
        <div class="cnt">
          <p style="margin-top:0;">Hello <strong>${adminName}</strong>,</p>
          <p>A new workspace reservation has been successfully booked:</p>
          <div class="spec-list">
            <div class="spec-row"><span class="spec-lbl">Booking ID:</span><span class="spec-val">${bookingId}</span></div>
            <div class="spec-row"><span class="spec-lbl">Date & Time Booked:</span><span class="spec-val" style="color:#2563eb;">${bookedAt}</span></div>
            <div class="spec-row"><span class="spec-lbl">Branch:</span><span class="spec-val">${branchName}</span></div>
            <div class="spec-row"><span class="spec-lbl">Workspace:</span><span class="spec-val">${workspaceName}</span></div>
            <div class="spec-row"><span class="spec-lbl">Customer:</span><span class="spec-val">${customerName} (${customerEmail})</span></div>
            <div class="spec-row"><span class="spec-lbl">Schedule:</span><span class="spec-val">${schedule}</span></div>
            <div class="spec-row" style="border-bottom:none;"><span class="spec-lbl">Total Amount:</span><span class="spec-val" style="color:#059669; font-size:15px;">${amount}</span></div>
          </div>
          <p class="small text-muted" style="font-size:12px; color:#64748b;">You can review this reservation in the NanoSpace dashboard under Bookings.</p>
        </div>
        <div class="footer">
          © 2026 NanoSpace Co-working Platform
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: fromAddress,
      to: adminEmail,
      subject,
      html,
      text: `New Booking Alert: ${bookingId}\nCustomer: ${customerName} (${customerEmail})\nBranch: ${branchName}\nWorkspace: ${workspaceName}\nBooked At: ${bookedAt}\nSchedule: ${schedule}\nAmount: ${amount}`,
    });
  } catch (error) {
    console.error(`Could not send booking email to ${adminEmail}:`, error.message);
  }
}

async function sendQuotationEmail({ email, customerName, quotationNumber, quotationDate, validUntil, branchName, branchAddress, branchPhone, branchEmail, total, pdf }) {
  const transport = getTransporter();
  if (transport.isMock) {
    throw new Error('SMTP is not configured. Set SMTP_USER and SMTP_PASS to send quotation emails.');
  }

  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || `"NanoSpace Co-Working" <${user}>`;
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));

  return transport.sendMail({
    from: fromAddress,
    to: email,
    subject: `NanoSpace quotation ${quotationNumber}`,
    text: [
      `Hello ${customerName},`,
      '',
      `Please find attached your NanoSpace Co-Working quotation ${quotationNumber}.`,
      `Quotation date: ${quotationDate}`,
      `Valid until: ${validUntil || 'As agreed'}`,
      `Workspace: ${branchName}`,
      `Address: ${branchAddress}`,
      ...(branchPhone ? [`Phone: ${branchPhone}`] : []),
      ...(branchEmail ? [`Branch email: ${branchEmail}`] : []),
      `Total: INR ${Number(total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      '',
      'Regards,',
      branchName,
      ...(branchPhone ? [branchPhone] : []),
      ...(branchEmail ? [branchEmail] : []),
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;color:#1c2b3d">
        <div style="padding:24px;background:#18304e;color:#fff;border-radius:12px 12px 0 0">
          <div style="font-size:12px;letter-spacing:1px">NANOSPACE CO-WORKING</div>
          <h1 style="font-size:22px;margin:12px 0 0">Your quotation is ready</h1>
        </div>
        <div style="padding:24px;border:1px solid #d7e0eb;border-top:0;border-radius:0 0 12px 12px">
          <p>Hello ${safe(customerName)},</p>
          <p>Please find your NanoSpace Co-Working quotation attached as a PDF.</p>
          <table style="width:100%;border-collapse:collapse;background:#f4f7fb">
            <tr><td style="padding:10px">Quotation</td><td style="padding:10px;text-align:right"><strong>${safe(quotationNumber)}</strong></td></tr>
            <tr><td style="padding:10px">Quotation date</td><td style="padding:10px;text-align:right">${safe(quotationDate)}</td></tr>
            <tr><td style="padding:10px">Valid until</td><td style="padding:10px;text-align:right">${safe(validUntil || 'As agreed')}</td></tr>
            <tr><td style="padding:10px">Workspace</td><td style="padding:10px;text-align:right">${safe(branchName)}</td></tr>
            <tr><td style="padding:10px">Address</td><td style="padding:10px;text-align:right">${safe(branchAddress)}</td></tr>
            ${branchPhone ? `<tr><td style="padding:10px">Phone</td><td style="padding:10px;text-align:right">${safe(branchPhone)}</td></tr>` : ''}
            ${branchEmail ? `<tr><td style="padding:10px">Email</td><td style="padding:10px;text-align:right">${safe(branchEmail)}</td></tr>` : ''}
            <tr><td style="padding:10px"><strong>Total</strong></td><td style="padding:10px;text-align:right"><strong>INR ${Number(total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td></tr>
          </table>
          <p style="margin-top:24px">Please review the attached quotation and contact us if you have any questions.</p>
          <p>Regards,<br><strong>${safe(branchName)}</strong><br>${safe(branchAddress)}${branchPhone ? `<br>${safe(branchPhone)}` : ''}${branchEmail ? `<br>${safe(branchEmail)}` : ''}</p>
        </div>
      </div>
    `,
    attachments: [{
      filename: `${String(quotationNumber).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    }],
  });
}

module.exports = {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendBookingNotificationEmail,
  sendQuotationEmail,
};
