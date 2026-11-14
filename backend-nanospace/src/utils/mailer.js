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
          © 2026 NanoSpace Co-working Management Platform.
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
      text: `Hello ${userName},\n\nYour NanoSpace verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
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

async function sendPasswordChangedEmail(email, userName = 'NanoSpace Member') {
  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Workspace" <${user}>` : '"NanoSpace Platform" <no-reply@nanospace.in>');
  const safeName = String(userName || 'NanoSpace Member').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));

  try {
    const transport = getTransporter();
    if (transport.isMock && process.env.NODE_ENV === 'production') {
      return { success: false, isMock: true, error: 'SMTP is not configured for production email delivery.' };
    }

    const result = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Your NanoSpace password was changed',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:24px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;color:#1e293b">
          <h1 style="font-size:22px">Password changed</h1>
          <p>Hello <strong>${safeName}</strong>,</p>
          <p>The password for your NanoSpace account was changed successfully.</p>
          <p>If you did not make this change, contact your NanoSpace branch immediately.</p>
        </div>
      `,
      text: `Hello ${userName || 'NanoSpace Member'},\n\nThe password for your NanoSpace account was changed successfully.\n\nIf you did not make this change, contact your NanoSpace branch immediately.`,
    });

    return { success: true, isMock: Boolean(result.isMock) };
  } catch (error) {
    console.error(`[NanoSpace Mailer] Password change email delivery failed for ${email}:`, error.message);
    return { success: false, error: 'SMTP could not deliver the password change email.' };
  }
}

async function sendAccountWelcomeEmail({ email, userName, userId, role, loginUrl, passwordSetupUrl }) {
  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Workspace" <${user}>` : '"NanoSpace Platform" <no-reply@nanospace.in>');
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
  const greeting = safe(userName || 'NanoSpace Member');
  const safeUserId = safe(userId || email);
  const safeRole = safe(role || 'Customer');
  const safeLoginUrl = safe(loginUrl);
  const setupLink = passwordSetupUrl
    ? `<p style="margin:28px 0"><a href="${safe(passwordSetupUrl)}" style="background:#3730a3;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Set your password</a></p><p>This one-time link expires in 30 minutes. Create a new password before signing in.</p>`
    : '';
  const passwordInstructions = passwordSetupUrl
    ? 'Use the secure link below to set a password. For your security, your password is not included in this email.'
    : 'Sign in using the password you chose during registration. For your security, your password is not included in this email.';

  try {
    const transport = getTransporter();
    if (transport.isMock && process.env.NODE_ENV === 'production') {
      return { success: false, isMock: true, error: 'SMTP is not configured for production email delivery.' };
    }

    const result = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Welcome to NanoSpace — your account is ready',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:24px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;color:#1e293b">
          <h1 style="font-size:22px">Welcome to NanoSpace</h1>
          <p>Hello <strong>${greeting}</strong>,</p>
          <p>Your ${safeRole} account is ready. You can now access your NanoSpace account.</p>
          <p><strong>User ID:</strong> ${safeUserId}</p>
          <p>${passwordInstructions}</p>
          ${setupLink}
          <p><a href="${safeLoginUrl}">Go to NanoSpace sign in</a></p>
          <p>If you did not expect this account, contact your NanoSpace branch.</p>
        </div>
      `,
      text: [
        `Hello ${userName || 'NanoSpace Member'},`,
        '',
        `Your ${role || 'Customer'} account is ready.`,
        `User ID: ${userId || email}`,
        passwordSetupUrl
          ? `Set your password using this one-time link (expires in 30 minutes): ${passwordSetupUrl}`
          : 'Sign in using the password you chose during registration. Your password is not included in this email.',
        `Sign in: ${loginUrl}`,
        '',
        'If you did not expect this account, contact your NanoSpace branch.',
      ].join('\n'),
    });

    return { success: true, isMock: Boolean(result.isMock) };
  } catch (error) {
    console.error(`[NanoSpace Mailer] Welcome email delivery failed for ${email}:`, error.message);
    return { success: false, error: 'SMTP could not deliver the welcome email.' };
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

async function sendCustomerBookingEmail({
  email,
  customerName,
  bookingId,
  bookingStatus,
  branchName,
  workspaceName,
  schedule,
  totalAmount,
  advanceAmount,
  paymentUrl,
  eventType = 'CREATED',
}) {
  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Workspace" <${user}>` : '"NanoSpace Platform" <no-reply@nanospace.in>');
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
  const safePaymentUrl = /^https:\/\/[^\s]+$/i.test(paymentUrl || '') ? paymentUrl : '';
  const status = String(bookingStatus || '').toUpperCase();
  const event = String(eventType || 'CREATED').toUpperCase();
  const isPendingRequest = status === 'REQUESTED';
  const eventContent = event === 'CANCELLED' || status === 'CANCELLED'
    ? { heading: 'Booking cancelled', message: 'Your workspace booking has been cancelled.' }
    : event === 'UPDATED'
      ? { heading: 'Booking updated', message: `Your booking details have changed. The current booking status is ${status.toLowerCase()}.` }
      : status === 'REQUESTED'
        ? { heading: 'Booking request received', message: 'Your booking request is not confirmed yet. Please complete the advance payment and wait for the NanoSpace team to verify it.' }
        : status === 'COMPLETED'
          ? { heading: 'Booking completed', message: 'Your workspace booking has been marked as completed.' }
          : { heading: 'Booking confirmed', message: 'Your workspace booking is confirmed.' };
  const heading = eventContent.heading;
  const statusMessage = eventContent.message;
  const paymentInstructions = isPendingRequest && event === 'CREATED' && safePaymentUrl
    ? `<p>Pay the advance using <a href="${safe(safePaymentUrl)}">this Razorpay link</a>. Include booking reference <strong>${safe(bookingId)}</strong> in the payment notes. Payment is verified manually and is not matched automatically.</p>`
    : '';
  const advanceDescription = isPendingRequest
    ? `${advanceAmount} (pending payment verification)`
    : advanceAmount;

  try {
    const transport = getTransporter();
    if (transport.isMock && process.env.NODE_ENV === 'production') {
      return { success: false, isMock: true, error: 'SMTP is not configured for production email delivery.' };
    }

    const result = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject: `${heading}: ${bookingId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;color:#1e293b">
          <h1 style="font-size:22px">${heading}</h1>
          <p>Hello <strong>${safe(customerName || 'NanoSpace Customer')}</strong>,</p>
          <p>${statusMessage}</p>
          <p><strong>Booking reference:</strong> ${safe(bookingId)}</p>
          <p><strong>Branch:</strong> ${safe(branchName)}</p>
          <p><strong>Workspace:</strong> ${safe(workspaceName)}</p>
          <p><strong>Schedule:</strong> ${safe(schedule)}</p>
          <p><strong>Total:</strong> ${safe(totalAmount)}</p>
          <p><strong>Advance:</strong> ${safe(advanceDescription)}</p>
          ${paymentInstructions}
          <p>Keep this email for your records. Contact your branch if you need help.</p>
        </div>
      `,
      text: [
        `Hello ${customerName || 'NanoSpace Customer'},`,
        '',
        statusMessage,
        `Booking reference: ${bookingId}`,
        `Branch: ${branchName}`,
        `Workspace: ${workspaceName}`,
        `Schedule: ${schedule}`,
        `Total: ${totalAmount}`,
        `Advance: ${advanceDescription}`,
        ...(isPendingRequest && event === 'CREATED' && safePaymentUrl
          ? [`Pay the advance: ${safePaymentUrl}`, `Include booking reference ${bookingId} in the payment notes. Payment is verified manually and is not matched automatically.`]
          : []),
        '',
        'Contact your branch if you need help.',
      ].join('\n'),
    });

    return { success: true, isMock: Boolean(result.isMock) };
  } catch (error) {
    console.error(`[NanoSpace Mailer] Booking email delivery failed for booking ${bookingId}:`, error.message);
    return { success: false, error: 'SMTP could not deliver the booking email.' };
  }
}

async function sendCustomerPaymentEmail({
  email,
  customerName,
  paymentNumber,
  amount,
  paymentMethod,
  paymentDate,
  transactionReference,
  invoiceNumber,
  bookingId,
  bookingStatus,
}) {
  const user = (process.env.SMTP_USER || '').trim();
  const fromAddress = process.env.EMAIL_FROM || (user ? `"NanoSpace Workspace" <${user}>` : '"NanoSpace Platform" <no-reply@nanospace.in>');
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
  const bookingConfirmed = String(bookingStatus || '').toUpperCase() === 'CONFIRMED';

  try {
    const transport = getTransporter();
    if (transport.isMock && process.env.NODE_ENV === 'production') {
      return { success: false, isMock: true, error: 'SMTP is not configured for production email delivery.' };
    }

    const result = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject: `Payment received: ${paymentNumber}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;color:#1e293b">
          <h1 style="font-size:22px">Payment received</h1>
          <p>Hello <strong>${safe(customerName || 'NanoSpace Customer')}</strong>,</p>
          <p>We have received and verified your payment.</p>
          <p><strong>Receipt number:</strong> ${safe(paymentNumber)}</p>
          <p><strong>Amount received:</strong> ${safe(amount)}</p>
          <p><strong>Payment method:</strong> ${safe(paymentMethod)}</p>
          <p><strong>Payment date:</strong> ${safe(paymentDate)}</p>
          ${transactionReference ? `<p><strong>Transaction reference:</strong> ${safe(transactionReference)}</p>` : ''}
          ${invoiceNumber ? `<p><strong>Invoice:</strong> ${safe(invoiceNumber)}</p>` : ''}
          ${bookingId ? `<p><strong>Booking reference:</strong> ${safe(bookingId)}</p>` : ''}
          ${bookingConfirmed ? '<p>Your related booking is now confirmed.</p>' : ''}
          <p>Keep this email for your records.</p>
        </div>
      `,
      text: [
        `Hello ${customerName || 'NanoSpace Customer'},`,
        '',
        'We have received and verified your payment.',
        `Receipt number: ${paymentNumber}`,
        `Amount received: ${amount}`,
        `Payment method: ${paymentMethod}`,
        `Payment date: ${paymentDate}`,
        ...(transactionReference ? [`Transaction reference: ${transactionReference}`] : []),
        ...(invoiceNumber ? [`Invoice: ${invoiceNumber}`] : []),
        ...(bookingId ? [`Booking reference: ${bookingId}`] : []),
        ...(bookingConfirmed ? ['Your related booking is now confirmed.'] : []),
        '',
        'Keep this email for your records.',
      ].join('\n'),
    });

    return { success: true, isMock: Boolean(result.isMock) };
  } catch (error) {
    console.error(`[NanoSpace Mailer] Payment email delivery failed for payment ${paymentNumber}:`, error.message);
    return { success: false, error: 'SMTP could not deliver the payment email.' };
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
  sendPasswordChangedEmail,
  sendAccountWelcomeEmail,
  sendBookingNotificationEmail,
  sendCustomerBookingEmail,
  sendCustomerPaymentEmail,
  sendQuotationEmail,
};
