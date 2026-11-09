const pool = require('../models/database.model');
const {
  captureRazorpayPayment,
  decryptSecret,
  getRazorpayOrder,
  getRazorpayOrderPayments,
} = require('./razorpay');

const STALE_PAYMENT_AGE_MINUTES = 20;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const TERMINAL_PAYMENT_STATUSES = new Set(['failed', 'cancelled', 'refunded']);
let cleanupRunning = false;

async function updateStaleBooking(payment, gatewayPayment) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT pay.id, pay.status, pay.booking_id, booking.status AS booking_status,
              booking.workspace_id, booking.starts_at
       FROM payments pay
       JOIN bookings booking ON booking.id = pay.booking_id
       WHERE pay.id = $1
       FOR UPDATE OF pay, booking`,
      [payment.id]
    );
    if (!result.rowCount || result.rows[0].status !== 'PENDING' || result.rows[0].booking_status !== 'REQUESTED') {
      await client.query('COMMIT');
      return;
    }

    const booking = result.rows[0];
    if (gatewayPayment) {
      await client.query(
        `UPDATE payments
         SET status='PAID', gateway_payment_id=$2, transaction_reference=$2,
             payment_date=NOW(), gateway_key_secret_encrypted=NULL, updated_at=NOW()
         WHERE id=$1`,
        [payment.id, gatewayPayment.id]
      );
      await client.query(
        `UPDATE bookings SET status='CONFIRMED', updated_at=NOW()
         WHERE id=$1 AND status='REQUESTED'`,
        [booking.booking_id]
      );
      await client.query(
        `UPDATE workspaces SET status='OCCUPIED', updated_at=NOW()
         WHERE id=$1 AND DATE($2::timestamptz) >= CURRENT_DATE`,
        [booking.workspace_id, booking.starts_at]
      );
    } else {
      await client.query(
        `UPDATE payments
         SET status='CANCELLED', gateway_key_secret_encrypted=NULL, updated_at=NOW()
         WHERE id=$1 AND status='PENDING'`,
        [payment.id]
      );
      await client.query(
        `UPDATE bookings SET status='CANCELLED', updated_at=NOW()
         WHERE id=$1 AND status='REQUESTED'`,
        [booking.booking_id]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileStaleRazorpayBookings() {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const result = await pool.query(
      `SELECT pay.id, pay.gateway_order_id, pay.gateway_key_id,
              pay.gateway_key_secret_encrypted, pay.amount
       FROM payments pay
       JOIN bookings booking ON booking.id = pay.booking_id
       WHERE pay.status='PENDING'
         AND pay.gateway_order_id IS NOT NULL
         AND pay.gateway_key_secret_encrypted IS NOT NULL
         AND booking.status='REQUESTED'
         AND pay.created_at < NOW() - ($1 * INTERVAL '1 minute')
       ORDER BY pay.created_at ASC
       LIMIT 25`,
      [STALE_PAYMENT_AGE_MINUTES]
    );

    for (const payment of result.rows) {
      try {
        const credentials = {
          keyId: payment.gateway_key_id,
          keySecret: decryptSecret(payment.gateway_key_secret_encrypted),
        };
        const order = await getRazorpayOrder(credentials, payment.gateway_order_id);
        const expiresAt = Number(order.expire_by) * 1000;
        if (!expiresAt || expiresAt > Date.now()) continue;

        const orderPayments = await getRazorpayOrderPayments(credentials, payment.gateway_order_id);
        const orderAttempts = orderPayments.filter((entry) => entry.order_id === payment.gateway_order_id);
        const capturedAttempt = orderAttempts.find((entry) => entry.status === 'captured');
        const authorizedAttempt = orderAttempts.find((entry) => entry.status === 'authorized');
        const hasMatchingAmount = (entry) =>
          Number(entry.amount) === Math.round(Number(payment.amount) * 100) &&
          entry.currency === 'INR';
        if (capturedAttempt && !hasMatchingAmount(capturedAttempt)) {
          console.error(`Captured Razorpay payment has an unexpected amount for pending payment ${payment.id}.`);
          continue;
        }
        if (authorizedAttempt && !hasMatchingAmount(authorizedAttempt)) {
          console.error(`Authorized Razorpay payment has an unexpected amount for pending payment ${payment.id}.`);
          continue;
        }
        let settledPayment = capturedAttempt;
        if (!settledPayment && authorizedAttempt) {
          const capture = await captureRazorpayPayment(
            credentials,
            authorizedAttempt.id,
            Math.round(Number(payment.amount) * 100)
          );
          if (capture.status === 'captured') settledPayment = capture;
        }
        if (!settledPayment && (order.status === 'paid' ||
          orderAttempts.some((entry) => !TERMINAL_PAYMENT_STATUSES.has(entry.status)))) {
          continue;
        }
        await updateStaleBooking(payment, settledPayment || null);
      } catch (error) {
        console.error(`Could not reconcile stale Razorpay payment ${payment.id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Could not scan for stale Razorpay bookings:', error.message);
  } finally {
    cleanupRunning = false;
  }
}

function startRazorpayBookingCleanup() {
  void reconcileStaleRazorpayBookings();
  const timer = setInterval(reconcileStaleRazorpayBookings, CLEANUP_INTERVAL_MS);
  timer.unref();
}

module.exports = { reconcileStaleRazorpayBookings, startRazorpayBookingCleanup };
