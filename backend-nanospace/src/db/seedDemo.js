require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Branches
    const branchSpecs = [
      ['KPHB', 'KPHB', 'KPHB, Hyderabad'],
      ['Nanakramguda', 'NANAKRAMGUDA', 'Nanakramguda, Hyderabad'],
      ['Jubilee Hills', 'JUBILEE_HILLS', 'Jubilee Hills, Hyderabad'],
      ['Kokapet', 'KOKAPET', 'Kokapet, Hyderabad']
    ];
    const branches = {};
    for (const [name, code, address] of branchSpecs) {
      const r = await client.query(
        `INSERT INTO branches(name,code,address) VALUES($1,$2,$3)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, address=EXCLUDED.address
         RETURNING id,name,code`, [name, code, address]);
      branches[code] = r.rows[0];
    }

    // NanoSpace service inventory / price list. Tax rates are 0 because the supplied
    // source list does not specify GST rates; configure the applicable rates separately.
    const itemSpecs = [
      ['CABIN (3 SEATER)', 'Cabin with 3 seater space', null, 28500, 'pcs', 0, 'SERVICE'],
      ['Private office : 10 Seater office (includes 3 seater Manager cabin)', 'Private Office: 1 Manager cabin (3 seats) and 7 employee chairs (7 seats).', null, 95000, 'pcs', 0, 'SERVICE'],
      ['Private Office : 23 Seater (includes 4 seater Manager cabin)', '19 employee chairs; manager cabin with 4 seats.', null, 218500, 'pcs', 0, 'SERVICE'],
      ['Conference Room for one Session : Non Member', 'Conference room for one session. 4 hours = 1 session.', null, 4999, 'session', 0, 'SERVICE'],
      ['Conference Room : For Nanospace Member', 'Conference room for NanoSpace members; prior booking required.', null, 599, 'session', 0, 'SERVICE'],
      ['Manager Cabin : 4 seater', 'Manager cabin with 4 seats.', null, 38000, 'pcs', 0, 'SERVICE'],
      ['Podcast Room for Rent : Non Member', 'Podcast room rental for non-members.', null, 999, 'session', 0, 'SERVICE'],
      ['Podcast room : For Member', 'Podcast room rental for members.', null, 599, 'session', 0, 'SERVICE'],
      ['Coworking Hot Seat : Per month', 'First-come, first-served coworking hot seats, billed monthly.', null, 8500, 'month', 0, 'SERVICE'],
      ['Coworking Hot seat : Per Day', 'Coworking hot seat for one day.', null, 499, 'day', 0, 'SERVICE'],
      ['Dedicated Seat (Inside the cabin)', 'Dedicated seat inside the private office. Monthly billing period inferred; confirm before recurring billing.', '997211', 9500, 'month', 0, 'SERVICE']
    ];
    const items = {};
    // Deactivate the old generic sample items so the real NanoSpace catalogue is shown.
    await client.query(`UPDATE inventory_items SET is_active=FALSE WHERE name = ANY($1::text[])`, [[
      'Hot Desk - Daily', 'Dedicated Desk - Monthly', 'Private Cabin - Monthly',
      'Meeting Room - Hourly', 'Day Pass', 'Locker - Monthly'
    ]]);
    for (const [name, description, hsn, rate, unit, tax, type] of itemSpecs) {
      const existing = await client.query(
        `UPDATE inventory_items SET description=$2,hsn_sac=$3,rate=$4,unit=$5,tax_percent=$6,product_type=$7,sellable=TRUE,track_inventory=FALSE,is_active=TRUE,updated_at=NOW()
         WHERE name=$1 RETURNING id`, [name, description, hsn, rate, unit, tax, type]);
      let itemId = existing.rows[0]?.id;
      if (!itemId) {
        const created = await client.query(
          `INSERT INTO inventory_items(name,description,hsn_sac,rate,unit,tax_percent,product_type,sellable,track_inventory,is_active)
           VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,FALSE,TRUE) RETURNING id`,
          [name, description, hsn, rate, unit, tax, type]);
        itemId = created.rows[0].id;
      }
      items[name] = itemId;
    }

    // Users: set DEMO_USER_PASSWORD in .env before running to customize.
    const demoPassword = process.env.DEMO_USER_PASSWORD || 'Demo@12345';
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    const userSpecs = [
      ['KPHB Branch Admin', 'kphb.admin@nanospace.local', 'BRANCH_ADMIN', 'KPHB'],
      ['KPHB Reception', 'kphb.reception@nanospace.local', 'RECEPTION_ADMIN', 'KPHB'],
      ['KPHB Employee', 'kphb.employee@nanospace.local', 'EMPLOYEE', 'KPHB'],
      ['Nanakramguda Branch Admin', 'nanakramguda.admin@nanospace.local', 'BRANCH_ADMIN', 'NANAKRAMGUDA'],
      ['Nanakramguda Reception', 'nanakramguda.reception@nanospace.local', 'RECEPTION_ADMIN', 'NANAKRAMGUDA'],
      ['Nanakramguda Employee', 'nanakramguda.employee@nanospace.local', 'EMPLOYEE', 'NANAKRAMGUDA'],
      ['Jubilee Hills Branch Admin', 'jubileehills.admin@nanospace.local', 'BRANCH_ADMIN', 'JUBILEE_HILLS'],
      ['Jubilee Hills Reception', 'jubileehills.reception@nanospace.local', 'RECEPTION_ADMIN', 'JUBILEE_HILLS'],
      ['Jubilee Hills Employee', 'jubileehills.employee@nanospace.local', 'EMPLOYEE', 'JUBILEE_HILLS'],
      ['Kokapet Branch Admin', 'kokapet.admin@nanospace.local', 'BRANCH_ADMIN', 'KOKAPET'],
      ['Kokapet Reception', 'kokapet.reception@nanospace.local', 'RECEPTION_ADMIN', 'KOKAPET'],
      ['Kokapet Employee', 'kokapet.employee@nanospace.local', 'EMPLOYEE', 'KOKAPET']
    ];
    const users = {};
    for (const [name, email, role, branchCode] of userSpecs) {
      const r = await client.query(
        `INSERT INTO users(full_name,email,password_hash,role,branch_id)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, branch_id=EXCLUDED.branch_id, is_active=TRUE
         RETURNING id,email,role,branch_id`,
        [name, email, passwordHash, role, branches[branchCode].id]);
      users[email] = r.rows[0];
    }

    // Customers and customer login accounts
    const customerSpecs = [
      ['Aarav Sharma','aarav.sharma@example.com','9000000101','Aarav Technologies','KPHB','aarav.customer@nanospace.local'],
      ['Fatima Khan','fatima.khan@example.com','9000000102','FK Design Studio','NANAKRAMGUDA','fatima.customer@nanospace.local'],
      ['Rahul Reddy','rahul.reddy@example.com','9000000103','RR Consulting','JUBILEE_HILLS','rahul.customer@nanospace.local'],
      ['Priya Mehta','priya.mehta@example.com','9000000104','Mehta Analytics','KOKAPET','priya.customer@nanospace.local'],
      ['Sara Ali','sara.ali@example.com','9000000105','Sara Creative Co','NANAKRAMGUDA','sara.customer@nanospace.local'],
      ['Vikram Rao','vikram.rao@example.com','9000000106','VR Solutions','KPHB','vikram.customer@nanospace.local']
    ];
    const customers = {};
    for (const [name,email,phone,company,branchCode,loginEmail] of customerSpecs) {
      const userResult = await client.query(
        `INSERT INTO users(full_name,email,password_hash,role,branch_id)
         VALUES($1,$2,$3,'CUSTOMER',$4)
         ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name, password_hash=EXCLUDED.password_hash, role='CUSTOMER', branch_id=EXCLUDED.branch_id, is_active=TRUE
         RETURNING id,email`, [name,loginEmail,passwordHash,branches[branchCode].id]);
      const user = userResult.rows[0];
      const customerResult = await client.query(
        `INSERT INTO customers(user_id,branch_id,full_name,email,phone,company_name)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(user_id) DO UPDATE SET branch_id=EXCLUDED.branch_id, full_name=EXCLUDED.full_name, email=EXCLUDED.email, phone=EXCLUDED.phone, company_name=EXCLUDED.company_name
         RETURNING id,full_name,branch_id,user_id`,
        [user.id,branches[branchCode].id,name,email,phone,company]);
      customers[email] = customerResult.rows[0];
    }

    // Workspaces / clickable demo seats for each branch
    const workspaces = {};
    for (const code of Object.keys(branches)) {
      const isNanakramguda = code === 'NANAKRAMGUDA';
      const layout = isNanakramguda ? [
        // 4 x 10-seater private cabins
        ['GROUND', 'NNG1-private cabin 10 seater', 'NNG1-private cabin 10 seater', 'PRIVATE_CABIN', 10, items['Private office : 10 Seater office (includes 3 seater Manager cabin)'], 50, 60],
        ['GROUND', 'NNG2-private cabin 10 seater', 'NNG2-private cabin 10 seater', 'PRIVATE_CABIN', 10, items['Private office : 10 Seater office (includes 3 seater Manager cabin)'], 170, 60],
        ['GROUND', 'NNG3-private cabin 10 seater', 'NNG3-private cabin 10 seater', 'PRIVATE_CABIN', 10, items['Private office : 10 Seater office (includes 3 seater Manager cabin)'], 290, 60],
        ['GROUND', 'NNG4-private cabin 10 seater', 'NNG4-private cabin 10 seater', 'PRIVATE_CABIN', 10, items['Private office : 10 Seater office (includes 3 seater Manager cabin)'], 410, 60],
        // 3 x 20-seater private cabins
        ['GROUND', 'NNG1-private cabin 20 seater', 'NNG1-private cabin 20 seater', 'PRIVATE_CABIN', 20, items['Private Office : 23 Seater (includes 4 seater Manager cabin)'], 50, 160],
        ['GROUND', 'NNG2-private cabin 20 seater', 'NNG2-private cabin 20 seater', 'PRIVATE_CABIN', 20, items['Private Office : 23 Seater (includes 4 seater Manager cabin)'], 200, 160],
        ['GROUND', 'NNG3-private cabin 20 seater', 'NNG3-private cabin 20 seater', 'PRIVATE_CABIN', 20, items['Private Office : 23 Seater (includes 4 seater Manager cabin)'], 350, 160],
        // 4 x 6-seater hot desks
        ['GROUND', 'NNG1-hot desk 6 seater', 'NNG1-hot desk 6 seater', 'HOT_DESK', 6, items['Coworking Hot seat : Per Day'], 50, 260],
        ['GROUND', 'NNG2-hot desk 6 seater', 'NNG2-hot desk 6 seater', 'HOT_DESK', 6, items['Coworking Hot seat : Per Day'], 160, 260],
        ['GROUND', 'NNG3-hot desk 6 seater', 'NNG3-hot desk 6 seater', 'HOT_DESK', 6, items['Coworking Hot seat : Per Day'], 270, 260],
        ['GROUND', 'NNG4-hot desk 6 seater', 'NNG4-hot desk 6 seater', 'HOT_DESK', 6, items['Coworking Hot seat : Per Day'], 380, 260],
        // 1 x Conference room & 1 x Podcast room
        ['GROUND', 'NNG1-conference room 10 seater', 'NNG1-conference room 10 seater', 'MEETING_ROOM', 10, items['Conference Room for one Session : Non Member'], 500, 60],
        ['GROUND', 'NNG1-podcast room', 'NNG1-podcast room', 'PODCAST_ROOM', 4, items['Podcast Room for Rent : Non Member'], 500, 160]
      ] : [
        ['GROUND','A01','Hot Seat A01','HOT_DESK',1,items['Coworking Hot seat : Per Day'],60,80],
        ['GROUND','A02','Hot Seat A02','HOT_DESK',1,items['Coworking Hot seat : Per Day'],160,80],
        ['GROUND','A03','Hot Seat A03','HOT_DESK',1,items['Coworking Hot seat : Per Day'],260,80],
        ['GROUND','D01','Dedicated Seat D01','DEDICATED_DESK',1,items['Dedicated Seat (Inside the cabin)'],60,200],
        ['GROUND','D02','Dedicated Seat D02','DEDICATED_DESK',1,items['Dedicated Seat (Inside the cabin)'],180,200],
        ['GROUND','C01','3-Seater Cabin C01','PRIVATE_CABIN',3,items['CABIN (3 SEATER)'],340,200],
        ['FIRST','MR01','Conference Room MR01','MEETING_ROOM',8,items['Conference Room for one Session : Non Member'],80,100],
        ['FIRST','MR02','Conference Room MR02','MEETING_ROOM',6,items['Conference Room : For Nanospace Member'],260,100]
      ];
      for (const [floor,seatCode,name,type,capacity,itemId,x,y] of layout) {
        const initialStatus = isNanakramguda && ['NNG1-private cabin 10 seater', 'NNG1-private cabin 20 seater', 'NNG2-hot desk 6 seater'].includes(seatCode) ? 'OCCUPIED' : 'AVAILABLE';
        const r = await client.query(
          `INSERT INTO workspaces(branch_id,floor,code,name,workspace_type,capacity,inventory_item_id,layout_x,layout_y,layout_width,layout_height,status,layout_published)
           VALUES($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL,NULL,$8,TRUE)
           ON CONFLICT(branch_id,floor,code) DO UPDATE SET name=EXCLUDED.name,workspace_type=EXCLUDED.workspace_type,capacity=EXCLUDED.capacity,inventory_item_id=EXCLUDED.inventory_item_id,is_active=TRUE,layout_published=TRUE
           RETURNING id,branch_id,code,workspace_type,inventory_item_id,status`,
          [branches[code].id,floor,seatCode,name,type,capacity,itemId,initialStatus]);
        workspaces[`${code}:${seatCode}`] = r.rows[0];
      }
    }

    // Refresh the seed-owned bookings so reruns keep only one current demo set.
    await client.query("DELETE FROM bookings WHERE notes='NANOSPACE_DEMO_SEED_BOOKING'");
    const bookingSpecs = [
      ['KPHB','aarav.sharma@example.com','A01',1,2],
      ['NANAKRAMGUDA','fatima.khan@example.com','NNG1-private cabin 10 seater',2,3],
      ['JUBILEE_HILLS','rahul.reddy@example.com','MR01',3,4],
      ['KOKAPET','priya.mehta@example.com','A02',4,5]
    ];
    for (let i=0;i<bookingSpecs.length;i++) {
      const [branchCode,email,seatCode,dayOffset,hourOffset] = bookingSpecs[i];
      const ws = workspaces[`${branchCode}:${seatCode}`];
      const customer = customers[email];
      const item = await client.query('SELECT rate,tax_percent FROM inventory_items WHERE id=$1',[ws.inventory_item_id]);
      const start = new Date(Date.now() + dayOffset*86400000);
      start.setHours(9+hourOffset,0,0,0);
      const end = new Date(start.getTime() + (ws.workspace_type==='MEETING_ROOM'?2:8)*3600000);
      const rate = Number(item.rows[0].rate), tax = Number(item.rows[0].tax_percent);
      const subtotal = rate, taxAmount = Number((rate*tax/100).toFixed(2)), total = Number((rate+taxAmount).toFixed(2));
      const note = 'NANOSPACE_DEMO_SEED_BOOKING';
      const reception = userSpecs.find(([, , role, code]) => role === 'RECEPTION_ADMIN' && code === branchCode);
      await client.query(
        `INSERT INTO bookings(branch_id,workspace_id,customer_id,inventory_item_id,created_by,starts_at,ends_at,quantity,unit_rate,tax_percent,subtotal,tax_amount,total_amount,status,booking_source,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12,'CONFIRMED','IN_PERSON',$13)`,
        [branches[branchCode].id,ws.id,customer.id,ws.inventory_item_id,users[reception[1]]?.id || null,start.toISOString(),end.toISOString(),rate,tax,subtotal,taxAmount,total,note]);
    }

    // One sample quotation and complaint per run-safe unique identifiers.
    for (const [branchCode, customerEmail, qNumber] of [
      ['KPHB','aarav.sharma@example.com','DEMO-KPHB-0001'],
      ['NANAKRAMGUDA','fatima.khan@example.com','DEMO-NAN-0001'],
      ['JUBILEE_HILLS','rahul.reddy@example.com','DEMO-JH-0001'],
      ['KOKAPET','priya.mehta@example.com','DEMO-KOK-0001']
    ]) {
      const customer=customers[customerEmail];
      await client.query(
        `INSERT INTO quotations(branch_id,customer_id,created_by,quotation_number,items,subtotal,tax_amount,discount_amount,total_amount,valid_until,status,notes)
         VALUES($1,$2,NULL,$3,$4::jsonb,4990,0,0,4990,CURRENT_DATE+14,'SENT','Demo quotation')
         ON CONFLICT(quotation_number) DO NOTHING`,
        [branches[branchCode].id,customer.id,qNumber,JSON.stringify([{name:'Coworking Hot seat : Per Day',quantity:10,rate:499,taxPercent:0}])]);
      const complaintTitle=`Demo complaint - ${branchCode}`;
      const existing=await client.query('SELECT id FROM complaints WHERE branch_id=$1 AND title=$2',[branches[branchCode].id,complaintTitle]);
      if(!existing.rowCount) await client.query(
        `INSERT INTO complaints(branch_id,customer_id,title,description,priority,status)
         VALUES($1,$2,$3,$4,'MEDIUM','OPEN')`,
        [branches[branchCode].id,customer.id,complaintTitle,'Sample complaint record for testing the NanoSpace dashboard.']);
    }

    const demoUserIds = [
      ...Object.values(users).map(user => user.id),
      ...Object.values(customers).map(customer => customer.user_id)
    ];
    if (process.env.ADMIN_EMAIL) {
      const admin = await client.query(
        'SELECT id FROM users WHERE email=$1',
        [process.env.ADMIN_EMAIL.trim().toLowerCase()]
      );
      if (admin.rowCount) demoUserIds.push(admin.rows[0].id);
    }

    const uniqueDemoUserIds = [...new Set(demoUserIds)];
    await client.query(
      `DELETE FROM notifications
       WHERE user_id = ANY($1::uuid[])
       AND title LIKE 'Demo notification:%'`,
      [uniqueDemoUserIds]
    );
    const notificationSpecs = [
      ['Demo notification: Welcome', 'Welcome to the NanoSpace demo. Explore your branch dashboard and workspace bookings.', null],
      ['Demo notification: Dashboard data ready', 'Sample customers, workspaces, bookings, quotations, and complaints are available for dashboard testing.', null],
      ['Demo notification: Getting started', 'This is a sample read notification. Demo notifications are safely refreshed each time the seed runs.', new Date(Date.now() - 86400000).toISOString()]
    ];
    for (const userId of uniqueDemoUserIds) {
      for (const [title, message, readAt] of notificationSpecs) {
        await client.query(
          `INSERT INTO notifications(user_id,title,message,read_at)
           VALUES($1,$2,$3,$4)`,
          [userId, title, message, readAt]
        );
      }
    }

    const stats = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM customers) AS customers,
         (SELECT COUNT(*)::int FROM bookings) AS bookings,
         (SELECT COUNT(*)::int FROM quotations) AS quotations,
         (SELECT COUNT(*)::int FROM complaints WHERE status IN ('OPEN','IN_PROGRESS')) AS open_complaints,
         (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
         (SELECT COUNT(*)::int FROM notifications WHERE user_id = ANY($1::uuid[])) AS demo_notifications,
         (SELECT COUNT(*)::int FROM notifications WHERE user_id = ANY($1::uuid[]) AND read_at IS NULL) AS unread_demo_notifications`,
      [uniqueDemoUserIds]
    );

    await client.query('COMMIT');
    console.log('NanoSpace demo data seeded successfully.');
    console.log('Branches: 4 | Inventory services: 11 | Staff users: 12 | Customer login users: 6 | Customers: 6 | Workspaces: 32 | Demo bookings: up to 4 | Quotations: 4 | Complaints: 4');
    console.log('Current database stats:', JSON.stringify(stats.rows[0]));
    console.log(`Demo user password: ${demoPassword} (change DEMO_USER_PASSWORD in .env before running in shared environments)`);
    console.log('Demo users use emails like kphb.admin@nanospace.local, nanakramguda.reception@nanospace.local, aarav.customer@nanospace.local, etc.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Demo seed failed:', error.message);
    process.exitCode=1;
  } finally {
    client.release();
    await pool.end();
  }
}
run();
