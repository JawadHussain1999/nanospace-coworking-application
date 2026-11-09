require('dotenv').config();
const pool = require('./pool');

async function seedPendingData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch branches
    const branchRes = await client.query('SELECT id, name, code FROM branches');
    const branches = {};
    for (const b of branchRes.rows) branches[b.name] = b;
    const kphb = branches['KPHB'] || branchRes.rows[0];
    const nanakramguda = branches['Nanakramguda'] || branchRes.rows[1] || kphb;
    const jubileeHills = branches['Jubilee Hills'] || branchRes.rows[2] || kphb;
    const kokapet = branches['Kokapet'] || branchRes.rows[3] || kphb;

    // 2. Fetch or create customers
    const ensureCustomer = async (fullName, email, phone, company, branchId) => {
      let r = await client.query('SELECT id, full_name FROM customers WHERE email=$1', [email]);
      if (!r.rowCount) {
        r = await client.query(
          `INSERT INTO customers(full_name, email, phone, company_name, branch_id, plan, status)
           VALUES($1, $2, $3, $4, $5, 'Dedicated Member', 'ACTIVE') RETURNING id, full_name`,
          [fullName, email, phone, company, branchId]
        );
      }
      return r.rows[0];
    };

    const rahul = await ensureCustomer('Rahul Sharma', 'rahul.sharma@example.com', '+91 98765 43210', 'Rahul Sharma Ventures', nanakramguda.id);
    const mira = await ensureCustomer('Mira Tech Pvt Ltd', 'contact@miratech.com', '+91 98480 12345', 'Mira Tech Pvt Ltd', kphb.id);
    const aarav = await ensureCustomer('Aarav Consulting', 'info@aaravconsulting.in', '+91 90000 11122', 'Aarav Consulting', jubileeHills.id);
    const nexa = await ensureCustomer('Nexa Labs', 'team@nexalabs.io', '+91 91234 56789', 'Nexa Labs', kokapet.id);

    // 3. Fetch employees and users
    const usersRes = await client.query('SELECT id, full_name, email, role, branch_id FROM users');
    const usersByEmail = {};
    for (const u of usersRes.rows) usersByEmail[u.email] = u;

    const employee = usersByEmail['employee@nanospace.in'] || usersRes.rows.find(u => u.role === 'EMPLOYEE') || usersRes.rows[0];
    const admin = usersByEmail['admin@nanospace.in'] || usersRes.rows.find(u => u.role === 'SUPER_ADMIN') || usersRes.rows[0];

    // Ensure Ayesha Khan, Sana Reddy, Imran Ali exist as staff users
    const ensureStaff = async (name, email, role, branchId) => {
      let u = usersByEmail[email];
      if (!u) {
        const res = await client.query(
          `INSERT INTO users(full_name, email, password_hash, role, branch_id, is_active)
           VALUES($1, $2, '$2a$12$e0X95g3j3b5Bq/1B4w/9G.y9Uu9D.eE5T3W1r1I1R1A1H1A1S1H1a', $3, $4, TRUE)
           ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name
           RETURNING id, full_name, email, role, branch_id`,
          [name, email, role, branchId]
        );
        u = res.rows[0];
        usersByEmail[email] = u;
      }
      return u;
    };

    const ayesha = await ensureStaff('Ayesha Khan', 'ayesha@nanospace.in', 'EMPLOYEE', nanakramguda.id);
    const sana = await ensureStaff('Sana Reddy', 'sana@nanospace.in', 'BRANCH_ADMIN', kphb.id);
    const imran = await ensureStaff('Imran Ali', 'imran@nanospace.in', 'RECEPTION_ADMIN', nanakramguda.id);

    // 4. Seed Attendance
    console.log('Seeding attendance records...');
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dayBefore = new Date(Date.now() - 172800000).toISOString().slice(0, 10);

    const attendanceData = [
      { user: ayesha, date: today, in: `${today}T09:12:00Z`, out: null, notes: 'On shift' },
      { user: ayesha, date: yesterday, in: `${yesterday}T09:05:00Z`, out: `${yesterday}T18:15:00Z`, notes: 'Full shift' },
      { user: ayesha, date: dayBefore, in: `${dayBefore}T09:15:00Z`, out: `${dayBefore}T18:00:00Z`, notes: 'Full shift' },
      { user: imran, date: today, in: `${today}T08:58:00Z`, out: null, notes: 'Morning reception' },
      { user: imran, date: yesterday, in: `${yesterday}T08:55:00Z`, out: `${yesterday}T17:45:00Z`, notes: 'Completed shift' },
      { user: sana, date: today, in: `${today}T09:30:00Z`, out: null, notes: 'Branch management' },
      { user: employee, date: today, in: `${today}T09:00:00Z`, out: null, notes: 'Standard shift' },
      { user: employee, date: yesterday, in: `${yesterday}T09:00:00Z`, out: `${yesterday}T18:00:00Z`, notes: 'Completed shift' },
    ];

    for (const a of attendanceData) {
      await client.query(
        `INSERT INTO attendance(user_id, branch_id, work_date, check_in, check_out, notes)
         VALUES($1, $2, $3, $4, $5, $6)
         ON CONFLICT(user_id, work_date) DO UPDATE
         SET check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out, notes=EXCLUDED.notes`,
        [a.user.id, a.user.branch_id, a.date, a.in, a.out, a.notes]
      );
    }

    // 5. Seed Leaves
    console.log('Seeding leave records...');
    const leaveData = [
      { user: ayesha, type: 'Casual Leave', start: today, end: today, days: 1, reason: 'Personal errand', status: 'PENDING' },
      { user: imran, type: 'Sick Leave', start: yesterday, end: yesterday, days: 1, reason: 'Fever and cold', status: 'ACCEPTED' },
      { user: employee, type: 'Paid Leave', start: `${today}`, end: `${today}`, days: 1, reason: 'Family function', status: 'PENDING' },
    ];

    for (const l of leaveData) {
      await client.query(
        `INSERT INTO leaves(user_id, branch_id, leave_type, start_date, end_date, days, reason, status, approved_by)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [l.user.id, l.user.branch_id, l.type, l.start, l.end, l.days, l.reason, l.status, admin.id]
      );
    }

    // 6. Seed Payroll
    console.log('Seeding payroll records...');
    const payrollData = [
      { user: ayesha, period: 'Oct 2026', basic: 32000, allowances: 8500, deductions: 2000, net: 38500, payDate: `${today}`, status: 'PENDING' },
      { user: ayesha, period: 'Sep 2026', basic: 32000, allowances: 8500, deductions: 2000, net: 38500, payDate: '2026-09-30', status: 'COMPLETED' },
      { user: imran, period: 'Oct 2026', basic: 28000, allowances: 6000, deductions: 2000, net: 32000, payDate: `${today}`, status: 'PENDING' },
      { user: imran, period: 'Sep 2026', basic: 28000, allowances: 6000, deductions: 2000, net: 32000, payDate: '2026-09-30', status: 'COMPLETED' },
      { user: sana, period: 'Oct 2026', basic: 45000, allowances: 12000, deductions: 3500, net: 53500, payDate: `${today}`, status: 'PENDING' },
      { user: employee, period: 'Oct 2026', basic: 30000, allowances: 5000, deductions: 1500, net: 33500, payDate: `${today}`, status: 'PENDING' },
    ];

    for (const p of payrollData) {
      await client.query(
        `INSERT INTO payroll(user_id, branch_id, pay_period, basic_salary, allowances, deductions, net_salary, pay_date, status)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(user_id, pay_period) DO UPDATE
         SET basic_salary=EXCLUDED.basic_salary, allowances=EXCLUDED.allowances,
             deductions=EXCLUDED.deductions, net_salary=EXCLUDED.net_salary,
             pay_date=EXCLUDED.pay_date, status=EXCLUDED.status`,
        [p.user.id, p.user.branch_id, p.period, p.basic, p.allowances, p.deductions, p.net, p.payDate, p.status]
      );
    }

    // 7. Seed Agreements
    console.log('Seeding agreements...');
    const agreementsData = [
      { num: 'AG-401', cust: rahul, branch: nanakramguda, start: '2026-10-01', end: '2027-09-30', val: 102000, deposit: 20000, status: 'ACTIVE', terms: '12-month Dedicated Desk agreement' },
      { num: 'AG-400', cust: mira, branch: kphb, start: '2026-09-15', end: '2027-09-14', val: 270000, deposit: 50000, status: 'SENT', terms: '10-Seater Private Office contract' },
      { num: 'AG-399', cust: aarav, branch: jubileeHills, start: '2026-09-01', end: '2027-08-31', val: 132000, deposit: 25000, status: 'ACCEPTED', terms: 'Dedicated Cabins terms and conditions' },
      { num: 'AG-398', cust: nexa, branch: kokapet, start: '2026-08-01', end: '2027-07-31', val: 85000, deposit: 15000, status: 'ACTIVE', terms: 'Hot Desk annual flexi pass' }
    ];

    for (const ag of agreementsData) {
      await client.query(
        `INSERT INTO agreements(agreement_number, customer_id, branch_id, start_date, end_date, contract_value, deposit_amount, status, terms, created_by)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(agreement_number) DO UPDATE
         SET contract_value=EXCLUDED.contract_value, status=EXCLUDED.status, terms=EXCLUDED.terms`,
        [ag.num, ag.cust.id, ag.branch.id, ag.start, ag.end, ag.val, ag.deposit, ag.status, ag.terms, admin.id]
      );
    }

    // 8. Seed Invoices
    console.log('Seeding invoices...');
    const invoiceData = [
      { num: 'INV-802', cust: rahul, branch: nanakramguda, due: today, subtotal: 7203.39, tax: 1296.61, total: 8500, paid: 0, status: 'PENDING', notes: 'Monthly dedicated workstation rental' },
      { num: 'INV-801', cust: mira, branch: kphb, due: '2026-10-20', subtotal: 38135.59, tax: 6864.41, total: 45000, paid: 0, status: 'OVERDUE', notes: 'Quarterly private office cabin rent' },
      { num: 'INV-800', cust: aarav, branch: jubileeHills, due: '2026-10-18', subtotal: 18644.07, tax: 3355.93, total: 22000, paid: 22000, status: 'COMPLETED', notes: 'Conference room block booking' },
      { num: 'INV-799', cust: nexa, branch: kokapet, due: '2026-10-30', subtotal: 13559.32, tax: 2440.68, total: 16000, paid: 0, status: 'PENDING', notes: 'Podcast studio & flexi desks' }
    ];

    const seededInvoices = {};
    for (const inv of invoiceData) {
      const res = await client.query(
        `INSERT INTO invoices(invoice_number, customer_id, branch_id, issue_date, due_date, subtotal, tax_amount, total_amount, paid_amount, status, notes)
         VALUES($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(invoice_number) DO UPDATE
         SET due_date=EXCLUDED.due_date, total_amount=EXCLUDED.total_amount, status=EXCLUDED.status
         RETURNING id, invoice_number`,
        [inv.num, inv.cust.id, inv.branch.id, inv.due, inv.subtotal, inv.tax, inv.total, inv.paid, inv.status, inv.notes]
      );
      seededInvoices[inv.num] = res.rows[0];
    }

    // 9. Seed Payments (Payment Reminders)
    console.log('Seeding payments...');
    const paymentData = [
      { num: 'PAY-801', inv: seededInvoices['INV-801'], cust: mira, branch: kphb, amount: 45000, due: '2026-10-20', status: 'OVERDUE', notes: 'Payment reminder sent via WhatsApp' },
      { num: 'PAY-802', inv: seededInvoices['INV-802'], cust: rahul, branch: nanakramguda, amount: 8500, due: today, status: 'PENDING', notes: 'Awaiting online UPI payment' },
      { num: 'PAY-800', inv: seededInvoices['INV-800'], cust: aarav, branch: jubileeHills, amount: 22000, due: '2026-10-18', status: 'COMPLETED', notes: 'Paid via Bank Transfer' },
      { num: 'PAY-799', inv: seededInvoices['INV-799'], cust: nexa, branch: kokapet, amount: 16000, due: '2026-10-30', status: 'PENDING', notes: 'Payment due at end of billing cycle' }
    ];

    for (const pay of paymentData) {
      await client.query(
        `INSERT INTO payments(payment_number, invoice_id, customer_id, branch_id, amount, payment_method, due_date, status, notes)
         VALUES($1, $2, $3, $4, $5, 'UPI', $6, $7, $8)
         ON CONFLICT(payment_number) DO UPDATE
         SET amount=EXCLUDED.amount, due_date=EXCLUDED.due_date, status=EXCLUDED.status`,
        [pay.num, pay.inv?.id || null, pay.cust.id, pay.branch.id, pay.amount, pay.due, pay.status, pay.notes]
      );
    }

    // 10. Seed Expenses
    console.log('Seeding expenses...');
    const expenseData = [
      { num: 'EX-301', branch: nanakramguda, cat: 'Internet & IT', date: '2026-10-22', amount: 12500, vendor: 'Airtel Fibrenet', status: 'PENDING', notes: '1 Gbps Leased line renewal' },
      { num: 'EX-300', branch: kphb, cat: 'Housekeeping', date: '2026-10-21', amount: 8000, vendor: 'CleanPro Services', status: 'COMPLETED', notes: 'Monthly branch facility sanitation' },
      { num: 'EX-299', branch: kokapet, cat: 'Utilities', date: '2026-10-20', amount: 16200, vendor: 'TSSPDCL Electricity', status: 'COMPLETED', notes: 'Power bill payment' },
      { num: 'EX-298', branch: jubileeHills, cat: 'Pantry & Supplies', date: '2026-10-19', amount: 6400, vendor: 'CoffeeDay Supplies', status: 'COMPLETED', notes: 'Espresso beans and snacks' }
    ];

    for (const ex of expenseData) {
      await client.query(
        `INSERT INTO expenses(expense_number, branch_id, category, expense_date, amount, vendor, status, notes, created_by)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(expense_number) DO UPDATE
         SET amount=EXCLUDED.amount, status=EXCLUDED.status, notes=EXCLUDED.notes`,
        [ex.num, ex.branch.id, ex.cat, ex.date, ex.amount, ex.vendor, ex.status, ex.notes, admin.id]
      );
    }

    // 11. Seed System Settings
    console.log('Seeding system settings...');
    const defaultOrg = {
      organizationName: 'NanoSpace Coworking',
      currency: 'INR',
      taxRatePercent: 18,
      operatingHours: { open: '08:00', close: '22:00' },
      securityDepositMonths: 2,
      noticePeriodDays: 30,
      autoInvoicing: true,
      smsNotifications: true,
      emailNotifications: true,
      amenities: ['High-speed WiFi', 'Meeting Rooms', 'Cafeteria', 'Power Backup', 'Printing', 'Ergonomic Seating']
    };

    await client.query(
      `INSERT INTO settings(branch_id, settings_key, data)
       VALUES(NULL, 'organization', $1::jsonb)
       ON CONFLICT(branch_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
      [JSON.stringify(defaultOrg)]
    );

    for (const b of [nanakramguda, kphb, jubileeHills, kokapet]) {
      const branchSettings = {
        branchName: b.name,
        branchCode: b.code,
        operatingHours: '08:00 - 22:00',
        accessControl: 'Biometric + RFID Keycard',
        amenities: ['High-speed WiFi', 'Meeting Rooms', 'Cafeteria', 'Power Backup', 'Printing'],
        visitorRegistrationRequired: true,
        contactPhone: '+91 98765 00000',
        contactEmail: `${b.code.toLowerCase()}@nanospace.in`
      };
      await client.query(
        `INSERT INTO settings(branch_id, settings_key, data)
         VALUES($1, 'branch', $2::jsonb)
         ON CONFLICT(branch_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
        [b.id, JSON.stringify(branchSettings)]
      );
    }

    // 12. Seed Sample KYC Document
    console.log('Seeding KYC document...');
    await client.query(
      `INSERT INTO documents(customer_id, branch_id, document_type, file_name, mime_type, file_size, status, uploaded_by)
       VALUES($1, $2, 'Company PAN', 'NanoSpace_PAN_Sample.pdf', 'application/pdf', 145200, 'APPROVED', $3)
       ON CONFLICT DO NOTHING`,
      [rahul.id, nanakramguda.id, admin.id]
    );

    // 13. Seed Audit Logs
    console.log('Seeding audit logs...');
    const auditData = [
      { action: 'SIGN_IN', entity: 'Auth', entityId: admin.id, user: admin, branch: null, details: { method: 'JWT_LOGIN', ip: '127.0.0.1' } },
      { action: 'CREATE_BOOKING', entity: 'Booking', entityId: 'BKG-101', user: admin, branch: nanakramguda, details: { customer: 'Rahul Sharma', workspace: 'Dedicated Desk 14' } },
      { action: 'UPDATE_WORKSPACE', entity: 'Workspace', entityId: 'WS-01', user: sana, branch: kphb, details: { status: 'AVAILABLE', capacity: 1 } },
      { action: 'GENERATE_INVOICE', entity: 'Invoice', entityId: 'INV-802', user: admin, branch: nanakramguda, details: { amount: 8500 } },
      { action: 'PROCESS_PAYROLL', entity: 'Payroll', entityId: 'PAY-SEP-26', user: admin, branch: nanakramguda, details: { period: 'Sep 2026', totalProcessed: 124000 } }
    ];

    for (const a of auditData) {
      await client.query(
        `INSERT INTO audit_logs(user_id, branch_id, action, entity, entity_id, details, ip_address)
         VALUES($1, $2, $3, $4, $5, $6::jsonb, '127.0.0.1')`,
        [a.user.id, a.branch?.id || null, a.action, a.entity, a.entityId, JSON.stringify(a.details)]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Pending data successfully seeded into database!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed seeding pending data:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedPendingData();
