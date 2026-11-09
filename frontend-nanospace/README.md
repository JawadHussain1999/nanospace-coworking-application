# NanoSpace Co-working Dashboard

Role-based frontend prototype for NanoSpace with Super Admin, Branch Admin, Reception Admin, Employee and Customer demo accounts.

## Technology
- Next.js 16.4.2 (Pages Router retained for compatibility with this prototype)
- React 19
- Reactstrap + Bootstrap 5
- Redux Toolkit + React Redux for global mutable state (auth, selected branch, bookings, quotations and notifications)
- React Hook Form for login validation and in-person booking form validation
- Recharts for dashboard analytics
- react-data-table-component for selectable inventory rows
- jsPDF for demo quotation PDFs
- React Icons

## Requirements
- Node.js 20.9 or newer; use a current 64-bit Windows LTS installation on Windows.
- npm 10+ recommended.

## Install and run
```bash
npm install
npm run dev
```
Open http://localhost:3000.

For a clean reinstall on Windows if native compiler packages are corrupted:
```bat
rmdir /s /q node_modules
npm cache verify
npm install
npm run dev
```

## Build
```bash
npm run lint
npm run build
```

## Demo credentials
Password for every account: `Nano@123`
- `superadmin@nanospace.in`
- `branchadmin@nanospace.in`
- `reception@nanospace.in`
- `employee@nanospace.in`
- `customer@nanospace.in`

Branch admin and reception demo users are assigned to Nanakramguda.

## Notes
- UI components are grouped by feature under `components/`: `overview/dashboard`, `overview/insights`, `layout`, `bookings`, `customers`, `inventory`, `attendance`, `quotations`, `workspace`, `users`, `settings`, `records`, and `shared`. Next.js route entry points remain in `pages/`.
- Redux store is created per app instance; do not use a shared mutable singleton store for server-side requests.
- Auth localStorage and demo login are for prototyping only. Enforce roles and permissions on the backend before production.
- Demo inventory, account changes, attendance, bookings, and management records are stored in browser localStorage. This is local to the current browser and is not shared across devices or users.
- Local demo persistence is isolated behind `services/demoStorage.js`. API mode is configured locally and feature screens call the shared API services.
- Admin management routes provide local create, edit, delete, search, and export workflows. User/role changes affect demo sign-in accounts; new accounts use the shared demo password.
- Employees can clock in once and clock out once per local calendar day. Attendance records are demo data, not payroll-grade timekeeping; configure shifts, corrections, and backend validation before production.
- Admins can manage inventory offerings and prices from the Inventory page. Catalog changes appear in booking and quotation screens, including newly added offerings.
- Bookings can include optional car parking for a one-time fee per booking. Edit the active Car Parking price in Inventory to change the add-on amount.
- Customers can upload their own PDF, PNG or JPEG KYC documents; reception and branch admins can upload documents for branch customers, download files and approve or reject submissions. Demo documents use browser IndexedDB; migrate KYC storage to secured, access-controlled backend storage before production.
- Super Admin dashboards and records can be filtered by branch; branch admins and reception users are limited to their assigned branch in the UI. Shared inventory rates can only be changed by Super Admin. Enforce branch access and permissions in backend APIs before production; client-side filters are not a security boundary.
- Payment reminders include a WhatsApp action that opens a pre-filled message for the customer. Staff review and send the message in WhatsApp; connect the WhatsApp Business API and a payment gateway for automated delivery or payment links.
- The UI uses Redux Toolkit for shared client state and Axios for backend requests. Enforce authentication, authorization, audit logging, and input validation on the backend before production.
- The official quotation PDF template has not yet been supplied, so the PDF uses a temporary design.

## Backend API integration
- Password recovery is available from the sign-in page: `/forgot-password` requests a reset link, and `/reset-password?token=...` accepts the emailed one-time token and a new password. The backend must be configured with SMTP for delivery; local development can use its development-only reset token response.
- Configure `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_API_MODE=api` in `.env` or `.env.local`; restart Next.js after changing environment values. Set `NEXT_PUBLIC_API_MODE=demo` to switch back to browser-local prototype data.
- `services/apiEndpoints.js` is the single endpoint-path registry. `services/api.js` contains the shared Axios client, Bearer token interceptor, and domain API methods; feature components call those methods rather than embedding URLs.
- The API login response must provide a JWT token (`token`, `accessToken`, `access_token` or `jwt`) and a `user`/`account` object with `name`, `email` and `role`. The client stores the token in browser localStorage and sends it as `Authorization: Bearer ...`.
- List endpoints may return an array directly or wrap it in `data`, `items`, `results`, `records`, or a resource-named array. Inventory records need an ID, rate/price, unit and status.
- API-backed screens include account and dashboard data, bookings/calendar/availability, inventory, workspaces, attendance, quotations, KYC documents, users, reports, settings, audit logs, payments, invoices, agreements, payroll, leave, expenses, complaints, and notifications. The generic records view exposes detail/download/refund/process actions only where the endpoint list provides them.
- The endpoint wrappers include both the starter-backend routes and the routes labeled “Additional APIs Proposed for Future Development.” Proposed routes may fail until implemented on the backend. The supplied list does not define payload/response schemas, so the frontend accepts common JSON shapes; verify each operation against the running backend. Profile editing, user detail editing, and document approval/rejection still need additional backend endpoints.
- Run the backend at the configured URL before signing in while API mode is enabled. If API mode is active and the backend is unreachable, the login page reports that connection problem and offers an explicit demo sign-in option; it never silently falls back.
