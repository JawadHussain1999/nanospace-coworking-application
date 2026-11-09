const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');
const { formatShortBookingId, resolveBookingId } = require('../utils/bookingHelper');
const { calculateWorkspaceCapacity } = require('../utils/workspaceCapacity');
const { sendBookingNotificationEmail } = require('../utils/mailer');
const {
  createRazorpayOrder,
  encryptSecret,
  getBranchRazorpayCredentials,
  isRazorpayDemoMode,
} = require('../utils/razorpay');
const adminRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'];
const isValidDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

router.get('/calendar', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT b.*, w.code AS workspace_code, w.name AS workspace_name, c.full_name AS customer_name,
                    c.email AS customer_email, ii.name AS plan_name, b2.name AS branch_name
             FROM bookings b
             JOIN workspaces w ON w.id = b.workspace_id
             JOIN customers c ON c.id = b.customer_id
             LEFT JOIN inventory_items ii ON ii.id = b.inventory_item_id
             LEFT JOIN branches b2 ON b2.id = b.branch_id
             WHERE 1=1`;

  if (u.role !== 'SUPER_ADMIN') {
    if (u.role === 'CUSTOMER') {
      p.push(u.id);
      sql += ` AND c.user_id=$${p.length}`;
    } else {
      p.push(u.branch_id);
      sql += ` AND b.branch_id=$${p.length}`;
    }
  } else if (req.query.branch && req.query.branch.toLowerCase() !== 'all branches') {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.query.branch]);
    if (bRes.rowCount) {
      p.push(bRes.rows[0].id);
      sql += ` AND b.branch_id=$${p.length}`;
    }
  }

  if (req.query.date) {
    p.push(req.query.date);
    sql += ` AND DATE(b.starts_at)=$${p.length}`;
  }

  sql += ' ORDER BY b.starts_at ASC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => {
    const shortId = formatShortBookingId(r.branch_name, r.id);
    return {
      ...r,
      id: shortId,
      booking_id: shortId,
      raw_id: r.id,
      customer: r.customer_name,
      customerName: r.customer_name,
      branch: r.branch_name,
      workspace: r.workspace_name,
      date: r.starts_at ? String(r.starts_at).slice(0, 10) : '',
      amount: `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`,
    };
  });

  res.json({ data: rows });
}));

router.get('/availability', ah(async (req, res) => {
  const { branch, date, workspaceId } = req.query;
  const u = req.user;
  let branchId = u.role === 'SUPER_ADMIN' ? null : u.branch_id;
  if (branch) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [branch]);
    if (bRes.rowCount) branchId = bRes.rows[0].id;
  }
  if (!branchId) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branchId = bRes.rows[0]?.id;
  }

  const queryDate = date || new Date().toISOString().slice(0, 10);
  if (!isValidDateOnly(queryDate)) {
    return res.status(400).json({ error: 'Date must use the YYYY-MM-DD format.' });
  }
  const currentDate = await pool.query('SELECT CURRENT_DATE::text AS today');
  const isHistoricalDate = queryDate < currentDate.rows[0].today;
  const bookedWs = await pool.query(
    `SELECT workspace_id, COALESCE(SUM(seat_count), 0)::int AS booked_seats FROM bookings
     WHERE branch_id = $1 AND status IN ('CONFIRMED', 'REQUESTED')
       AND starts_at < ($2::date + INTERVAL '1 day')
       AND ends_at > $2::date
     GROUP BY workspace_id`,
    [branchId, queryDate]
  );
  const bookedSeatsByWorkspace = new Map(bookedWs.rows.map((row) => [
    row.workspace_id,
    Number(row.booked_seats) || 0,
  ]));

  const allWs = await pool.query(
    `SELECT id, code, name, workspace_type, capacity, status, floor, layout_x, layout_y, layout_width, layout_height FROM workspaces
     WHERE branch_id = $1 AND is_active = TRUE AND layout_published = TRUE`,
    [branchId]
  );

  const getWorkspaceAvailability = (workspace) => calculateWorkspaceCapacity(
    workspace.capacity,
    bookedSeatsByWorkspace.get(workspace.id) || 0,
    workspace.status,
    isHistoricalDate
  );
  const availableSeats = allWs.rows
    .filter((workspace) => getWorkspaceAvailability(workspace).availableCapacity > 0 &&
      getWorkspaceAvailability(workspace).status === 'AVAILABLE')
    .map(w => w.code || w.id);

  const occupiedSeats = allWs.rows
    .filter((workspace) => getWorkspaceAvailability(workspace).status !== 'AVAILABLE')
    .map(w => w.code || w.id);

  const bookedSeats = allWs.rows
    .filter((workspace) => getWorkspaceAvailability(workspace).status === 'BOOKED')
    .map(w => w.code || w.id);

  res.json({
    data: {
      availableSeats,
      available: availableSeats,
      occupiedSeats,
      occupied: occupiedSeats,
      bookedSeats,
      booked: bookedSeats,
      totalWorkspaces: allWs.rowCount,
      occupiedCount: occupiedSeats.length,
      availableSeatCount: allWs.rows.reduce((total, workspace) =>
        total + (getWorkspaceAvailability(workspace).status === 'AVAILABLE'
          ? getWorkspaceAvailability(workspace).availableCapacity
          : 0), 0),
      workspaces: allWs.rows.map((workspace) => {
        const availability = getWorkspaceAvailability(workspace);
        return {
          ...workspace,
          type: workspace.workspace_type,
          bookedSeats: availability.bookedSeats,
          availableCapacity: availability.status === 'AVAILABLE' ? availability.availableCapacity : 0,
          status: availability.status,
        };
      })
    }
  });
}));

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT b.*, w.code AS workspace_code, w.name AS workspace_name, c.full_name AS customer_name,
                    c.email AS customer_email, ii.name AS plan_name, b2.name AS branch_name
             FROM bookings b
             JOIN workspaces w ON w.id = b.workspace_id
             JOIN customers c ON c.id = b.customer_id
             LEFT JOIN inventory_items ii ON ii.id = b.inventory_item_id
             LEFT JOIN branches b2 ON b2.id = b.branch_id
             WHERE 1=1`;

  if (u.role !== 'SUPER_ADMIN') {
    if (u.role === 'CUSTOMER') {
      p.push(u.id);
      sql += ` AND c.user_id=$${p.length}`;
    } else if (u.role === 'EMPLOYEE') {
      return res.json({ data: [] });
    } else {
      p.push(u.branch_id);
      sql += ` AND b.branch_id=$${p.length}`;
    }
  } else if (req.query.branch && req.query.branch.toLowerCase() !== 'all branches') {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.query.branch]);
    if (bRes.rowCount) {
      p.push(bRes.rows[0].id);
      sql += ` AND b.branch_id=$${p.length}`;
    }
  }

  if (req.query.status) {
    p.push(req.query.status);
    sql += ` AND b.status=$${p.length}`;
  }

  sql += ' ORDER BY b.starts_at DESC';
  const result = await pool.query(sql, p);

  const rows = result.rows.map(r => {
    const shortId = formatShortBookingId(r.branch_name, r.id);
    return {
      ...r,
      id: shortId,
      booking_id: shortId,
      raw_id: r.id,
      customer: r.customer_name,
      customerName: r.customer_name,
      branch: r.branch_name,
      workspace: r.workspace_name,
      date: r.starts_at ? String(r.starts_at).slice(0, 10) : '',
      amount: `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`,
    };
  });

  res.json({ data: rows });
}));

router.post('/', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN', 'CUSTOMER'), ah(async (req, res) => {
  const u = req.user;
  const {
    branchId, workspaceId, customerId, inventoryItemId, startsAt, endsAt,
    quantity = 1, seatCount = req.body.seat_count ?? 1, status = 'CONFIRMED',
    bookingSource = 'ONLINE', notes, advanceAmount, bookingCategory
  } = req.body;
  const isCustomerPayment = u.role === 'CUSTOMER';
  const requestedSeatCount = Number(seatCount);
  if (!Number.isInteger(requestedSeatCount) || requestedSeatCount < 1) {
    return res.status(400).json({ error: 'Seat count must be a positive whole number.' });
  }
  let branch = branchId;
  if (!branch && req.body.branch) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.body.branch]);
    if (bRes.rowCount) branch = bRes.rows[0].id;
  }
  if (!branch) {
    branch = u.role === 'SUPER_ADMIN' ? null : u.branch_id;
  }
  if (!branch) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branch = bRes.rows[0]?.id;
  }
  let razorpayCredentials = null;
  const isDemoPayment = isCustomerPayment && isRazorpayDemoMode();
  if (isCustomerPayment && !isDemoPayment) {
    try {
      razorpayCredentials = await getBranchRazorpayCredentials(branch);
    } catch (error) {
      if (error.message.includes('RAZORPAY_CREDENTIALS_ENCRYPTION_KEY')) {
        return res.status(503).json({ error: 'Branch online payments are temporarily unavailable. Please contact the branch.' });
      }
      throw error;
    }
    if (!razorpayCredentials) {
      return res.status(503).json({ error: 'Online payments are not configured for this branch yet. Please contact the branch.' });
    }
  }

  let wsId = workspaceId;
  const requestedSeat = req.body.seat || req.body.seatCode || req.body.workspaceCode;
  if (requestedSeat) {
    const seatWs = await pool.query(
      'SELECT id FROM workspaces WHERE branch_id = $1 AND layout_published = TRUE AND is_active = TRUE AND (code ILIKE $2 OR name ILIKE $2) LIMIT 1',
      [branch, requestedSeat]
    );
    if (seatWs.rowCount) wsId = seatWs.rows[0].id;
  }
  if (!wsId || !/^[0-9a-f]{8}-/i.test(wsId)) {
    if (typeof wsId === 'string' && wsId) {
      const codeWs = await pool.query(
        'SELECT id FROM workspaces WHERE branch_id = $1 AND layout_published = TRUE AND is_active = TRUE AND (code ILIKE $2 OR name ILIKE $2) LIMIT 1',
        [branch, wsId]
      );
      if (codeWs.rowCount) wsId = codeWs.rows[0].id;
    }
  }
  if (!wsId || !/^[0-9a-f]{8}-/i.test(wsId)) {
    const wsRes = await pool.query("SELECT id FROM workspaces WHERE branch_id = $1 AND is_active = TRUE AND layout_published = TRUE AND status != 'OCCUPIED' LIMIT 1", [branch]);
    wsId = wsRes.rows[0]?.id;
  }
  if (!wsId) return res.status(404).json({ error: 'No workspaces available in this branch.' });

  const sAt = startsAt || req.body.date || new Date().toISOString();
  const startTime = Date.parse(sAt);
  if (!Number.isFinite(startTime)) {
    return res.status(400).json({ error: 'Booking start date is invalid.' });
  }
  const eAt = endsAt || new Date(startTime + 86400000).toISOString();
  const endTime = Date.parse(eAt);
  if (!Number.isFinite(endTime) || endTime <= startTime) {
    return res.status(400).json({ error: 'Booking end date must be after its start date.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ws = await client.query(`SELECT * FROM workspaces WHERE id=$1 AND is_active=TRUE AND layout_published=TRUE FOR UPDATE`, [wsId]);
    if (!ws.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Workspace not found.' }); }
    if (bookingCategory) {
      const workspaceType = String(ws.rows[0].workspace_type || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const categoryMatches = {
        hot: /HOTDESK|FLEX|OPEN.?DESK/.test(workspaceType),
        dedicated: /DEDICATED/.test(workspaceType),
        office: /PRIVATE.?CABIN|CABIN|OFFICE/.test(workspaceType),
        meeting: /CONFERENCE|MEETING|BOARDROOM/.test(workspaceType),
        podcast: /PODCAST|STUDIO|RECORD/.test(workspaceType),
      };
      if (!Object.prototype.hasOwnProperty.call(categoryMatches, bookingCategory) || !categoryMatches[bookingCategory]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The selected workspace does not match the chosen booking type.' });
      }
    }

    const scheduleDate = await client.query(
      'SELECT DATE($1::timestamptz) < CURRENT_DATE AS is_historical',
      [sAt]
    );
    const isHistoricalBooking = scheduleDate.rows[0].is_historical;
    if (!isHistoricalBooking && ['MAINTENANCE', 'RESERVED'].includes(ws.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Workspace "${ws.rows[0].name || ws.rows[0].code}" is not available for this date.` });
    }

    // Locking the workspace row above serializes capacity checks for simultaneous bookings.
    const overlapRes = await client.query(
      `SELECT COALESCE(SUM(seat_count), 0)::int AS booked_seats FROM bookings
       WHERE workspace_id = $1
         AND status IN ('CONFIRMED', 'REQUESTED')
         AND starts_at < $3::timestamptz AND ends_at > $2::timestamptz`,
      [wsId, sAt, eAt]
    );
    const workspaceAvailability = calculateWorkspaceCapacity(
      ws.rows[0].capacity,
      overlapRes.rows[0].booked_seats,
      ws.rows[0].status,
      isHistoricalBooking
    );
    if (requestedSeatCount > workspaceAvailability.availableCapacity) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: workspaceAvailability.availableCapacity > 0
          ? `Only ${workspaceAvailability.availableCapacity} of ${workspaceAvailability.capacity} seats remain in "${ws.rows[0].name || ws.rows[0].code}" for this schedule.`
          : workspaceAvailability.status === 'OCCUPIED'
            ? `Workspace "${ws.rows[0].name || ws.rows[0].code}" is not available for this date.`
            : `Workspace "${ws.rows[0].name || ws.rows[0].code}" is already fully booked for this schedule.`
      });
    }

    let customer;
    if (u.role === 'CUSTOMER') {
      customer = await client.query('SELECT * FROM customers WHERE user_id=$1 OR LOWER(email)=LOWER($2) LIMIT 1', [u.id, u.email]);
      if (customer.rowCount && !customer.rows[0].user_id) {
        await client.query('UPDATE customers SET user_id=$1 WHERE id=$2', [u.id, customer.rows[0].id]);
      }
    } else {
      let cId = customerId;
      if (!cId || !/^[0-9a-f]{8}-/i.test(cId)) {
        const cRes = await client.query('SELECT * FROM customers WHERE branch_id = $1 LIMIT 1', [branch]);
        customer = cRes;
      } else {
        customer = await client.query('SELECT * FROM customers WHERE id=$1', [cId]);
      }
    }
    if (!customer.rowCount) {
      // Create quick customer profile if needed
      const name = req.body.customerName || req.body.name || u.full_name || 'Walk-in Client';
      const email = req.body.email || u.email || `client_${Date.now()}@example.com`;
      const createdCust = await client.query(
        `INSERT INTO customers(branch_id, full_name, email, phone, user_id)
         VALUES($1, $2, $3, $4, $5) RETURNING *`,
        [branch, name, email, req.body.phone || null, u.role === 'CUSTOMER' ? u.id : null]
      );
      customer = createdCust;
    }

    let itemId = inventoryItemId || ws.rows[0].inventory_item_id;
    if (isCustomerPayment && (!itemId || !/^[0-9a-f]{8}-/i.test(itemId))) {
      const catalogItem = await client.query(
        `SELECT id FROM inventory_items
         WHERE LOWER(name) = LOWER($1) AND is_active=TRUE AND sellable=TRUE
         ORDER BY created_at ASC LIMIT 1`,
        [req.body.itemName || '']
      );
      itemId = catalogItem.rows[0]?.id || null;
    }
    let rate = 0, tax = 0;
    if (itemId && /^[0-9a-f]{8}-/i.test(itemId)) {
      const item = await client.query(
        `SELECT rate, tax_percent FROM inventory_items
         WHERE id=$1 AND is_active=TRUE AND sellable=TRUE`,
        [itemId]
      );
      if (item.rowCount) {
        rate = Number(item.rows[0].rate);
        tax = Number(item.rows[0].tax_percent);
      }
    }
    if (isCustomerPayment && !rate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The selected plan has no active server-side price. Please contact the branch.' });
    }
    if (!rate && req.body.unitPrice) rate = Number(req.body.unitPrice);
    if (!rate && req.body.total) rate = Number(req.body.total);
    if (!rate) rate = 500;

    const baseSubtotal = rate * Number(quantity);
    let parkingSubtotal = 0;
    let parkingTaxAmount = 0;
    let parkingTaxRate = 0;
    const parkingItemId = req.body.parkingItemId;
    if (parkingItemId && isCustomerPayment) {
      const parkingItem = await client.query(
        `SELECT rate, tax_percent FROM inventory_items
         WHERE name ILIKE '%parking%' AND is_active=TRUE AND sellable=TRUE
         ORDER BY created_at ASC LIMIT 1`
      );
      if (!parkingItem.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Parking is not available for online payment at this branch.' });
      }
      parkingSubtotal = Number(parkingItem.rows[0].rate);
      parkingTaxRate = Number(parkingItem.rows[0].tax_percent);
      parkingTaxAmount = Number(((parkingSubtotal * parkingTaxRate) / 100).toFixed(2));
    } else if (parkingItemId && /^[0-9a-f]{8}-/i.test(parkingItemId)) {
      const parkingItem = await client.query(
        'SELECT rate, tax_percent FROM inventory_items WHERE id=$1 AND is_active=TRUE AND sellable=TRUE',
        [parkingItemId]
      );
      if (parkingItem.rowCount) {
        parkingSubtotal = Number(parkingItem.rows[0].rate);
        parkingTaxRate = Number(parkingItem.rows[0].tax_percent);
        parkingTaxAmount = Number(((parkingSubtotal * parkingTaxRate) / 100).toFixed(2));
      }
    }
    const grossTotal = baseSubtotal + parkingSubtotal;
    const onlineTaxAmount = Number((
      (baseSubtotal * tax / (100 + tax)) +
      (parkingSubtotal * parkingTaxRate / (100 + parkingTaxRate))
    ).toFixed(2));
    const subtotal = isCustomerPayment
      ? Number((grossTotal - onlineTaxAmount).toFixed(2))
      : baseSubtotal + parkingSubtotal;
    const taxAmount = isCustomerPayment
      ? onlineTaxAmount
      : Number((((baseSubtotal * tax) / 100) + parkingTaxAmount).toFixed(2));
    const total = isCustomerPayment
      ? Number(grossTotal.toFixed(2))
      : req.body.total ? Number(req.body.total) : Number((subtotal + taxAmount).toFixed(2));
    if (isCustomerPayment && (!Number.isFinite(total) || total < 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The booking total must be at least ₹1 to pay online.' });
    }
    const requestedAdvance = advanceAmount === undefined || advanceAmount === null || advanceAmount === ''
      ? (isCustomerPayment ? Number((total * 0.20).toFixed(2)) : 0)
      : Number(advanceAmount);
    const minimumAdvance = isCustomerPayment ? 1 : 0;
    if (!Number.isFinite(requestedAdvance) || requestedAdvance < minimumAdvance || requestedAdvance > total) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Advance amount must be between ₹${minimumAdvance} and the booking total.` });
    }
    const advanceAmountValue = Number(requestedAdvance.toFixed(2));
    const bookingStatus = isCustomerPayment ? 'REQUESTED' : (status || 'CONFIRMED').toUpperCase();
    const paymentMethod = String(req.body.paymentMethod || 'CASH').toUpperCase();
    if (!isCustomerPayment && advanceAmountValue > 0 && !['CASH', 'ONLINE'].includes(paymentMethod)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payment method must be cash at counter or online.' });
    }

    const created = await client.query(
      `INSERT INTO bookings(branch_id, workspace_id, customer_id, inventory_item_id, created_by, starts_at, ends_at, quantity, seat_count, unit_rate, tax_percent, subtotal, tax_amount, total_amount, advance_amount, status, booking_source, notes)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
      [branch, wsId, customer.rows[0].id, (itemId && /^[0-9a-f]{8}-/i.test(itemId)) ? itemId : null, u.id, sAt, eAt, quantity, requestedSeatCount, rate, tax, subtotal, taxAmount, total, advanceAmountValue, bookingStatus, (bookingSource || 'ONLINE').toUpperCase(), notes || null]
    );

    if (bookingStatus === 'CONFIRMED' && !isHistoricalBooking) {
      await client.query(`UPDATE workspaces SET status = 'OCCUPIED', updated_at = NOW() WHERE id = $1`, [wsId]);
    }

    const bRes = await client.query('SELECT name FROM branches WHERE id=$1', [branch]);
    const branchName = bRes.rows[0]?.name || 'kphb';
    const createdRow = created.rows[0];
    const shortId = formatShortBookingId(branchName, createdRow.id);
    let counterPayment = null;
    if (!isCustomerPayment && advanceAmountValue > 0) {
      const paymentResult = await client.query(
        `INSERT INTO payments(payment_number, customer_id, branch_id, booking_id, amount,
                              payment_method, due_date, status, notes)
         VALUES($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'PENDING', $7)
         RETURNING id, payment_number, amount, payment_method, status`,
        [
          `PAY-${createdRow.id.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
          customer.rows[0].id,
          branch,
          createdRow.id,
          advanceAmountValue,
          paymentMethod,
          `${paymentMethod === 'CASH' ? 'Cash at counter' : 'Online payment'} pending for booking ${shortId}`,
        ]
      );
      counterPayment = paymentResult.rows[0];
    }

    // ========================================================
    // CREATE NOTIFICATIONS FOR SUPER ADMIN & BRANCH ADMIN
    // ========================================================
    const now = new Date();
    const formattedBookingTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const formattedBookingDate = now.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const bookedAtFormatted = `${formattedBookingDate} at ${formattedBookingTime}`;

    const scheduleDateStart = new Date(sAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const scheduleDateEnd = new Date(eAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const scheduleFormatted = scheduleDateStart === scheduleDateEnd
      ? scheduleDateStart
      : `${scheduleDateStart} – ${scheduleDateEnd}`;

    const formattedAmount = `₹${Number(total || 0).toLocaleString('en-IN')}`;
    const wsRow = ws.rows[0] || {};
    const workspaceName = wsRow.name || wsRow.code || 'Workspace';
    const customerRow = customer.rows[0] || {};
    const customerName = customerRow.full_name || req.body.customerName || 'Customer';
    const customerEmail = customerRow.email || '';

    const notifTitle = `New Booking: ${shortId} (${branchName})`;
    const notifMessage = `Reservation received on ${bookedAtFormatted}.\n` +
      `• Client: ${customerName}${customerEmail ? ` (${customerEmail})` : ''}\n` +
      `• Workspace: ${workspaceName}${wsRow.code ? ` [${wsRow.code}]` : ''}\n` +
      `• Branch: ${branchName}\n` +
      `• Schedule: ${scheduleFormatted}\n` +
      `• Amount: ${formattedAmount}\n` +
      `• Date & Time: ${bookedAtFormatted}`;

    // Query all Super Admins AND Branch Admins for this branch
    const adminUsers = await client.query(
      `SELECT id, full_name, email, role, branch_id
       FROM users
       WHERE is_active = TRUE
         AND (
           role = 'SUPER_ADMIN'
           OR (role = 'BRANCH_ADMIN' AND (branch_id = $1 OR branch_id IS NULL))
         )`,
      [branch]
    );

    // Insert in-app notifications
    for (const admin of adminUsers.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [admin.id, notifTitle, notifMessage]
      );
    }

    await client.query('COMMIT');

    let checkout = null;
    if (isCustomerPayment) {
      try {
        const order = isDemoPayment
          ? {
              id: `demo_order_${crypto.randomUUID()}`,
              amount: Math.round(advanceAmountValue * 100),
              currency: 'INR',
            }
          : await createRazorpayOrder(razorpayCredentials, {
              amount: Math.round(advanceAmountValue * 100),
              receipt: `booking_${createdRow.id.replace(/-/g, '').slice(0, 30)}`,
              notes: { bookingId: createdRow.id, branchId: branch },
            });
        const paymentResult = await pool.query(
          `INSERT INTO payments(payment_number, customer_id, branch_id, booking_id, amount,
                                payment_method, due_date, status, gateway_order_id,
                                gateway_key_id, gateway_key_secret_encrypted, notes)
           VALUES($1, $2, $3, $4, $5, 'RAZORPAY', CURRENT_DATE, 'PENDING', $6, $7, $8, $9)
           RETURNING id`,
          [
            `PAY-${createdRow.id.slice(0, 8).toUpperCase()}`,
            customer.rows[0].id,
            branch,
            createdRow.id,
            advanceAmountValue,
            order.id, 
            isDemoPayment ? 'RAZORPAY_DEMO' : razorpayCredentials.keyId,
            isDemoPayment ? null : encryptSecret(razorpayCredentials.keySecret),
            `${isDemoPayment ? 'Demo payment' : 'Razorpay order'} for booking ${shortId}`,
          ]
        );
        checkout = {
          ...(isDemoPayment ? { mode: 'demo' } : {}),
          paymentId: paymentResult.rows[0].id,
          keyId: isDemoPayment ? null : razorpayCredentials.keyId,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          name: 'NanoSpace',
          description: `${workspaceName} · ${branchName}`,
          prefill: { name: customerName, email: customerEmail, contact: customerRow.phone || '' },
        };
      } catch (error) {
        console.error('Could not create Razorpay order for booking:', error.message);
        await pool.query(
          `UPDATE bookings SET status='CANCELLED', updated_at=NOW() WHERE id=$1 AND status='REQUESTED'`,
          [createdRow.id]
        );
        return res.status(502).json({ error: 'Razorpay could not start the payment. Please retry your booking.' });
      }
    }

    // Trigger async email notifications if SMTP is active
    for (const admin of adminUsers.rows) {
      if (admin.email) {
        sendBookingNotificationEmail({
          adminEmail: admin.email,
          adminName: admin.full_name || 'Admin',
          bookingId: shortId,
          customerName,
          customerEmail,
          branchName,
          workspaceName,
          amount: formattedAmount,
          bookedAt: bookedAtFormatted,
          schedule: scheduleFormatted,
        }).catch((e) => console.error('Booking notification email error:', e.message));
      }
    }
    res.status(201).json({
      data: {
        ...createdRow,
        id: shortId,
        booking_id: shortId,
        raw_id: createdRow.id,
        branch_name: branchName,
        branch: branchName,
        ...(counterPayment ? { paymentRecord: counterPayment } : {}),
        ...(checkout ? { paymentRequired: true, checkout } : {}),
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/:id', ah(async (req, res) => {
  const u = req.user;
  const resolvedId = await resolveBookingId(pool, req.params.id);
  const p = [resolvedId];
  let sql = `SELECT b.*, w.code AS workspace_code, w.name AS workspace_name,
                    c.full_name AS customer_name, c.user_id AS customer_user_id,
                    b2.name AS branch_name
             FROM bookings b
             JOIN workspaces w ON w.id = b.workspace_id
             JOIN customers c ON c.id = b.customer_id
             LEFT JOIN branches b2 ON b2.id = b.branch_id
             WHERE b.id::text = $1`;

  if (u.role !== 'SUPER_ADMIN') {
    if (u.role === 'CUSTOMER') {
      p.push(u.id);
      sql += ` AND c.user_id=$${p.length}`;
    } else {
      p.push(u.branch_id);
      sql += ` AND b.branch_id=$${p.length}`;
    }
  }

  const result = await pool.query(sql, p);
  if (!result.rowCount) return res.status(404).json({ error: 'Booking not found.' });

  const r = result.rows[0];
  const shortId = formatShortBookingId(r.branch_name, r.id);
  res.json({
    data: {
      ...r,
      id: shortId,
      booking_id: shortId,
      raw_id: r.id,
      customer: r.customer_name,
      customerName: r.customer_name,
      branch: r.branch_name,
      workspace: r.workspace_name,
      date: r.starts_at ? String(r.starts_at).slice(0, 10) : '',
      amount: `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`,
    }
  });
}));

router.patch('/:id/status', allowRoles(...adminRoles), ah(async (req, res) => {
  const { status } = req.body;
  const normalized = String(status).toUpperCase();
  if (!['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(normalized)) {
    return res.status(400).json({ error: 'Invalid booking status.' });
  }
  const resolvedId = await resolveBookingId(pool, req.params.id);
  const p = [resolvedId, normalized];
  let sql = 'UPDATE bookings SET status=$2, updated_at=NOW() WHERE id=$1';
  if (req.user.role !== 'SUPER_ADMIN') {
    p.push(req.user.branch_id);
    sql += ` AND branch_id=$${p.length}`;
  }
  sql += ' RETURNING *';
  const result = await pool.query(sql, p);
  if (!result.rowCount) return res.status(404).json({ error: 'Booking not found.' });
  const updated = result.rows[0];
  if (['CANCELLED', 'COMPLETED'].includes(normalized)) {
    const activeOther = await pool.query(
      `SELECT id FROM bookings WHERE workspace_id = $1 AND id != $2 AND status IN ('CONFIRMED', 'REQUESTED') AND ends_at >= NOW()`,
      [updated.workspace_id, updated.id]
    );
    if (!activeOther.rowCount) {
      await pool.query(`UPDATE workspaces SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND status = 'OCCUPIED'`, [updated.workspace_id]);
    }
  } else if (normalized === 'CONFIRMED') {
    await pool.query(`UPDATE workspaces SET status = 'OCCUPIED', updated_at = NOW() WHERE id = $1`, [updated.workspace_id]);
  }
  const bRes = await pool.query('SELECT name FROM branches WHERE id=$1', [updated.branch_id]);
  const shortId = formatShortBookingId(bRes.rows[0]?.name, updated.id);
  res.json({ data: { ...updated, id: shortId, booking_id: shortId, raw_id: updated.id } });
}));

router.post('/:id/cancel', allowRoles(...adminRoles, 'CUSTOMER'), ah(async (req, res) => {
  const resolvedId = await resolveBookingId(pool, req.params.id);
  const result = await pool.query(
    `UPDATE bookings SET status='CANCELLED', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [resolvedId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Booking not found.' });
  const updated = result.rows[0];
  const activeOther = await pool.query(
    `SELECT id FROM bookings WHERE workspace_id = $1 AND id != $2 AND status IN ('CONFIRMED', 'REQUESTED') AND ends_at >= NOW()`,
    [updated.workspace_id, updated.id]
  );
  if (!activeOther.rowCount) {
    await pool.query(`UPDATE workspaces SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND status = 'OCCUPIED'`, [updated.workspace_id]);
  }
  const bRes = await pool.query('SELECT name FROM branches WHERE id=$1', [updated.branch_id]);
  const shortId = formatShortBookingId(bRes.rows[0]?.name, updated.id);
  res.json({ data: { ...updated, id: shortId, booking_id: shortId, raw_id: updated.id } });
}));

router.post('/:id/extend', allowRoles(...adminRoles), ah(async (req, res) => {
  const days = Number(req.body.days || 1);
  const resolvedId = await resolveBookingId(pool, req.params.id);
  const result = await pool.query(
    `UPDATE bookings
     SET ends_at = ends_at + ($2 * INTERVAL '1 day'), updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [resolvedId, days]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Booking not found.' });
  const updated = result.rows[0];
  const bRes = await pool.query('SELECT name FROM branches WHERE id=$1', [updated.branch_id]);
  const shortId = formatShortBookingId(bRes.rows[0]?.name, updated.id);
  res.json({ data: { ...updated, id: shortId, booking_id: shortId, raw_id: updated.id } });
}));

module.exports = router;
