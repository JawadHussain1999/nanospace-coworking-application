export const BRANCHES = ['KPHB', 'Nanakramguda', 'Jubilee Hills', 'Kokapet'];
export const DEMO_PASSWORD = 'Nano@123';
export const DEMO_USERS = [
  { email: 'jawadhussain9014@gmail.com', password: DEMO_PASSWORD, name: 'Jawad Hussain', role: 'super_admin', branch: null },
  { email: 'superadmin@nanospace.in', password: DEMO_PASSWORD, name: 'Jawad Hussain', role: 'super_admin', branch: null },
  { email: 'branchadmin@nanospace.in', password: DEMO_PASSWORD, name: 'Branch Admin', role: 'branch_admin', branch: 'Nanakramguda' },
  { email: 'reception@nanospace.in', password: DEMO_PASSWORD, name: 'Reception Admin', role: 'reception_admin', branch: 'Nanakramguda' },
  { email: 'employee@nanospace.in', password: DEMO_PASSWORD, name: 'Ayesha Khan', role: 'employee', branch: 'Nanakramguda' },
  { email: 'customer@nanospace.in', password: DEMO_PASSWORD, name: 'Rahul Sharma', role: 'customer', branch: 'Nanakramguda' }
];

export const monthlyRevenue = [
  { month: 'May', revenue: 410000, expenses: 210000 },
  { month: 'Jun', revenue: 465000, expenses: 235000 },
  { month: 'Jul', revenue: 520000, expenses: 248000 },
  { month: 'Aug', revenue: 485000, expenses: 260000 },
  { month: 'Sep', revenue: 590000, expenses: 275000 },
  { month: 'Oct', revenue: 640000, expenses: 290000 }
];
export const branchRevenue = [
  { branch: 'KPHB', revenue: 185000 },
  { branch: 'Nanakramguda', revenue: 242000 },
  { branch: 'Jubilee Hills', revenue: 128000 },
  { branch: 'Kokapet', revenue: 85000 }
];
export const recentBookings = [
  { id: 'nanakramguda1048', customer: 'Rahul Sharma', branch: 'Nanakramguda', workspace: 'Dedicated Desk 14', date: '23 Oct 2026', status: 'Confirmed', amount: '₹8,500' },
  { id: 'kphb1047', customer: 'Mira Tech Pvt Ltd', branch: 'KPHB', workspace: 'Meeting Room A', date: '23 Oct 2026', status: 'Pending', amount: '₹3,000' },
  { id: 'jubileehills1046', customer: 'Aarav Consulting', branch: 'Jubilee Hills', workspace: 'Private Cabin 02', date: '22 Oct 2026', status: 'Confirmed', amount: '₹22,000' },
  { id: 'kokapet1045', customer: 'Nexa Labs', branch: 'Kokapet', workspace: 'Hot Desk 08', date: '22 Oct 2026', status: 'Completed', amount: '₹1,200' },
  { id: 'nanakramguda1044', customer: 'Rahul Sharma', branch: 'Nanakramguda', workspace: 'Meeting Room B', date: '21 Oct 2026', status: 'Cancelled', amount: '₹2,000' }
];
export const quotations = [
  { id: 'QT-2081', customer: 'Mira Tech Pvt Ltd', branch: 'KPHB', date: '22 Oct 2026', amount: '₹45,000', status: 'Sent' },
  { id: 'QT-2080', customer: 'Aarav Consulting', branch: 'Jubilee Hills', date: '21 Oct 2026', amount: '₹22,000', status: 'Accepted' },
  { id: 'QT-2079', customer: 'Rahul Sharma', branch: 'Nanakramguda', date: '20 Oct 2026', amount: '₹8,500', status: 'Draft' }
];
export const customers = [
  { name: 'Rahul Sharma', email: 'rahul@example.com', branch: 'Nanakramguda', plan: 'Dedicated Desk', status: 'Active' },
  { name: 'Mira Tech Pvt Ltd', email: 'ops@miratech.example', branch: 'KPHB', plan: 'Private Office', status: 'Active' },
  { name: 'Aarav Consulting', email: 'hello@aarav.example', branch: 'Jubilee Hills', plan: 'Private Cabin', status: 'Active' },
  { name: 'Nexa Labs', email: 'team@nexa.example', branch: 'Kokapet', plan: 'Hot Desk', status: 'Pending' }
];
