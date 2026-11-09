const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { formatShortBookingId } = require('../utils/bookingHelper');

router.get('/summary', ah(async (req, res) => {
  const u = req.user;
  let targetBranchId = null;
  if (u.role !== 'SUPER_ADMIN') {
    targetBranchId = u.branch_id;
  } else if (req.query.branch && req.query.branch.toLowerCase() !== 'all branches') {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.query.branch]);
    targetBranchId = bRes.rows[0]?.id || null;
  }

  const branchScoped = Boolean(targetBranchId);
  const where = branchScoped ? ' WHERE branch_id=$1' : '';
  const params = branchScoped ? [targetBranchId] : [];
  const queryCount = async (sql) => Number((await pool.query(sql, params)).rows[0]?.count || 0);

  // 1. Basic Counts
  const [customers, bookings, quotations, openComplaints, workspaces] = await Promise.all([
    queryCount(`SELECT COUNT(*)::int AS count FROM customers${where}`),
    queryCount(`SELECT COUNT(*)::int AS count FROM bookings${where}`),
    queryCount(`SELECT COUNT(*)::int AS count FROM quotations${where}`),
    queryCount(`SELECT COUNT(*)::int AS count FROM complaints${where}${branchScoped ? ' AND' : ' WHERE'} status IN ('OPEN','IN_PROGRESS')`),
    queryCount(`SELECT COUNT(*)::int AS count FROM workspaces${where}`),
  ]);

  // 2. Active bookings & customers
  const activeBookings = await queryCount(
    `SELECT COUNT(*)::int AS count FROM bookings${where}${branchScoped ? ' AND' : ' WHERE'} status IN ('CONFIRMED','REQUESTED')`
  );
  const activeCustomers = customers;

  // 3. Revenue calculation
  const revRes = await pool.query(
    `SELECT COALESCE(SUM(b.total_amount), 0) AS rev FROM bookings b${where ? ' WHERE b.branch_id=$1 AND' : ' WHERE'} b.status IN ('CONFIRMED','COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.booking_id=b.id AND i.status IN ('PAID','COMPLETED')
      )`,
    params
  );
  const invRes = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS rev FROM invoices${where}${branchScoped ? ' AND' : ' WHERE'} status IN ('PAID','COMPLETED')`,
    params
  );
  const totalRevenue = Number(revRes.rows[0].rev) + Number(invRes.rows[0].rev);

  // 4. Branch revenue breakdown
  const branchRevRes = await pool.query(`
    WITH booking_revenue AS (
      SELECT branch_id, SUM(total_amount) AS revenue
      FROM bookings b
      WHERE b.status IN ('CONFIRMED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM invoices i
          WHERE i.booking_id=b.id AND i.status IN ('PAID','COMPLETED')
        )
      GROUP BY branch_id
    ),
    invoice_revenue AS (
      SELECT branch_id, SUM(total_amount) AS revenue
      FROM invoices
      WHERE status IN ('PAID', 'COMPLETED')
      GROUP BY branch_id
    )
    SELECT b.name AS branch,
           COALESCE(br.revenue, 0) + COALESCE(ir.revenue, 0) AS revenue
    FROM branches b
    LEFT JOIN booking_revenue br ON br.branch_id = b.id
    LEFT JOIN invoice_revenue ir ON ir.branch_id = b.id
    ORDER BY b.name
  `);
  const branchRevenue = branchRevRes.rows.map(r => ({
    branch: r.branch,
    revenue: Number(r.revenue || 0),
  }));

  // 5. Monthly revenue and expenses for the current month and preceding five months.
  const monthlyRes = await pool.query(`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      )::date AS month_start
    ),
    booking_revenue AS (
      SELECT date_trunc('month', starts_at)::date AS month_start, SUM(total_amount) AS revenue
      FROM bookings b
      WHERE b.status IN ('CONFIRMED', 'COMPLETED')
        AND ($1::uuid IS NULL OR b.branch_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM invoices i
          WHERE i.booking_id=b.id AND i.status IN ('PAID','COMPLETED')
        )
      GROUP BY 1
    ),
    invoice_revenue AS (
      SELECT date_trunc('month', issue_date)::date AS month_start, SUM(total_amount) AS revenue
      FROM invoices
      WHERE status IN ('PAID', 'COMPLETED')
        AND ($1::uuid IS NULL OR branch_id = $1)
      GROUP BY 1
    ),
    monthly_expenses AS (
      SELECT date_trunc('month', expense_date)::date AS month_start, SUM(amount) AS expenses
      FROM expenses
      WHERE status IN ('APPROVED', 'COMPLETED')
        AND ($1::uuid IS NULL OR branch_id = $1)
      GROUP BY 1
    )
    SELECT to_char(m.month_start, 'Mon') AS month,
           COALESCE(br.revenue, 0) + COALESCE(ir.revenue, 0) AS revenue,
           COALESCE(me.expenses, 0) AS expenses
    FROM months m
    LEFT JOIN booking_revenue br USING (month_start)
    LEFT JOIN invoice_revenue ir USING (month_start)
    LEFT JOIN monthly_expenses me USING (month_start)
    ORDER BY m.month_start
  `, [targetBranchId]);
  const monthlyRevenue = monthlyRes.rows.map((row) => ({
    month: row.month,
    revenue: Number(row.revenue || 0),
    expenses: Number(row.expenses || 0),
  }));

  // 6. Occupancy calculation
  const totalSeatsRes = await pool.query(`SELECT COALESCE(SUM(capacity), 0)::int AS seats FROM workspaces${where}`, params);
  const totalSeats = Number(totalSeatsRes.rows[0]?.seats || 0);
  const occupancyPercent = totalSeats > 0
    ? Math.min(100, Math.round((activeBookings / totalSeats) * 100))
    : 0;
  const occupancy = `${occupancyPercent}%`;

  // 7. Recent bookings
  let recSql = `SELECT bk.id, bk.starts_at, bk.status, bk.total_amount,
                       c.full_name AS customer_name, c.company_name,
                       b.name AS branch_name,
                       w.name AS workspace_name
                FROM bookings bk
                JOIN customers c ON c.id = bk.customer_id
                JOIN branches b ON b.id = bk.branch_id
                JOIN workspaces w ON w.id = bk.workspace_id
                ${branchScoped ? 'WHERE bk.branch_id = $1' : ''}
                ORDER BY bk.created_at DESC LIMIT 6`;
  const recRes = await pool.query(recSql, params);
  const recentBookings = recRes.rows.map(r => {
    const shortId = formatShortBookingId(r.branch_name, r.id);
    return {
      id: shortId,
      booking_id: shortId,
      raw_id: r.id,
      customer: r.customer_name,
      customerName: r.customer_name,
      branch: r.branch_name,
      workspace: r.workspace_name,
      date: r.starts_at ? String(r.starts_at).slice(0, 10) : '',
      status: r.status === 'CONFIRMED' ? 'Confirmed' : r.status === 'COMPLETED' ? 'Completed' : r.status === 'CANCELLED' ? 'Cancelled' : 'Pending',
      amount: `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`,
    };
  });

  // 8. Attention items
  const attentionItems = [];
  const overduePay = await pool.query(`
    SELECT p.*, c.full_name AS customer_name, c.phone, b.name AS branch_name
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    JOIN branches b ON b.id = p.branch_id
    WHERE p.status = 'OVERDUE'
    ${branchScoped ? 'AND p.branch_id = $1' : ''}
    LIMIT 2
  `, params);

  overduePay.rows.forEach(p => {
    attentionItems.push({
      branch: p.branch_name,
      color: 'red',
      title: 'Overdue payment',
      text: `${p.customer_name} · ₹${Number(p.amount).toLocaleString('en-IN')}`,
      tag: 'Overdue',
      payment: {
        customer: p.customer_name,
        phone: p.phone || '+91 98480 12345',
        invoice: p.payment_number,
        amount: `₹${Number(p.amount).toLocaleString('en-IN')}`,
        due: p.due_date ? String(p.due_date).slice(0, 10) : 'Immediate',
      }
    });
  });

  const pendingQuote = await pool.query(`
    SELECT q.*, b.name AS branch_name
    FROM quotations q
    JOIN branches b ON b.id = q.branch_id
    WHERE q.status IN ('SENT', 'DRAFT')
    ${branchScoped ? 'AND q.branch_id = $1' : ''}
    LIMIT 1
  `, params);

  if (pendingQuote.rowCount) {
    const q = pendingQuote.rows[0];
    attentionItems.push({
      branch: q.branch_name,
      color: 'blue',
      title: 'Quotation awaiting response',
      text: `${q.quotation_number} · ${q.branch_name}`,
      tag: 'Pending',
    });
  }

  const openComp = await pool.query(`
    SELECT cm.*, b.name AS branch_name
    FROM complaints cm
    JOIN branches b ON b.id = cm.branch_id
    WHERE cm.status IN ('OPEN', 'IN_PROGRESS')
    ${branchScoped ? 'AND cm.branch_id = $1' : ''}
    LIMIT 1
  `, params);

  if (openComp.rowCount) {
    const cm = openComp.rows[0];
    attentionItems.push({
      branch: cm.branch_name,
      color: 'orange',
      title: 'Customer inquiry / ticket',
      text: `${cm.title} · ${cm.priority} Priority`,
      tag: 'Open',
    });
  }

  res.json({
    data: {
      customers,
      bookings,
      quotations,
      openComplaints,
      workspaces,
      activeBookings,
      activeCustomers,
      revenue: totalRevenue,
      totalRevenue,
      branchRevenue,
      branches: branchRevenue,
      monthlyRevenue,
      occupancy,
      occupancyRate: occupancy,
      recentBookings,
      attentionItems,
    }
  });
}));

module.exports = router;
