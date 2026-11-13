CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  code VARCHAR(30) NOT NULL UNIQUE,
  address TEXT,
  floor_count INTEGER NOT NULL DEFAULT 1 CHECK (floor_count > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS floor_count INTEGER NOT NULL DEFAULT 1 CHECK (floor_count > 0);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('SUPER_ADMIN','BRANCH_ADMIN','RECEPTION_ADMIN','EMPLOYEE','CUSTOMER')),
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  avatar TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (role IN ('SUPER_ADMIN') OR branch_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_branch_role ON users(branch_id, role);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(40),
  company_name VARCHAR(180),
  gstin VARCHAR(20),
  pan_number VARCHAR(10),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10),
  ADD COLUMN IF NOT EXISTS address TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  description TEXT,
  hsn_sac VARCHAR(40),
  rate NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
  unit VARCHAR(60) NOT NULL,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
  product_type VARCHAR(50) NOT NULL DEFAULT 'WORKSPACE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sellable BOOLEAN NOT NULL DEFAULT TRUE,
  track_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO inventory_items(name, description, rate, unit, tax_percent, product_type, is_active, sellable)
SELECT catalog.name, catalog.description, catalog.rate, catalog.unit, catalog.tax_percent, catalog.product_type, TRUE, TRUE
FROM (VALUES
  ('CABIN (3 SEATER)', 'Private cabin with 3 seats', 28500, 'pcs', 18, 'WORKSPACE'),
  ('Private office: 10 Seater office', 'Includes 3-seater manager cabin and 7 employee seats', 95000, 'pcs', 18, 'WORKSPACE'),
  ('Private Office: 23 Seater', '19 employee chairs and 4-seater manager cabin', 218500, 'pcs', 18, 'WORKSPACE'),
  ('Conference Room — Non Member', 'One session = 4 hours', 4999, 'session', 18, 'WORKSPACE'),
  ('Conference Room — NanoSpace Member', 'For NanoSpace members, prior booking required', 599, 'session', 18, 'WORKSPACE'),
  ('Manager Cabin: 4 Seater', 'Private manager cabin for 4 people', 38000, 'pcs', 18, 'WORKSPACE'),
  ('Podcast Room — Non Member', 'Podcast room rental for non-members', 999, 'session', 18, 'WORKSPACE'),
  ('Podcast Room — Member', 'Podcast room rental for members', 599, 'session', 18, 'WORKSPACE'),
  ('Coworking Hot Seat — Per Month', 'First-come, first-served hot desk membership', 8500, 'month', 18, 'WORKSPACE'),
  ('Coworking Hot Seat — Per Day', 'Day pass for a hot seat', 499, 'day', 18, 'WORKSPACE'),
  ('Dedicated Seat (Inside Cabin)', 'Dedicated seat inside a private office', 9500, 'month', 18, 'WORKSPACE'),
  ('Car Parking', 'Optional car parking add-on, billed once per booking', 3000, 'booking', 18, 'ADD_ON')
) AS catalog(name, description, rate, unit, tax_percent, product_type)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items existing WHERE LOWER(existing.name) = LOWER(catalog.name)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  floor VARCHAR(80) NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  workspace_type VARCHAR(60) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','OCCUPIED','MAINTENANCE')),
  layout_x NUMERIC(10,2),
  layout_y NUMERIC(10,2),
  layout_width NUMERIC(10,2),
  layout_height NUMERIC(10,2),
  draft_layout_x NUMERIC(10,2),
  draft_layout_y NUMERIC(10,2),
  layout_published BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, floor, code)
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS draft_layout_x NUMERIC(10,2);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS draft_layout_y NUMERIC(10,2);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'layout_published'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN layout_published BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
ALTER TABLE workspaces ALTER COLUMN layout_published SET DEFAULT FALSE;
UPDATE workspaces
SET draft_layout_x = COALESCE(draft_layout_x, layout_x),
    draft_layout_y = COALESCE(draft_layout_y, layout_y)
WHERE draft_layout_x IS NULL OR draft_layout_y IS NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_branch_floor ON workspaces(branch_id, floor, status);

CREATE TABLE IF NOT EXISTS workspace_floor_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  floor VARCHAR(80) NOT NULL,
  draft_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE(branch_id, floor)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  seat_count INTEGER NOT NULL DEFAULT 1 CHECK (seat_count > 0),
  unit_rate NUMERIC(12,2) NOT NULL CHECK (unit_rate >= 0),
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL,
  tax_amount NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (advance_amount >= 0 AND advance_amount <= total_amount),
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('REQUESTED','CONFIRMED','CANCELLED','COMPLETED')), 
  booking_source VARCHAR(30) NOT NULL DEFAULT 'ONLINE' CHECK (booking_source IN ('ONLINE','IN_PERSON')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bookings'
      AND column_name = 'seat_count'
  ) THEN
    ALTER TABLE bookings
      ADD COLUMN seat_count INTEGER NOT NULL DEFAULT 1 CHECK (seat_count > 0);

    UPDATE bookings AS booking
    SET seat_count = workspace.capacity
    FROM workspaces AS workspace
    WHERE workspace.id = booking.workspace_id;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bookings'
      AND column_name = 'advance_amount'
  ) THEN
    ALTER TABLE bookings ADD COLUMN advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_bookings_branch_dates ON bookings(branch_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  quotation_number VARCHAR(40) NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  tax_mode VARCHAR(20) NOT NULL DEFAULT 'CGST_SGST',
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'CGST_SGST';
CREATE INDEX IF NOT EXISTS idx_quotations_branch_status ON quotations(branch_id, status);

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_complaints_branch_status ON complaints(branch_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

INSERT INTO branches (name, code, address) VALUES
 ('KPHB', 'KPHB', 'Hyderabad'),
 ('Nanakramguda', 'NANAKRAMGUDA', 'Hyderabad'),
 ('Jubilee Hills', 'JUBILEE_HILLS', 'Hyderabad'),
 ('Kokapet', 'KOKAPET', 'Hyderabad')
ON CONFLICT DO NOTHING;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS plan VARCHAR(100) DEFAULT 'Dedicated Member';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id, work_date);

CREATE TABLE IF NOT EXISTS leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  leave_type VARCHAR(60) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(4,1) NOT NULL DEFAULT 1,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','APPROVED','REJECTED','CANCELLED')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_branch ON leaves(branch_id);

CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  pay_period VARCHAR(40) NOT NULL,
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  pay_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','PAID','COMPLETED')),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, pay_period)
);
CREATE INDEX IF NOT EXISTS idx_payroll_user ON payroll(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_branch ON payroll(branch_id);

CREATE TABLE IF NOT EXISTS agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  contract_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','SENT','ACCEPTED','ACTIVE','EXPIRED','TERMINATED')),
  terms TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agreements_customer ON agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_agreements_branch ON agreements(branch_id);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  agreement_id UUID REFERENCES agreements(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT','PENDING','OVERDUE','PAID','COMPLETED','CANCELLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'UPI',
  transaction_reference VARCHAR(100),
  due_date DATE,
  payment_date TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','OVERDUE','PAID','COMPLETED','REFUNDED','CANCELLED')),
  refund_amount NUMERIC(12,2) DEFAULT 0,
  refund_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gateway_key_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS gateway_key_secret_encrypted TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_order ON payments(gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id)
  WHERE payment_id IS NOT NULL;
INSERT INTO invoices(invoice_number, customer_id, branch_id, booking_id, payment_id,
                     issue_date, due_date, subtotal, tax_amount, total_amount,
                     paid_amount, status, notes)
SELECT 'INV-' || UPPER(SUBSTRING(REPLACE(payment.id::text, '-', '') FROM 1 FOR 12)),
       payment.customer_id,
       payment.branch_id,
       booking.id,
       payment.id,
       COALESCE(
         (payment.payment_date AT TIME ZONE 'Asia/Kolkata')::date,
         (payment.created_at AT TIME ZONE 'Asia/Kolkata')::date,
         CURRENT_DATE
       ),
       COALESCE(
         (payment.payment_date AT TIME ZONE 'Asia/Kolkata')::date,
         (payment.created_at AT TIME ZONE 'Asia/Kolkata')::date,
         CURRENT_DATE
       ),
       booking.subtotal,
       booking.tax_amount,
       payment.amount,
       payment.amount,
       'PAID',
       CONCAT(
         'Automatically generated for paid booking ', booking.id, '. ',
         'Service: ', COALESCE(item.name, 'Workspace booking'), '. ',
         'Workspace: ', COALESCE(workspace.name, 'Assigned workspace'), '. ',
         'Branch: ', branch.name, '. ',
         'Booking schedule: ',
         TO_CHAR(booking.starts_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI AM'),
         ' to ',
         TO_CHAR(booking.ends_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI AM'),
         ' (Asia/Kolkata). Payment method: ', payment.payment_method,
         '. Payment reference: ', COALESCE(payment.gateway_payment_id, payment.transaction_reference, 'N/A'),
         '. Payment received: ',
         TO_CHAR(COALESCE(payment.payment_date, payment.created_at) AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI:SS AM'),
         ' (Asia/Kolkata).'
       )
FROM payments payment
JOIN bookings booking ON booking.id = payment.booking_id
JOIN branches branch ON branch.id = payment.branch_id
LEFT JOIN workspaces workspace ON workspace.id = booking.workspace_id
LEFT JOIN inventory_items item ON item.id = booking.inventory_item_id
WHERE payment.status IN ('PAID', 'COMPLETED')
  AND payment.booking_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM invoices existing WHERE existing.payment_id = payment.id)
ON CONFLICT DO NOTHING;
UPDATE invoices invoice
SET issue_date = (payment.payment_date AT TIME ZONE 'Asia/Kolkata')::date
FROM payments payment
WHERE invoice.payment_id = payment.id
  AND payment.payment_date IS NOT NULL
  AND invoice.notes LIKE 'Automatically generated for paid booking %';
UPDATE payments payment
SET invoice_id = invoice.id
FROM invoices invoice
WHERE invoice.payment_id = payment.id
  AND payment.invoice_id IS DISTINCT FROM invoice.id;

CREATE TABLE IF NOT EXISTS branch_payment_accounts (
  branch_id UUID PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  razorpay_key_id VARCHAR(120) NOT NULL,
  razorpay_key_secret_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number VARCHAR(50) UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  category VARCHAR(80) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  vendor VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','APPROVED','COMPLETED','REJECTED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_data BYTEA,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
  settings_key VARCHAR(80) NOT NULL DEFAULT 'general',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(120) NOT NULL,
  entity_id VARCHAR(100),
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS application_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_date DATE NOT NULL,
  backup_type VARCHAR(16) NOT NULL CHECK (backup_type IN ('DAILY','MANUAL')),
  file_name VARCHAR(255) NOT NULL,
  zip_data BYTEA NOT NULL,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  archive_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_backups_daily_date
  ON application_backups(backup_date) WHERE backup_type = 'DAILY';
CREATE INDEX IF NOT EXISTS idx_application_backups_created_at
  ON application_backups(created_at DESC);

CREATE TABLE IF NOT EXISTS email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(10) NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
