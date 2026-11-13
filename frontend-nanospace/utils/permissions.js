export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  branch_admin: 'Branch Admin',
  reception_admin: 'Reception Admin',
  employee: 'Employee',
  customer: 'Customer'
};

const menus = {
  super_admin: [
    { label: 'Overview', icon: 'dashboard', items: [{ label: 'Dashboard', path: '/dashboard' }, { label: 'Analytics', path: '/analytics' }] },
    { label: 'Sales', icon: 'sales', items: [{ label: 'Quotations', path: '/quotations' }, { label: 'Bookings', path: '/bookings' }, { label: 'In-person booking', path: '/in-person-booking' }, { label: 'Agreements', path: '/agreements' }, { label: 'Documents', path: '/documents' }] },
    { label: 'Customers', icon: 'customers', items: [{ label: 'All Customers', path: '/customers' }, { label: 'Complaints', path: '/complaints' }] },
    { label: 'Workspace', icon: 'workspace', items: [{ label: 'Branches', path: '/branches' }, { label: 'Floor Studio', path: '/workspace' }, { label: 'Inventory', path: '/inventory' }] },
    { label: 'People', icon: 'people', items: [{ label: 'Employees', path: '/employees' }, { label: 'Attendance', path: '/attendance' }, { label: 'Leave Management', path: '/leave' }, { label: 'Payroll', path: '/payroll' }] },
    { label: 'Finance', icon: 'finance', items: [{ label: 'Revenue & Invoices', path: '/finance' }, { label: 'Payment Reminders', path: '/reminders' }, { label: 'Expenses', path: '/expenses' }] },
    { label: 'Reports', icon: 'reports', items: [{ label: 'Reports', path: '/reports' }] },
    { label: 'Settings', icon: 'settings', items: [{ label: 'Users & Roles', path: '/settings' }, { label: 'Bulk Import', path: '/bulk-import' }, { label: 'Audit Logs', path: '/audit-logs' }, { label: 'Database Backups', path: '/backups' }] }
  ],
  branch_admin: [
    { label: 'Overview', icon: 'dashboard', items: [{ label: 'Dashboard', path: '/dashboard' }] },
    { label: 'Sales', icon: 'sales', items: [{ label: 'Quotations', path: '/quotations' }, { label: 'Bookings', path: '/bookings' }, { label: 'In-person booking', path: '/in-person-booking' }, { label: 'Agreements', path: '/agreements' }, { label: 'Documents', path: '/documents' }] },
    { label: 'Customers', icon: 'customers', items: [{ label: 'Customers', path: '/customers' }, { label: 'Complaints', path: '/complaints' }] },
    { label: 'Workspace', icon: 'workspace', items: [{ label: 'Floor Studio', path: '/workspace' }, { label: 'Inventory', path: '/inventory' }] },
    { label: 'People', icon: 'people', items: [{ label: 'Employees', path: '/employees' }, { label: 'Attendance', path: '/attendance' }, { label: 'Leave Management', path: '/leave' }] },
    { label: 'Finance', icon: 'finance', items: [{ label: 'Revenue & Invoices', path: '/finance' }, { label: 'Payment Reminders', path: '/reminders' }, { label: 'Expenses', path: '/expenses' }] },
    { label: 'Reports', icon: 'reports', items: [{ label: 'Reports', path: '/reports' }] },
    { label: 'Settings', icon: 'settings', items: [{ label: 'Bulk Import', path: '/bulk-import' }] }
  ],
  reception_admin: [
    { label: 'My Workspace', icon: 'dashboard', items: [{ label: 'Dashboard', path: '/dashboard' }, { label: 'Attendance', path: '/attendance' }, { label: 'Leave Management', path: '/leave' }, { label: 'My Payroll', path: '/payroll' }, { label: 'My Documents', path: '/documents' }] },
    { label: 'Front Desk', icon: 'sales', items: [{ label: 'In-person booking', path: '/in-person-booking' }] }
  ],
  employee: [
    { label: 'My Workspace', icon: 'dashboard', items: [{ label: 'Dashboard', path: '/dashboard' }, { label: 'Attendance', path: '/attendance' }, { label: 'Leave Management', path: '/leave' }, { label: 'My Payroll', path: '/payroll' }, { label: 'My Documents', path: '/documents' }] }
  ],
  customer: [
    { label: 'My NanoSpace', icon: 'dashboard', items: [{ label: 'Dashboard', path: '/dashboard' }, { label: 'Book a Workspace', path: '/book-workspace' }, { label: 'My Bookings', path: '/bookings' }, { label: 'My Quotations', path: '/quotations' }, { label: 'My Agreements', path: '/agreements' }, { label: 'My Documents', path: '/documents' }, { label: 'Payments', path: '/reminders' }, { label: 'Raise a Complaint', path: '/complaints' }] }
  ]
};
export function getMenuForRole(role) { return menus[role] || menus.customer; }
export function canSeeAllBranches(role) { return role === 'super_admin'; }
