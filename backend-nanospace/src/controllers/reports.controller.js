const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');

router.get('/revenue', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch,
           COALESCE(SUM(bk.total_amount), 0) + COALESCE(SUM(inv.total_amount), 0) AS total_revenue
    FROM branches b
    LEFT JOIN bookings bk ON bk.branch_id = b.id AND bk.status IN ('CONFIRMED', 'COMPLETED')
    LEFT JOIN invoices inv ON inv.branch_id = b.id AND inv.status IN ('PAID', 'COMPLETED')
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => ({
    metric: 'Branch Revenue',
    current: `₹${Number(r.total_revenue || 0).toLocaleString('en-IN')}`,
    branch: r.branch,
    period: 'Current Quarter',
  }));
  res.json({ data });
}));

router.get('/bookings', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch, COUNT(bk.id)::int AS count
    FROM branches b
    LEFT JOIN bookings bk ON bk.branch_id = b.id
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => ({
    metric: 'Total Bookings',
    current: `${r.count} reservations`,
    branch: r.branch,
    period: 'All Time',
  }));
  res.json({ data });
}));

router.get('/expenses', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch, COALESCE(SUM(ex.amount), 0) AS total_expenses
    FROM branches b
    LEFT JOIN expenses ex ON ex.branch_id = b.id
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => ({
    metric: 'Operating Expenses',
    current: `₹${Number(r.total_expenses || 0).toLocaleString('en-IN')}`,
    branch: r.branch,
    period: 'Current Month',
  }));
  res.json({ data });
}));

router.get('/occupancy', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch,
           COUNT(w.id)::int AS total_spaces,
           COUNT(bk.id)::int AS active_bookings
    FROM branches b
    LEFT JOIN workspaces w ON w.branch_id = b.id AND w.is_active = TRUE
    LEFT JOIN bookings bk ON bk.branch_id = b.id AND bk.status IN ('CONFIRMED', 'COMPLETED')
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => {
    const rate = r.total_spaces > 0 ? Math.min(100, Math.round((r.active_bookings / r.total_spaces) * 100)) : 75;
    return {
      metric: 'Occupancy Rate',
      current: `${rate}%`,
      branch: r.branch,
      period: 'Live',
    };
  });
  res.json({ data });
}));

router.get('/customers', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch, COUNT(c.id)::int AS customer_count
    FROM branches b
    LEFT JOIN customers c ON c.branch_id = b.id
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => ({
    metric: 'Active Customers',
    current: `${r.customer_count} members`,
    branch: r.branch,
    period: 'Active Accounts',
  }));
  res.json({ data });
}));

router.get('/employees', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch, COUNT(u.id)::int AS staff_count
    FROM branches b
    LEFT JOIN users u ON u.branch_id = b.id AND u.role IN ('BRANCH_ADMIN', 'RECEPTION_ADMIN', 'EMPLOYEE')
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => ({
    metric: 'Staff Headcount',
    current: `${r.staff_count} employees`,
    branch: r.branch,
    period: 'On Roll',
  }));
  res.json({ data });
}));

router.get('/payroll', ah(async (req, res) => {
  const result = await pool.query(`
    SELECT b.name AS branch, COALESCE(SUM(pr.net_salary), 0) AS total_payroll
    FROM branches b
    LEFT JOIN payroll pr ON pr.branch_id = b.id
    GROUP BY b.id, b.name
    ORDER BY b.name
  `);
  const data = result.rows.map(r => ({
    metric: 'Monthly Payroll',
    current: `₹${Number(r.total_payroll || 0).toLocaleString('en-IN')}`,
    branch: r.branch,
    period: 'October 2026',
  }));
  res.json({ data });
}));

module.exports = router;
