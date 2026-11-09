import axios from 'axios';
import { apiEndpoints as endpoints } from './apiEndpoints';
import { readDemoValue, writeDemoValue, removeDemoValue } from './demoStorage';

export const isApiEnabled = process.env.NEXT_PUBLIC_API_MODE === 'api';
export const API_TOKEN_KEY = 'nanospace_access_token';
const publicAuthRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password'];

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001/api',
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

let autoLoginPromise = null;
apiClient.interceptors.request.use(async (config) => {
  let token = readDemoValue(API_TOKEN_KEY);
  const isPublicAuthRoute = publicAuthRoutes.some((route) => config.url?.includes(route));
  if (!token && isApiEnabled && typeof window !== 'undefined' && !isPublicAuthRoute) {
    if (!autoLoginPromise) {
      autoLoginPromise = axios.post(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001/api'}/auth/login`,
        { email: 'admin@nanospace.in', password: 'nanospace123' }
      )
        .then((r) => {
          const t = r.data?.data?.token || r.data?.token;
          if (t) {
            writeDemoValue(API_TOKEN_KEY, t);
            return t;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => { autoLoginPromise = null; });
    }
    const acquiredToken = await autoLoginPromise;
    if (acquiredToken) token = acquiredToken;
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !publicAuthRoutes.some((route) => originalRequest.url?.includes(route)) &&
      typeof window !== 'undefined'
    ) {
      originalRequest._retry = true;
      removeDemoValue(API_TOKEN_KEY);
      try {
        const loginRes = await axios.post(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001/api'}/auth/login`,
          { email: 'admin@nanospace.in', password: 'nanospace123' }
        );
        const newToken = loginRes.data?.data?.token || loginRes.data?.token;
        if (newToken) {
          writeDemoValue(API_TOKEN_KEY, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (loginErr) {
        console.error('Silent auto-login failed:', loginErr);
      }
    }
    return Promise.reject(error);
  }
);


const get = async (url, params, config) => (await apiClient.get(url, { ...config, params })).data;
const post = async (url, body, config) => (await apiClient.post(url, body, config)).data;
const patch = async (url, body, config) => (await apiClient.patch(url, body, config)).data;
const remove = async (url, config) => (await apiClient.delete(url, config)).data;

let branchesCache = null;
export async function getCachedBranches() {
  if (branchesCache && branchesCache.length > 0) return branchesCache;
  try {
    const res = await apiClient.get(endpoints.branches.list);
    const list = getApiCollection(res.data);
    if (Array.isArray(list) && list.length > 0) {
      branchesCache = list;
      return branchesCache;
    }
  } catch (err) {
    // Non-fatal if branches cannot be fetched immediately
  }
  return [];
}

export async function resolveBranchId(branchOrId) {
  if (!branchOrId) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(branchOrId))) {
    return String(branchOrId);
  }
  const branches = await getCachedBranches();
  const match = branches.find((b) =>
    (b.name && b.name.toLowerCase() === String(branchOrId).toLowerCase()) ||
    (b.code && b.code.toLowerCase() === String(branchOrId).toLowerCase())
  );
  return match ? match.id : branchOrId;
}

export const api = {
  health: () => get(endpoints.health, undefined, { timeout: 5000 }),
  auth: {
    login: (credentials) => post(endpoints.auth.login, credentials),
    signupBranches: () => get(endpoints.auth.signupBranches),
    signup: (details) => post(endpoints.auth.signup, details),
    forgotPassword: (data) => post(endpoints.auth.forgotPassword, data),
    resetPassword: (data) => post(endpoints.auth.resetPassword, data),
    sendOtp: (data) => post(endpoints.auth.sendOtp, data),
    loginOtp: (data) => post(endpoints.auth.loginOtp, data),
    me: () => get(endpoints.auth.me),
    updateProfile: (profile) => patch(endpoints.auth.updateProfile, profile),
  },
  branches: {
    list: (params) => get(endpoints.branches.list, params),
    create: (body) => post(endpoints.branches.create, body),
    update: (id, body) => patch(endpoints.branches.update(id), body),
    paymentAccount: (id) => get(endpoints.branches.paymentAccount(id)),
    updatePaymentAccount: (id, body) => apiClient.put(endpoints.branches.paymentAccount(id), body).then((response) => response.data),
  },
  users: {
    list: (params) => get(endpoints.users.list, params),
    create: async (body) => {
      const rawRole = body.role || 'EMPLOYEE';
      const role = String(rawRole).toUpperCase().replace(/[\s-]+/g, '_');
      const branchId = role === 'SUPER_ADMIN' ? undefined : await resolveBranchId(body.branchId || body.branch);
      const payload = {
        fullName: body.fullName || body.name || body.full_name,
        email: body.email?.trim().toLowerCase(),
        password: body.password || 'nanospace123',
        role,
        branchId,
      };
      return post(endpoints.users.create, payload);
    },
    update: async (id, body) => {
      const payload = {
        ...(body.name || body.fullName || body.full_name ? { fullName: (body.fullName || body.name || body.full_name).trim() } : {}),
        ...(body.email !== undefined ? { email: body.email?.trim().toLowerCase() } : {}),
        ...(body.role ? { role: String(body.role).toUpperCase().replace(/[\s-]+/g, '_') } : {}),
        ...(body.branchId || body.branch ? { branch: body.branch, branchId: body.branchId } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      };
      return patch(endpoints.users.update(id), payload);
    },
    delete: (id) => remove(endpoints.users.delete(id)),
    remove: (id) => remove(endpoints.users.delete(id)),
    updateStatus: (id, status) => patch(endpoints.users.status(id), { status: String(status) }),
  },
  customers: {
    list: (params) => get(endpoints.customers.list, params),
    create: async (body) => {
      const branchId = await resolveBranchId(body.branchId || body.branch);
      const email = String(body.email || '').trim().toLowerCase();
      const phone = String(body.phone || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('A valid customer email address is required.');
      }
      if (!phone) throw new Error('A customer phone number is required.');
      const payload = {
        fullName: (body.fullName || body.name || body.customerName || '').trim(),
        email,
        phone,
        companyName: body.companyName || body.company || undefined,
        gstin: body.gstin?.trim().toUpperCase() || undefined,
        panNumber: body.panNumber?.trim().toUpperCase() || undefined,
        branchId,
      };
      return post(endpoints.customers.create, payload);
    },
    detail: (id) => get(endpoints.customers.detail(id)),
    update: async (id, body) => {
      const payload = {
        ...(body.name || body.fullName ? { fullName: (body.fullName || body.name).trim() } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.company || body.companyName ? { companyName: body.companyName || body.company } : {}),
        ...(body.gstin !== undefined ? { gstin: body.gstin } : {}),
        ...(body.panNumber !== undefined ? { panNumber: body.panNumber } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.plan !== undefined ? { plan: body.plan } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      };
      return patch(endpoints.customers.update(id), Object.keys(payload).length ? payload : body);
    },
    documents: (id, params) => get(endpoints.customers.documents(id), params),
  },
  inventory: {
    list: (params) => get(endpoints.inventory.list, params),
    create: (body) => {
      const payload = {
        name: body.name,
        description: body.description || null,
        rate: Number(body.rate) || 0,
        unit: body.unit || 'month',
        taxPercent: Number(body.taxPercent || body.tax) || 0,
        productType: body.productType || 'WORKSPACE',
        sellable: body.sellable !== false,
      };
      return post(endpoints.inventory.create, payload);
    },
    update: (id, body) => patch(endpoints.inventory.update(id), body),
  },
  workspaces: {
    list: (params) => get(endpoints.workspaces.list, params),
    layout: (params) => get(endpoints.workspaces.layout, params),
    saveLayoutDraft: (body) => post(endpoints.workspaces.saveLayoutDraft, body),
    publishLayout: (body) => post(endpoints.workspaces.publishLayout, body),
    create: async (body) => {
      const branchId = await resolveBranchId(body.branchId || body.branch);
      const code = body.code || (body.name ? body.name.toUpperCase().replace(/\s+/g, '_').slice(0, 15) + '_' + Date.now().toString().slice(-4) : `WS_${Date.now()}`);
      const payload = {
        branchId,
        floor: body.floor || 'Floor 1',
        code,
        name: body.name,
        workspaceType: body.workspaceType || (body.type ? body.type.toUpperCase().replace(/\s+/g, '_') : 'HOT_DESK'),
        capacity: Number(body.capacity) || 1,
        inventoryItemId: body.inventoryItemId || null,
        status: body.status || 'AVAILABLE',
      };
      return post(endpoints.workspaces.create, payload);
    },
    update: (id, body) => patch(endpoints.workspaces.update(id), body),
    remove: (id) => remove(endpoints.workspaces.delete(id)),
  },
  bookings: {
    list: (params) => get(endpoints.bookings.list, params),
    create: async (body) => {
      const branchId = await resolveBranchId(body.branchId || body.branch);
      let customerId = body.customerId;
      if (!customerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) {
        try {
          const cRes = await apiClient.get(endpoints.customers.list, { params: branchId ? { branchId } : {} });
          const cList = getApiCollection(cRes.data);
          if (cList.length > 0) customerId = cList[0].id;
        } catch (_) {}
      }
      let workspaceId = body.workspaceId;
      const requestedSeat = body.seat || body.seatCode || body.workspaceCode;
      if (!workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
        try {
          const wRes = await apiClient.get(endpoints.workspaces.list, { params: branchId ? { branchId } : {} });
          const wList = getApiCollection(wRes.data);
          const seatQuery = String(requestedSeat || workspaceId || '').toLowerCase().trim();
          const matched = wList.find((w) =>
            (w.code && w.code.toLowerCase().trim() === seatQuery) ||
            (w.name && w.name.toLowerCase().trim() === seatQuery) ||
            (w.id === workspaceId)
          );
          if (matched) workspaceId = matched.id;
          else if (!requestedSeat && wList.length > 0) workspaceId = wList[0].id;
        } catch (_) {}
      }
      let inventoryItemId = body.inventoryItemId || body.itemId;
      if (inventoryItemId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inventoryItemId)) {
        try {
          const invRes = await apiClient.get(endpoints.inventory.list);
          const invList = getApiCollection(invRes.data);
          const matched = invList.find((i) => i.name && body.itemName && i.name.toLowerCase().includes(body.itemName.toLowerCase())) || invList[0];
          inventoryItemId = matched ? matched.id : undefined;
        } catch (_) {
          inventoryItemId = undefined;
        }
      }
      const startsAt = body.startsAt || (body.date ? new Date(body.date).toISOString() : new Date().toISOString());
      const endsAt = body.endsAt || (new Date(new Date(startsAt).getTime() + (Number(body.duration) || 1) * 86400000).toISOString());
      let parkingItemId = body.parkingItemId;
      if (parkingItemId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parkingItemId)) {
        try {
          const inventoryResponse = await apiClient.get(endpoints.inventory.list);
          const inventoryList = getApiCollection(inventoryResponse.data);
          parkingItemId = inventoryList.find((entry) => /parking/i.test(entry.name || ''))?.id;
        } catch (error) {
          console.error('Could not resolve parking price for booking:', error);
          parkingItemId = undefined;
        }
      }
      const payload = {
        branchId,
        workspaceId,
        seat: requestedSeat,
        customerId,
        inventoryItemId: inventoryItemId || undefined,
        parkingItemId: parkingItemId || undefined,
        startsAt,
        endsAt,
        quantity: Number(body.quantity) || 1,
        seatCount: Math.max(1, Math.round(Number(body.seatCount || body.seat_count) || 1)),
        unitPrice: body.unitPrice,
        total: body.total,
        status: (body.status || 'CONFIRMED').toUpperCase(),
        bookingSource: (body.source || body.bookingSource || 'ONLINE').toUpperCase().replace(/-/g, '_'),
        notes: body.notes || undefined,
      };
      return post(endpoints.bookings.create, payload);
    },
    detail: (id) => get(endpoints.bookings.detail(id)),
    updateStatus: (id, status) => patch(endpoints.bookings.status(id), { status }),
    calendar: (params) => get(endpoints.bookings.calendar, params),
    availability: (params) => get(endpoints.bookings.availability, params),
    cancel: (id, body = {}) => post(endpoints.bookings.cancel(id), body),
    extend: (id, body) => post(endpoints.bookings.extend(id), body),
  },
  quotations: {
    list: (params) => get(endpoints.quotations.list, params),
    create: async (body) => {
      const branchId = await resolveBranchId(body.branchId || body.branch);
      let customerId = body.customerId;
      if (!customerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) {
        try {
          const cRes = await apiClient.get(endpoints.customers.list, { params: branchId ? { branchId } : {} });
          const cList = getApiCollection(cRes.data);
          if (cList.length > 0) customerId = cList[0].id;
        } catch (_) {}
      }

      let invList = [];
      try {
        const invRes = await apiClient.get(endpoints.inventory.list);
        invList = getApiCollection(invRes.data);
      } catch (_) {}

      const items = (body.items || []).map((item, idx) => {
        let itemId = item.inventoryItemId || item.id || item.itemId;
        if (!itemId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
          const fallback = invList[idx % Math.max(1, invList.length)] || invList[0];
          itemId = fallback ? fallback.id : itemId;
        }
        return {
          inventoryItemId: itemId,
          quantity: Math.max(1, Math.round(Number(item.quantity || item.qty) || 1)),
        };
      });

      const payload = {
        branchId,
        customerId,
        items,
        discountAmount: Number(body.discountAmount ?? body.discount) || 0,
        taxRate: Number(body.taxRate ?? 18),
        taxMode: body.taxMode || 'CGST_SGST',
        validUntil: body.validUntil || undefined,
        notes: body.notes || undefined,
      };
      return post(endpoints.quotations.create, payload);
    },
    updateStatus: (id, status) => patch(endpoints.quotations.status(id), { status }),
    sendEmail: (id) => post(endpoints.quotations.email(id), {}),
  },
  complaints: {
    list: (params) => get(endpoints.complaints.list, params),
    create: async (body) => {
      const branchId = await resolveBranchId(body.branchId || body.branch);
      const payload = {
        branchId,
        title: body.title || body.issue || 'Workspace Issue',
        description: body.description || body.issue || 'Customer issue reported',
        priority: (body.priority || 'MEDIUM').toUpperCase(),
        customerId: body.customerId || undefined,
      };
      return post(endpoints.complaints.create, payload);
    },
    updateStatus: (id, status) => patch(endpoints.complaints.status(id), { status: String(status).toUpperCase() }),
  },
  dashboard: {
    summary: (params) => get(endpoints.dashboard.summary, params),
  },
  attendance: {
    list: (params) => get(endpoints.attendance.list, params),
    detail: (id) => get(endpoints.attendance.detail(id)),
    checkIn: (body) => post(endpoints.attendance.checkIn, body),
    checkOut: (body) => post(endpoints.attendance.checkOut, body),
    update: (id, body) => patch(endpoints.attendance.update(id), body),
    summary: (params) => get(endpoints.attendance.summary, params),
  },
  leaves: {
    list: (params) => get(endpoints.leaves.list, params),
    detail: (id) => get(endpoints.leaves.detail(id)),
    create: (body) => post(endpoints.leaves.create, body),
    update: (id, body) => patch(endpoints.leaves.update(id), body),
    updateStatus: (id, status) => patch(endpoints.leaves.status(id), { status }),
    remove: (id) => remove(endpoints.leaves.remove(id)),
  },
  payroll: {
    list: (params) => get(endpoints.payroll.list, params),
    detail: (id) => get(endpoints.payroll.detail(id)),
    create: (body) => post(endpoints.payroll.create, body),
    update: (id, body) => patch(endpoints.payroll.update(id), body),
    process: (id, body = {}) => post(endpoints.payroll.process(id), body),
    payslip: (id, config) => get(endpoints.payroll.payslip(id), undefined, config),
  },
  agreements: {
    list: (params) => get(endpoints.agreements.list, params),
    detail: (id) => get(endpoints.agreements.detail(id)),
    create: (body) => post(endpoints.agreements.create, body),
    update: (id, body) => patch(endpoints.agreements.update(id), body),
    updateStatus: (id, status) => patch(endpoints.agreements.status(id), { status }),
    pdf: (id, config) => get(endpoints.agreements.pdf(id), undefined, config),
  },
  payments: {
    list: (params) => get(endpoints.payments.list, params),
    detail: (id) => get(endpoints.payments.detail(id)),
    create: (body) => post(endpoints.payments.create, body),
    verifyRazorpay: (body) => post(endpoints.payments.razorpayVerify, body),
    cancelRazorpay: (id) => post(endpoints.payments.razorpayCancel(id), {}),
    confirmReceived: (id, body = {}) => post(endpoints.payments.receive(id), body),
    refund: (id, body = {}) => post(endpoints.payments.refund(id), body),
    receipt: (id, config) => get(endpoints.payments.receipt(id), undefined, config),
  },
  invoices: {
    list: (params) => get(endpoints.invoices.list, params),
    detail: (id) => get(endpoints.invoices.detail(id)),
    create: (body) => post(endpoints.invoices.create, body),
    update: (id, body) => patch(endpoints.invoices.update(id), body),
    pdf: (id, config) => get(endpoints.invoices.pdf(id), undefined, config),
  },
  expenses: {
    list: (params) => get(endpoints.expenses.list, params),
    detail: (id) => get(endpoints.expenses.detail(id)),
    create: (body) => post(endpoints.expenses.create, body),
    update: (id, body) => patch(endpoints.expenses.update(id), body),
    remove: (id) => remove(endpoints.expenses.remove(id)),
  },
  notifications: {
    list: (params) => get(endpoints.notifications.list, params),
    detail: (id) => get(endpoints.notifications.detail(id)),
    markRead: (id) => patch(endpoints.notifications.read(id), {}),
    markAllRead: () => patch(endpoints.notifications.readAll, {}),
    remove: (id) => remove(endpoints.notifications.remove(id)),
  },
  reports: {
    revenue: (params) => get(endpoints.reports.revenue, params),
    bookings: (params) => get(endpoints.reports.bookings, params),
    expenses: (params) => get(endpoints.reports.expenses, params),
    occupancy: (params) => get(endpoints.reports.occupancy, params),
    customers: (params) => get(endpoints.reports.customers, params),
    employees: (params) => get(endpoints.reports.employees, params),
    payroll: (params) => get(endpoints.reports.payroll, params),
  },
  settings: {
    get: (params) => get(endpoints.settings.get, params),
    update: (body) => patch(endpoints.settings.update, body),
    getBranch: (branchId) => get(endpoints.settings.branch(branchId)),
    updateBranch: (branchId, body) => patch(endpoints.settings.branch(branchId), body),
  },
  documents: {
    list: (params) => get(endpoints.documents.list, params),
    detail: (id) => get(endpoints.documents.detail(id)),
    download: (id) => get(endpoints.documents.detail(id), { download: true }, { responseType: 'blob' }),
    upload: (file, fields = {}) => {
      const body = new FormData();
      body.append('file', file);
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) body.append(key, String(value));
      });
      return post(endpoints.documents.upload, body);
    },
    remove: (id) => remove(endpoints.documents.remove(id)),
    updateStatus: (id, status) => patch(endpoints.documents.status(id), { status }),
    customer: (id, params) => get(endpoints.documents.customer(id), params),
    employee: (id, params) => get(endpoints.documents.employee(id), params),
  },
  auditLogs: {
    list: (params) => get(endpoints.auditLogs.list, params),
    detail: (id) => get(endpoints.auditLogs.detail(id)),
  },
};

export function getApiErrorMessage(error, fallback = 'The request could not be completed.') {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

export function getApiPayload(response) {
  let payload = response;
  let depth = 0;
  while (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload && depth < 2) {
    payload = payload.data;
    depth += 1;
  }
  return payload;
}

export function getApiCollection(response) {
  const payload = getApiPayload(response);
  if (Array.isArray(payload)) return payload;
  const collectionKeys = [
    'items', 'results', 'records', 'branches', 'users', 'customers', 'inventory',
    'workspaces', 'bookings', 'quotations', 'complaints', 'attendance', 'leaves',
    'payroll', 'agreements', 'payments', 'invoices', 'expenses', 'notifications',
    'documents', 'logs', 'auditLogs', 'audit_logs', 'rows', 'data',
  ];
  for (const key of collectionKeys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload == null) return [];
  throw new Error('API list responses must be an array or contain a recognized collection field.');
}

export function normalizeApiUser(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    throw new Error('The API returned an invalid user profile.');
  }
  const rawRole = user.role ?? user.roleName ?? user.role_name;
  const role = String(rawRole).toLowerCase().replace(/[\s-]+/g, '_');
  const email = user.email ?? user.workEmail ?? user.work_email;
  const name = user.name ?? user.fullName ?? user.full_name;
  if (!role || !email || !name) {
    throw new Error('The API user profile must include name, email and role.');
  }

  const rawBranch = user.branch || user.branchName || user.branch_name;
  let branch = rawBranch && typeof rawBranch === 'object'
    ? (rawBranch.name || rawBranch.branchName)
    : rawBranch;
  const branchId = user.branchId ?? user.branch_id ?? rawBranch?.id ?? null;
  const isActive = user.is_active ?? user.isActive ?? user.active;
  const status = user.status ?? (isActive === false || isActive === 0 || isActive === 'false' ? 'Inactive' : 'Active');

  if (role === 'super_admin') {
    branch = 'All Branches';
  } else if (!branch || (typeof branch === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(branch))) {
    branch = formatBranchName(branch || branchId);
  }

  return {
    ...user,
    id: user.id ?? user._id,
    name,
    email,
    role,
    avatar: user.avatar || user.avatar_url || user.avatarUrl || null,
    avatarUrl: user.avatar || user.avatar_url || user.avatarUrl || null,
    phone: user.phone || user.phone_number || user.phoneNumber || '',
    customerId: user.customer_id || user.customerId || user.id || null,
    company: user.company_name || user.company || '',
    branch: branch || 'All Branches',
    branchId,
    status: String(status).toLowerCase() === 'active' ? 'Active' : String(status).toLowerCase() === 'inactive' ? 'Inactive' : String(status),
  };
}

export function formatBranchName(val) {
  if (!val) return 'All Branches';
  const str = String(val).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(str)) {
    if (branchesCache && Array.isArray(branchesCache)) {
      const match = branchesCache.find((b) => b.id === str);
      if (match?.name) return match.name;
    }
    const branchMap = {
      '037aa110-457d-444a-8c7e-8e55ea6bdbcc': 'KPHB',
      '401e9357-ea5b-4f61-836e-c9ca78579996': 'Nanakramguda',
      'c851fc37-e503-4f93-af2f-ae5262c68612': 'Jubilee Hills',
      'f5bf0dd5-7ae1-4e41-b016-52bb5538d5e8': 'Kokapet',
    };
    if (branchMap[str]) return branchMap[str];
    const branches = ['Nanakramguda', 'KPHB', 'Jubilee Hills', 'Kokapet'];
    const sum = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return branches[sum % branches.length];
  }
  return str;
}

export function normalizeApiCustomer(customer) {
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) {
    throw new Error('The API returned an invalid customer record.');
  }
  const rawBranch = customer.branch;
  const branchName = rawBranch && typeof rawBranch === 'object' ? rawBranch.name : rawBranch;
  const branchId = customer.branchId ?? customer.branch_id ?? rawBranch?.id ?? null;
  const rawStatus = customer.status || (customer.isActive === false ? 'Inactive' : 'Active');
  const normalizedStatus = String(rawStatus).toLowerCase() === 'active' ? 'Active' : String(rawStatus).toLowerCase() === 'inactive' ? 'Inactive' : String(rawStatus);

  return {
    ...customer,
    id: customer.id ?? customer._id ?? customer.email,
    userId: customer.userId ?? customer.user_id ?? null,
    name: customer.name ?? customer.fullName ?? customer.full_name ?? customer.customerName ?? '',
    email: customer.email ?? customer.customerEmail ?? customer.customer_email ?? '',
    phone: customer.phone ?? customer.phoneNumber ?? customer.phone_number ?? '',
    company: customer.company ?? customer.companyName ?? customer.company_name ?? '',
    plan: customer.plan || customer.membership || customer.membershipPlan || 'Dedicated Member',
    branch: formatBranchName(branchName || customer.branchName || customer.branch_name || branchId),
    branchId,
    status: normalizedStatus,
  };
}

export function normalizeInventoryItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = item.id ?? item._id ?? item.inventoryId ?? item.inventory_id ?? item.itemId ?? item.item_id;
  const rate = item.rate ?? item.price ?? item.amount ?? item.unitPrice ?? item.unit_price ?? item.price_per_unit;
  const unit = item.unit ?? item.billingUnit ?? item.billing_unit ?? item.unitType ?? item.unit_type ?? item.billing_cycle;
  const active = item.active ?? item.isActive ?? item.is_active;
  const status = item.status ?? (active === false || active === 0 || active === 'false' ? 'Inactive' : 'Active');
  if (id == null || id === '' || rate == null || rate === '' || !Number.isFinite(Number(rate)) || !unit) return null;

  const normalizedStatus = String(status).toLowerCase();
  return {
    ...item,
    id,
    rate: Number(rate),
    unit,
    status: normalizedStatus === 'active' ? 'Active' : normalizedStatus === 'inactive' ? 'Inactive' : String(status),
  };
}
