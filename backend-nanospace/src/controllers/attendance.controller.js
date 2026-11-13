const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const { allowRoles } = require('../middleware/auth');

function getLocalDateString() {
  return new Date().toLocaleDateString('en-CA');
}

router.get('/summary', ah(async (req, res) => {
  const u = req.user;
  const today = getLocalDateString();
  let branchFilter = '';
  const params = [];
  if (u.role !== 'SUPER_ADMIN') {
    params.push(u.branch_id);
    branchFilter = ` AND branch_id=$${params.length}`;
  }

  const [totalRes, onShiftRes] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM attendance WHERE 1=1${branchFilter}`, params),
    pool.query(`SELECT COUNT(*)::int AS count FROM attendance WHERE work_date::text='${today}' AND check_out IS NULL${branchFilter}`, params),
  ]);

  res.json({
    data: {
      totalRecords: totalRes.rows[0].count,
      onShift: onShiftRes.rows[0].count,
    }
  });
}));

router.get('/', ah(async (req, res) => {
  const u = req.user;
  const p = [];
  let sql = `SELECT a.*, a.work_date::text AS work_date, u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
             FROM attendance a
             JOIN users u ON u.id = a.user_id
             LEFT JOIN branches b ON b.id = a.branch_id
             WHERE 1=1`;

  if (u.role === 'EMPLOYEE') {
    p.push(u.id);
    sql += ` AND a.user_id=$${p.length}`;
  } else if (u.role !== 'SUPER_ADMIN') {
    p.push(u.branch_id);
    sql += ` AND a.branch_id=$${p.length}`;
  }

  if (req.query.date) {
    p.push(req.query.date);
    sql += ` AND a.work_date::text=$${p.length}`;
  }

  sql += ' ORDER BY a.work_date DESC, a.check_in DESC';
  const result = await pool.query(sql, p);

  // Normalize shape so frontend gets both camelCase & snake_case
  const rows = result.rows.map(r => {
    const rawDate = r.work_date;
    const dateStr = typeof rawDate === 'string'
      ? rawDate.slice(0, 10)
      : (rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : '');
    return {
      ...r,
      name: r.employee_name,
      email: r.employee_email,
      branch: r.branch_name,
      date: dateStr,
      clockIn: r.check_in,
      clockOut: r.check_out,
    };
  });

  res.json({ data: rows });
}));

router.post('/import', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const { branchId: requestedBranchId, userId, workDate, checkIn, checkOut, notes } = req.body;
  const branchId = req.user.role === 'SUPER_ADMIN' ? requestedBranchId : req.user.branch_id;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidDate = (value) => value && !Number.isNaN(new Date(value).getTime());

  if (!uuidPattern.test(String(branchId || '')) || !uuidPattern.test(String(userId || ''))) {
    return res.status(400).json({ error: 'A valid branch and user are required.' });
  }
  const parsedWorkDate = new Date(`${workDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(workDate || '')) ||
    Number.isNaN(parsedWorkDate.getTime()) ||
    parsedWorkDate.toISOString().slice(0, 10) !== workDate ||
    !isValidDate(checkIn)
  ) {
    return res.status(400).json({ error: 'A valid workDate and checkIn timestamp are required.' });
  }
  if (checkOut && (!isValidDate(checkOut) || new Date(checkOut) < new Date(checkIn))) {
    return res.status(400).json({ error: 'checkOut must be a valid timestamp on or after checkIn.' });
  }

  const branch = await pool.query('SELECT id FROM branches WHERE id=$1', [branchId]);
  if (!branch.rowCount) return res.status(400).json({ error: 'The selected branch does not exist.' });

  const employee = await pool.query(
    `SELECT id, branch_id, role
     FROM users
     WHERE id=$1 AND is_active=TRUE`,
    [userId]
  );
  if (!employee.rowCount || employee.rows[0].role === 'CUSTOMER' || employee.rows[0].branch_id !== branchId) {
    return res.status(400).json({ error: 'The selected active staff member does not belong to this branch.' });
  }

  const result = await pool.query(
    `INSERT INTO attendance(user_id, branch_id, work_date, check_in, check_out, notes)
     VALUES($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, work_date) DO NOTHING
     RETURNING *, work_date::text AS work_date`,
    [userId, branchId, workDate, checkIn, checkOut || null, notes || null]
  );
  if (!result.rowCount) {
    return res.status(409).json({ error: 'Attendance already exists for this staff member and date.' });
  }

  res.status(201).json({ data: result.rows[0] });
}));

router.get('/:id', ah(async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, a.work_date::text AS work_date, u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN branches b ON b.id = a.branch_id
     WHERE a.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Attendance record not found.' });
  const r = result.rows[0];
  const dateStr = typeof r.work_date === 'string'
    ? r.work_date.slice(0, 10)
    : (r.work_date instanceof Date ? r.work_date.toISOString().slice(0, 10) : '');
  res.json({
    data: {
      ...r,
      name: r.employee_name,
      email: r.employee_email,
      branch: r.branch_name,
      date: dateStr,
      clockIn: r.check_in,
      clockOut: r.check_out,
    }
  });
}));

router.post('/check-in', ah(async (req, res) => {
  const u = req.user;
  const today = req.body.date || getLocalDateString();
  const now = req.body.clockIn || new Date().toISOString();
  let branchId = u.branch_id;
  if (!branchId && req.body.branch) {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.body.branch]);
    if (bRes.rowCount) branchId = bRes.rows[0].id;
  }
  if (!branchId) {
    const bRes = await pool.query('SELECT id FROM branches LIMIT 1');
    branchId = bRes.rows[0]?.id;
  }

  // Check if user already has an active open shift (clocked in but not clocked out)
  const openEntry = await pool.query(
    `SELECT a.*, a.work_date::text AS work_date, u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN branches b ON b.id = a.branch_id
     WHERE a.user_id = $1 AND a.check_out IS NULL
     ORDER BY a.check_in DESC LIMIT 1`,
    [u.id]
  );

  if (openEntry.rowCount) {
    const row = openEntry.rows[0];
    return res.status(200).json({
      message: 'Already clocked in.',
      data: {
        ...row,
        name: row.employee_name,
        email: row.employee_email,
        branch: row.branch_name,
        date: String(row.work_date).slice(0, 10),
        clockIn: row.check_in,
        clockOut: row.check_out,
      }
    });
  }

  const result = await pool.query(
    `INSERT INTO attendance(user_id, branch_id, work_date, check_in, notes)
     VALUES($1, $2, $3, $4, $5)
     ON CONFLICT(user_id, work_date) DO UPDATE
     SET check_in=COALESCE(attendance.check_in, EXCLUDED.check_in), updated_at=NOW()
     RETURNING *, work_date::text AS work_date`,
    [u.id, branchId, today, now, req.body.notes || 'User check-in']
  );

  const row = result.rows[0];
  const empRes = await pool.query(
    `SELECT u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
     FROM users u
     LEFT JOIN branches b ON b.id = $1
     WHERE u.id = $2`,
    [row.branch_id, u.id]
  );
  const emp = empRes.rows[0] || {};

  res.status(201).json({
    data: {
      ...row,
      name: emp.employee_name || u.full_name,
      email: emp.employee_email || u.email,
      branch: emp.branch_name || u.branch,
      date: String(row.work_date).slice(0, 10),
      clockIn: row.check_in,
      clockOut: row.check_out,
    }
  });
}));

router.post('/check-out', ah(async (req, res) => {
  const u = req.user;
  const now = req.body.clockOut || new Date().toISOString();
  const recordId = req.body.id || req.body.attendanceId;

  let result;
  if (recordId) {
    result = await pool.query(
      `UPDATE attendance SET check_out=$1, updated_at=NOW()
       WHERE id=$2 AND check_out IS NULL
       RETURNING *, work_date::text AS work_date`,
      [now, recordId]
    );
  } else {
    result = await pool.query(
      `UPDATE attendance SET check_out=$1, updated_at=NOW()
       WHERE id = (
         SELECT id FROM attendance
         WHERE user_id=$2 AND check_out IS NULL
         ORDER BY check_in DESC
         LIMIT 1
       )
       RETURNING *, work_date::text AS work_date`,
      [now, u.id]
    );
  }

  if (!result || !result.rowCount) {
    // Check if user already checked out today
    const today = req.body.date || getLocalDateString();
    const existing = await pool.query(
      `SELECT a.*, a.work_date::text AS work_date, u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN branches b ON b.id = a.branch_id
       WHERE a.user_id=$1 AND (a.work_date::text=$2 OR a.id=$3)
       ORDER BY a.check_in DESC LIMIT 1`,
      [u.id, today, recordId || '00000000-0000-0000-0000-000000000000']
    );
    if (existing.rowCount && existing.rows[0].check_out) {
      const row = existing.rows[0];
      return res.json({
        data: {
          ...row,
          name: row.employee_name,
          email: row.employee_email,
          branch: row.branch_name,
          date: String(row.work_date).slice(0, 10),
          clockIn: row.check_in,
          clockOut: row.check_out,
        }
      });
    }
    return res.status(400).json({ error: 'No active check-in entry found to clock out.' });
  }

  const row = result.rows[0];
  const empRes = await pool.query(
    `SELECT u.full_name AS employee_name, u.email AS employee_email, b.name AS branch_name
     FROM users u
     LEFT JOIN branches b ON b.id = $1
     WHERE u.id = $2`,
    [row.branch_id, u.id]
  );
  const emp = empRes.rows[0] || {};

  res.json({
    data: {
      ...row,
      name: emp.employee_name || u.full_name,
      email: emp.employee_email || u.email,
      branch: emp.branch_name || u.branch,
      date: String(row.work_date).slice(0, 10),
      clockIn: row.check_in,
      clockOut: row.check_out,
    }
  });
}));

router.patch('/:id', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTION_ADMIN'), ah(async (req, res) => {
  const { clockIn, checkIn, clockOut, checkOut, notes } = req.body;
  const inTime = clockIn || checkIn;
  const outTime = clockOut || checkOut;

  const result = await pool.query(
    `UPDATE attendance
     SET check_in=COALESCE($2, check_in),
         check_out=COALESCE($3, check_out),
         notes=COALESCE($4, notes),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *, work_date::text AS work_date`,
    [req.params.id, inTime || null, outTime || null, notes || null]
  );

  if (!result.rowCount) return res.status(404).json({ error: 'Attendance record not found.' });
  const row = result.rows[0];
  res.json({
    data: {
      ...row,
      date: String(row.work_date).slice(0, 10),
      clockIn: row.check_in,
      clockOut: row.check_out,
    }
  });
}));

module.exports = router;
