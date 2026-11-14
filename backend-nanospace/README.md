# NanoSpace Backend (Express + PostgreSQL)

Starter REST API for the NanoSpace co-working management system, based on the supplied RBAC documentation.

## Requirements
- Node.js 20+
- PostgreSQL 14+
- npm

## Setup
1. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE nanospace;
   ```
2. Edit `.env` (or copy `.env.example` to `.env`) and set `DATABASE_URL` to your PostgreSQL connection string. Set a unique `JWT_SECRET` of at least 32 characters and configure the admin seed credentials before using `npm run seed:admin`.
3. Install dependencies and create tables:
   ```bash
   npm install
   npm run db:setup
   npm run seed:admin
   npm run seed:demo
   npm run seed:simple
   npm run dev
   ```
4. API runs on the port configured in `.env` (the included local configuration uses `http://localhost:5001`). Check `GET /api/health`.

The seed script creates a Super Admin from `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` environment variables. It requires all three values and limits the password to 72 UTF-8 bytes (bcrypt's limit); choose a long, unique password. It does not use default credentials.

`npm run seed:demo` adds sample branches, staff and customer accounts, inventory, workspaces, bookings, quotations, complaints, and read/unread notifications for testing the dashboard. It is safe to rerun; demo users share `DEMO_USER_PASSWORD` (defaults to `Demo@12345`). Change that value in `.env` before using demo accounts outside a local machine. The script prints live dashboard-related row counts after seeding.
Seeded workspaces are published and available to the booking flow. For real deployments, create each bookable room as an active workspace and publish its floor before accepting bookings; unpublished or missing workspaces are intentionally excluded from availability.

## Application structure

The API follows an MVC-style structure:

- `src/routes/` maps API paths to controllers.
- `src/controllers/` handles requests, authorization rules, and API behavior.
- `src/models/` provides access to application data sources such as PostgreSQL.
- `src/views/` contains JSON response view helpers; this API returns JSON rather than HTML templates.
- `src/middleware/` contains shared authentication and error handling.

The existing endpoint URLs and JSON response formats are preserved.

## Authentication
Send `Authorization: Bearer <token>` for protected endpoints.
Login: `POST /api/auth/login` with `{ "email": "...", "password": "..." }`.
The login response returns a JWT and basic user details.

Roles: `SUPER_ADMIN`, `BRANCH_ADMIN`, `RECEPTION_ADMIN`, `EMPLOYEE`, `CUSTOMER`.
Branch Admin and Reception Admin are restricted to their assigned branch. Employees and customers are restricted to their own records. These rules are enforced in API middleware and SQL query conditions, not just in the UI.

Password reset and account welcome emails use the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `EMAIL_FROM` settings. Set `FRONTEND_URL` to the public frontend origin. Staff-created accounts receive a single-use password setup link that expires after 30 minutes; passwords are never emailed. Self-signups receive a welcome message with their login email. Configure SMTP before enabling account creation in production; delivery failures are reported without rolling back an already-created account.

Customer lifecycle emails use the same SMTP settings: booking creation, confirmation/status or schedule changes, cancellations, verified payments, quotation creation/email, password reset links, and password-change alerts. A booking created from the shared Razorpay link remains pending until staff verifies the payment; the request email explains this manual verification. Customer email delivery is skipped for placeholder `@example.com` addresses. SMTP delivery failures are logged and do not undo saved bookings, payments, quotations, or password changes.

Customer creation can verify a GSTIN through Surepass and fill the registered company name automatically. Set `SUREPASS_TOKEN` in the backend environment; optionally set `SUREPASS_BASE_URL` to Surepass's sandbox API base URL when testing. The authenticated endpoint is `GET /api/customers/gstin/:gstin`; the token stays server-side.

## Database backups

The backend creates a full ZIP of CSV files for the tables in the PostgreSQL `public` schema once per India calendar day. If the backend is offline at the scheduled time, it creates the missing backup when it starts. The ZIP includes a JSON manifest with per-table row counts. The internal `application_backups` table is excluded to avoid recursively backing up older archives.

Archives are stored in the application database, and automatic and manual archives older than 30 days are removed. A Super Admin can use the Database Backups page to create and download a fresh ZIP or download a retained archive. The API is `GET /api/backups`, `POST /api/backups`, and `GET /api/backups/:id/download`; all require the `SUPER_ADMIN` role. The archive contains confidential full-record data, including account and customer records. Protect downloaded files accordingly.

## API endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/forgot-password` with `{ "email": "..." }`. Returns the same response for existing and unknown accounts. Configure SMTP and `FRONTEND_URL` to deliver reset links; links expire in 30 minutes and are single-use.
- `POST /api/auth/signup` accepts a user-chosen password. `POST /api/auth/reset-password` accepts `{ "token": "...", "password": "..." }`. Passwords must be non-empty and are limited to 72 UTF-8 bytes by bcrypt. The UI offers a non-blocking strength recommendation.
- `GET /api/auth/me` (authenticated)

### Branches
- `GET /api/branches` (all roles see only authorized branches)
- `POST /api/branches` (Super Admin; provide `name`, `code`, and optional `address` and positive integer `floorCount`, which includes the Ground Floor and defaults to `1`)
- `PATCH /api/branches/:id` (Super Admin; `floorCount` can be updated to a positive integer)

### Users
- `GET /api/users` (Super Admin; branch admins can list branch users)
- `POST /api/users` (Super Admin; Branch Admin can create branch Reception Admin/Employee/Customer). New accounts default to password `nanospace123` when no password is supplied; creating a `CUSTOMER` role also creates its customer profile.
- `PATCH /api/users/:id/status` (Super Admin)

### Customers
- `GET /api/customers` (admin/reception scoped; customer sees own profile)
- `POST /api/customers` (Super Admin, Branch Admin, Reception Admin). A Super Admin must provide an email; the API creates a linked customer login with default password `nanospace123`.
- `GET /api/customers/:id`
- `PATCH /api/customers/:id`

### Inventory
- `GET /api/inventory`
- `POST /api/inventory` (Super Admin)
- `PATCH /api/inventory/:id` (Super Admin)

### Workspaces / floor layout
- `GET /api/workspaces?branchId=&floor=`
- `POST /api/workspaces` (Super Admin, Branch Admin)
- `PATCH /api/workspaces/:id` (Super Admin, Branch Admin)
- `POST /api/workspaces/publish` (Super Admin, Branch Admin; body includes `branch` or `branchId` and `floor`)
- Publish floor layouts after adding rooms. Only active, published workspaces can appear in booking availability.

### Bookings
- `GET /api/bookings` (scoped to branch or own customer/employee record)
- `POST /api/bookings` (Super Admin, Branch Admin, Reception Admin, Customer)
- `GET /api/bookings/:id`
- `PATCH /api/bookings/:id/status` (admin/reception roles)
- Booking creation checks workspace overlap inside a database transaction and reads price from inventory. Confirmed/occupied bookings cannot overlap for the same workspace and time window.

### Quotations
- `GET /api/quotations`
- `POST /api/quotations` (admin/reception roles)
- `PATCH /api/quotations/:id/status` (admin/reception; customer can accept/reject own quotation)

### Backups
- `GET /api/backups` (Super Admin; lists retained archives)
- `POST /api/backups` (Super Admin; creates and downloads a full ZIP/CSV archive)
- `GET /api/backups/:id/download` (Super Admin; downloads a retained archive)

### Complaints
- `GET /api/complaints`
- `POST /api/complaints`
- `PATCH /api/complaints/:id/status` (admin/reception roles)

### Notifications
- `GET /api/notifications` (authenticated user sees their own notifications)
- `PATCH /api/notifications/:id/read` (marks the authenticated user's notification as read)

### Error response
```json
{ "error": "Human-readable message" }
```

## Example requests

Login:
```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@nanospace.local", "password": "ChangeMe123!" }
```

Create booking:
```json
{
  "branchId": "uuid",
  "workspaceId": "uuid",
  "customerId": "uuid",
  "inventoryItemId": "uuid",
  "startsAt": "2026-10-25T09:00:00+05:30",
  "endsAt": "2026-10-25T18:00:00+05:30",
  "quantity": 1,
  "status": "CONFIRMED"
}
```
For a customer account, omit `customerId`; the API uses the authenticated user's customer record. For reception staff, `customerId` is required.

## Important production notes
- This is a functional starter, not a fully audited production deployment.
- Configure HTTPS, secrets management, backups, email/SMS, private object storage for KYC files, payment gateway verification, audit retention, and stricter validation/rate limits before production.
- Payroll, attendance, leave, agreements, invoices, payment gateway, PDF generation, and document upload are planned extension modules; the supplied documentation defines them but does not specify all workflows/fields. Add those after confirming business rules.
- `POST /api/attendance/import` is an authenticated Super Admin/Branch Admin endpoint for adding historical attendance entries. It validates staff/branch membership and rejects an existing staff/date record.
- Use migrations in a production workflow rather than running setup SQL against a live database.
