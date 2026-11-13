const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { generateReceiptPdf } = require('../utils/pdfHelper');
const { decryptSecret, isRazorpayDemoMode, verifyRazorpayPayment } = require('../utils/razorpay');
const { formatShortBookingId } = require('../utils/bookingHelper');
const { sendCustomerPaymentEmail } = require('../utils/mailer');
const staffRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'];

function notifyCustomerOfPayment(payment, invoice) {
  const email = String(payment.customer_email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@example\.com$/i.test(email)) return;

  sendCustomerPaymentEmail({
    email,
    customerName: payment.customer_name,
    paymentNumber: payment.payment_number,
    amount: `₹${Number(payment.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    paymentMethod: payment.payment_method,
    paymentDate: payment.payment_date
      ? new Date(payment.payment_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'Date not available',
    transactionReference: payment.transaction_reference || payment.gateway_payment_id,
    invoiceNumber: invoice?.invoice_number,
    bookingId: payment.booking_record_id
      ? formatShortBookingId(payment.branch_name, payment.booking_record_id)
      : undefined,
    bookingStatus: payment.booking_status,
  }).then((result) => {
    if (!result.success) {
      console.error(`Customer payment email failed for payment ${payment.payment_number}:`, result.error || 'Unknown delivery error');
    }
  }).catch((error) => {
    console.error(`Customer payment email failed for payment ${payment.payment_number}:`, error.message);
  });
}

async function ensurePaidBookingInvoice(client, payment) {
  const existing = await client.query(
    `SELECT id, invoice_number FROM invoices
     WHERE payment_id=$1 OR id=$2
     LIMIT 1`,
    [payment.id, payment.invoice_id || null]
  );
  if (existing.rowCount) {
    if (payment.invoice_id !== existing.rows[0].id) {
      await client.query('UPDATE payments SET invoice_id=$2 WHERE id=$1', [payment.id, existing.rows[0].id]);
    }
    return existing.rows[0];
  }

  const paymentDate = payment.payment_date || new Date();
  const bookingTotal = Number(payment.booking_total || payment.amount);
  const paidAmount = Number(payment.amount);
  const invoiceStatus = paidAmount >= bookingTotal ? 'PAID' : 'PENDING';
  const invoiceNumber = `INV-${payment.id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const schedule = [
    payment.starts_at ? new Date(payment.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
    payment.ends_at ? new Date(payment.ends_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
  ].filter(Boolean).join(' to ');
  const notes = [
    `Automatically generated for payment received against booking ${payment.booking_record_id}.`,
    `Service: ${payment.item_name || 'Workspace booking'}.`,
    `Workspace: ${payment.workspace_name || 'Assigned workspace'}.`,
    `Branch: ${payment.branch_name || 'NanoSpace'}.`,
    schedule ? `Booking schedule: ${schedule} (Asia/Kolkata).` : '',
    `Payment method: ${payment.payment_method || 'RAZORPAY'}.`,
    `Payment reference: ${payment.gateway_payment_id || payment.transaction_reference || 'N/A'}.`,
    `Payment received: ${new Date(paymentDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (Asia/Kolkata).`,
  ].filter(Boolean).join(' ');
  const invoiceResult = await client.query(
    `INSERT INTO invoices(invoice_number, customer_id, branch_id, booking_id, payment_id,
                          issue_date, due_date, subtotal, tax_amount, total_amount,
                          paid_amount, status, notes)
     VALUES($1, $2, $3, $4, $5, ($10::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
            ($10::timestamptz AT TIME ZONE 'Asia/Kolkata')::date, $6, $7, $8, $11, $12, $9)
     ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
     RETURNING id, invoice_number`,
    [
      invoiceNumber,
      payment.customer_id,
      payment.branch_id,
      payment.booking_record_id,
      payment.id,
      payment.subtotal,
      payment.tax_amount,
      payment.amount,
      notes,
      paymentDate,
      paidAmount,
      invoiceStatus,
    ]
  );
  const invoice = invoiceResult.rows[0] || (await client.query(
    'SELECT id, invoice_number FROM invoices WHERE payment_id=$1',
    [payment.id]
  )).rows[0];
  if (!invoice) throw new Error(`Could not create an invoice for paid booking payment ${payment.id}.`);
  await client.query('UPDATE payments SET invoice_id=$2 WHERE id=$1', [payment.id, invoice.id]);
  return invoice;
}

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT pay.*, c.full_name AS customer_name, c.phone AS customer_phone, c.company_name, c.email AS customer_email,
                    b.name AS branch_name, inv.invoice_number
             FROM payments pay
             JOIN customers c ON c.id = pay.customer_id
             LEFT JOIN branches b ON b.id = pay.branch_id
             LEFT JOIN invoices inv ON inv.id = pay.invoice_id
             WHERE 1=1`;

  if (u.role === 'CUSTOMER') {
    p.push(u.id);
    sql += ` AND c.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND pay.branch_id=$${p.length}`;
  }

  sql += ' ORDER BY pay.created_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => ({
    ...r,
    customer: r.customer_name,
    phone: r.customer_phone || '+91 98765 43210',
    branch: r.branch_name,
    invoice: r.invoice_number || 'INV-DIRECT',
    due: r.due_date ? String(r.due_date).slice(0, 10) : '',
    amount: `₹${Number(r.amount || 0).toLocaleString('en-IN')}`,
  }));

  res.json({ data: rows });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT pay.*, c.full_name AS customer_name, c.phone AS customer_phone, c.company_name, c.email AS customer_email,
            b.name AS branch_name, inv.invoice_number
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     LEFT JOIN branches b ON b.id = pay.branch_id
     LEFT JOIN invoices inv ON inv.id = pay.invoice_id
     WHERE pay.id::text = $1 OR pay.payment_number = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payment record not found.' });
  const r = result.rows[0];
  res.json({
    data: {
      ...r,
      customer: r.customer_name,
      phone: r.customer_phone || '+91 98765 43210',
      branch: r.branch_name,
      invoice: r.invoice_number || 'INV-DIRECT',
      due: r.due_date ? String(r.due_date).slice(0, 10) : '',
      amount: `₹${Number(r.amount || 0).toLocaleString('en-IN')}`,
    }
  });
}));

router.get('/:id/receipt', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT pay.*, c.full_name AS customer_name, c.phone AS customer_phone, c.company_name, c.email AS customer_email,
            b.name AS branch_name, inv.invoice_number
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     LEFT JOIN branches b ON b.id = pay.branch_id
     LEFT JOIN invoices inv ON inv.id = pay.invoice_id
     WHERE pay.id::text = $1 OR pay.payment_number = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payment record not found.' });
  const pdfBuffer = await generateReceiptPdf(result.rows[0]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=receipt-${result.rows[0].payment_number || req.params.id}.pdf`);
  res.send(pdfBuffer);
}));

router.post('/', allowRoles(...staffRoles), ah(async (req, res) => {
  const u = req.user;
  const { customerId, customer, invoiceId, branchId, branch, amount, paymentMethod, dueDate, due, status = 'PENDING', notes } = req.body;

  let branchResolved = u.role === 'SUPER_ADMIN' ? (branchId || branch) : u.branch_id;
  if (branchResolved && !/^[0-9a-f]{8}-/i.test(branchResolved)) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [branchResolved]);
    branchResolved = bRes.rows[0]?.id || u.branch_id;
  }
  if (!branchResolved) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branchResolved = bRes.rows[0]?.id;
  }

  let custId = customerId;
  if (!custId || !/^[0-9a-f]{8}-/i.test(custId)) {
    const cRes = await pool.query('SELECT id FROM customers WHERE full_name ILIKE $1 OR email ILIKE $1 LIMIT 1', [customer || '']);
    custId = cRes.rows[0]?.id;
  }
  if (!custId) {
    const cRes = await pool.query('SELECT id FROM customers LIMIT 1');
    custId = cRes.rows[0]?.id;
  }

  const dDate = dueDate || due || new Date().toISOString().slice(0, 10);
  const payAmount = Number(typeof amount === 'string' ? amount.replace(/[^\d.]/g, '') : amount) || 8500;
  const num = `PAY-${Math.floor(100 + Math.random() * 900)}`;

  const validStatuses = ['PENDING', 'OVERDUE', 'PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED'];
  const normStatus = validStatuses.includes(String(status || '').toUpperCase()) ? String(status).toUpperCase() : 'PENDING';

  const result = await pool.query(
    `INSERT INTO payments(payment_number, invoice_id, customer_id, branch_id, amount, payment_method, due_date, status, notes)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [num, invoiceId || null, custId, branchResolved, payAmount, paymentMethod || 'UPI', dDate, normStatus, notes || null]
  );

  if (['PAID', 'COMPLETED'].includes(normStatus)) {
    const customerResult = await pool.query(
      `SELECT customer.full_name, customer.email, invoice.invoice_number
       FROM customers customer
       LEFT JOIN invoices invoice ON invoice.id=$2
       WHERE customer.id=$1`,
      [custId, invoiceId || null]
    );
    notifyCustomerOfPayment({
      ...result.rows[0],
      customer_name: customerResult.rows[0]?.full_name,
      customer_email: customerResult.rows[0]?.email,
    }, { invoice_number: customerResult.rows[0]?.invoice_number });
  }

  res.status(201).json({ data: result.rows[0] });
}));

router.post('/razorpay/verify', allowRoles('CUSTOMER'), ah(async (req, res) => {
  const { paymentId, orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
  const requestedPaymentId = paymentId;
  const submittedOrderId = razorpayOrderId || orderId;
  const submittedPaymentId = razorpayPaymentId;
  const signature = razorpaySignature;
  if (!requestedPaymentId || !submittedOrderId || !submittedPaymentId || !signature) {
    return res.status(400).json({ error: 'Payment verification details are incomplete.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT pay.*, booking.status AS booking_status, booking.id AS booking_record_id,
              booking.workspace_id, booking.starts_at, booking.ends_at,
              booking.subtotal, booking.tax_amount, booking.total_amount AS booking_total,
              customer.full_name AS customer_name, customer.email AS customer_email,
              branch.name AS branch_name,
              workspace.name AS workspace_name,
              inventory.name AS item_name
       FROM payments pay
       JOIN bookings booking ON booking.id = pay.booking_id
       JOIN customers customer ON customer.id = pay.customer_id
       JOIN branches branch ON branch.id = pay.branch_id
       LEFT JOIN workspaces workspace ON workspace.id = booking.workspace_id
       LEFT JOIN inventory_items inventory ON inventory.id = booking.inventory_item_id
       WHERE pay.id = $1 AND pay.gateway_order_id = $2 AND customer.user_id = $3
       FOR UPDATE OF pay, booking`,
      [requestedPaymentId, submittedOrderId, req.user.id]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment request was not found for this customer.' });
    }

    const payment = result.rows[0];
    if (payment.status === 'PAID') {
      const invoice = await ensurePaidBookingInvoice(client, payment);
      await client.query('COMMIT');
      return res.json({
        success: true,
        bookingId: payment.booking_record_id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        alreadyVerified: true,
      });
    }
    if (payment.status !== 'PENDING' || payment.booking_status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This booking payment is no longer pending.' });
    }

    const isDemoRecord = payment.gateway_key_id === 'RAZORPAY_DEMO';
    const verified = isDemoRecord
      ? isRazorpayDemoMode() &&
        submittedOrderId.startsWith('demo_order_') &&
        submittedPaymentId === `demo_payment_${payment.id}` &&
        signature === 'demo_signature'
      : await verifyRazorpayPayment({
          keyId: payment.gateway_key_id,
          keySecret: decryptSecret(payment.gateway_key_secret_encrypted),
        }, {
          orderId: submittedOrderId,
          paymentId: submittedPaymentId,
          signature,
          amount: Math.round(Number(payment.amount) * 100),
        });
    if (!verified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Razorpay could not verify this payment. Your booking is not confirmed.' });
    }

    const paidResult = await client.query(
      `UPDATE payments
       SET status='PAID', gateway_payment_id=$2, transaction_reference=$2,
           payment_date=NOW(), gateway_key_secret_encrypted=NULL, updated_at=NOW()
       WHERE id=$1
       RETURNING payment_date`,
      [payment.id, submittedPaymentId]
    );
    payment.gateway_payment_id = submittedPaymentId;
    payment.transaction_reference = submittedPaymentId;
    payment.payment_date = paidResult.rows[0].payment_date;
    const invoice = await ensurePaidBookingInvoice(client, payment);
    await client.query(
      `UPDATE bookings SET status='CONFIRMED', updated_at=NOW()
       WHERE id=$1 AND status='REQUESTED'`,
      [payment.booking_record_id]
    );
    payment.booking_status = 'CONFIRMED';
    await client.query(
      `UPDATE workspaces SET status='OCCUPIED', updated_at=NOW()
       WHERE id=$1 AND DATE($2::timestamptz) >= CURRENT_DATE`,
      [payment.workspace_id, payment.starts_at]
    );
    await client.query('COMMIT');
    notifyCustomerOfPayment(payment, invoice);
    res.json({
      success: true,
      bookingId: payment.booking_record_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/razorpay/:id/cancel', allowRoles('CUSTOMER'), ah(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT pay.id, pay.booking_id
       FROM payments pay
       JOIN customers customer ON customer.id = pay.customer_id
       WHERE pay.id=$1 AND pay.status='PENDING' AND customer.user_id=$2
       FOR UPDATE OF pay`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount) {
      await client.query(
        `UPDATE payments SET status='CANCELLED', gateway_key_secret_encrypted=NULL, updated_at=NOW()
         WHERE id=$1 AND status='PENDING'`,
        [result.rows[0].id]
      );
      await client.query(
        `UPDATE bookings SET status='CANCELLED', updated_at=NOW()
         WHERE id=$1 AND status='REQUESTED'`,
        [result.rows[0].booking_id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/:id/refund', allowRoles(...staffRoles), ah(async (req, res) => {
  const { amount, reason } = req.body;
  const refundAmt = Number(amount) || 0;
  const result = await pool.query(
    `UPDATE payments
     SET status='REFUNDED', refund_amount=$2, refund_reason=$3, updated_at=NOW()
     WHERE id::text = $1 OR payment_number = $1
     RETURNING *`,
    [req.params.id, refundAmt, reason || 'Refund issued']
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Payment record not found.' });
  res.json({ data: result.rows[0] });
}));

router.post('/:id/receive', allowRoles(...staffRoles), ah(async (req, res) => {
  const transactionReference = String(req.body.transactionReference || '').trim();
  if (transactionReference.length > 100) {
    return res.status(400).json({ error: 'Payment reference must be 100 characters or fewer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const params = [req.params.id];
    let scope = '';
    if (req.user.role !== 'SUPER_ADMIN') {
      if (!req.user.branch_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Your account is not assigned to a branch.' });
      }
      params.push(req.user.branch_id);
      scope = ` AND pay.branch_id=$${params.length}`;
    }

    const result = await client.query(
      `SELECT pay.*, booking.id AS booking_record_id, booking.status AS booking_status,
              booking.workspace_id,
              booking.starts_at, booking.ends_at, booking.subtotal, booking.tax_amount,
              booking.total_amount AS booking_total,
              customer.full_name AS customer_name, customer.email AS customer_email,
              branch.name AS branch_name,
              workspace.name AS workspace_name, inventory.name AS item_name
       FROM payments pay
       JOIN bookings booking ON booking.id=pay.booking_id
       JOIN customers customer ON customer.id=pay.customer_id
       JOIN branches branch ON branch.id=pay.branch_id
       LEFT JOIN workspaces workspace ON workspace.id=booking.workspace_id
       LEFT JOIN inventory_items inventory ON inventory.id=booking.inventory_item_id
       WHERE (pay.id::text=$1 OR pay.payment_number=$1)${scope}
       FOR UPDATE OF pay, booking`,
      params
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking payment was not found.' });
    }

    const payment = result.rows[0];
    const isNewlyPaid = payment.status !== 'PAID';
    if (!['CASH', 'ONLINE'].includes(String(payment.payment_method).toUpperCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only cash or online booking payments can be confirmed here.' });
    }
    if (payment.status !== 'PENDING' && payment.status !== 'PAID') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This payment is no longer pending.' });
    }

    if (payment.status !== 'PAID') {
      const updated = await client.query(
        `UPDATE payments
         SET status='PAID', payment_date=NOW(),
             transaction_reference=COALESCE(NULLIF($2, ''), transaction_reference),
             updated_at=NOW()
         WHERE id=$1
         RETURNING payment_date, transaction_reference`,
        [payment.id, transactionReference]
      );
      payment.payment_date = updated.rows[0].payment_date;
      payment.transaction_reference = updated.rows[0].transaction_reference;
    }
    const invoice = await ensurePaidBookingInvoice(client, payment);
    if (payment.booking_status === 'REQUESTED') {
      await client.query(
        `UPDATE bookings SET status='CONFIRMED', updated_at=NOW()
         WHERE id=$1 AND status='REQUESTED'`,
        [payment.booking_record_id]
      );
      payment.booking_status = 'CONFIRMED';
      await client.query(
        `UPDATE workspaces SET status='OCCUPIED', updated_at=NOW()
         WHERE id=$1 AND DATE($2::timestamptz) >= CURRENT_DATE`,
        [payment.workspace_id, payment.starts_at]
      );
    }
    await client.query('COMMIT');
    if (isNewlyPaid) notifyCustomerOfPayment(payment, invoice);
    res.json({
      success: true,
      data: {
        id: payment.id,
        payment_number: payment.payment_number,
        status: 'PAID',
        payment_date: payment.payment_date,
        invoice_number: invoice.invoice_number,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
