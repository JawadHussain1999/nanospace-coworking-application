import { api, getApiCollection, getApiPayload, normalizeApiCustomer, normalizeApiUser } from './api';

const listRequests = {
  '/agreements': (params) => api.agreements.list(params),
  '/attendance': (params) => api.attendance.list(params),
  '/bookings': (params) => api.bookings.list(params),
  '/branches': (params) => api.branches.list(params),
  '/complaints': (params) => api.complaints.list(params),
  '/customers': (params) => api.customers.list(params),
  '/employees': (params) => api.users.list(params),
  '/expenses': (params) => api.expenses.list(params),
  '/finance': (params) => api.invoices.list(params),
  '/leave': (params) => api.leaves.list(params),
  '/payroll': (params) => api.payroll.list(params),
  '/quotations': (params) => api.quotations.list(params),
  '/reminders': (params) => api.payments.list(params),
  '/reports': (params) => Promise.all([
    ['Revenue', api.reports.revenue],
    ['Bookings', api.reports.bookings],
    ['Expenses', api.reports.expenses],
    ['Occupancy', api.reports.occupancy],
    ['Customers', api.reports.customers],
    ['Employees', api.reports.employees],
    ['Payroll', api.reports.payroll],
  ].map(async ([report, request]) => ({ report, response: await request(params) }))),
  '/settings': (params) => api.users.list(params),
  '/workspace': (params) => api.workspaces.list(params),
  '/analytics': (params) => api.dashboard.summary(params),
  '/audit-logs': (params) => api.auditLogs.list(params),
};

const createRequests = {
  '/agreements': api.agreements.create,
  '/bookings': api.bookings.create,
  '/branches': api.branches.create,
  '/complaints': api.complaints.create,
  '/customers': api.customers.create,
  '/expenses': api.expenses.create,
  '/employees': api.users.create,
  '/finance': api.invoices.create,
  '/leave': api.leaves.create,
  '/payroll': api.payroll.create,
  '/reminders': api.payments.create,
  '/workspace': api.workspaces.create,
};

const updateRequests = {
  '/agreements': (id, body) => Object.keys(body).length === 1 && 'status' in body
    ? api.agreements.updateStatus(id, body.status)
    : api.agreements.update(id, body),
  '/bookings': (id, body) => api.bookings.updateStatus(id, body.status),
  '/branches': (id, body) => api.branches.update(id, body),
  '/complaints': (id, body) => api.complaints.updateStatus(id, body.status),
  '/customers': (id, body) => api.customers.update(id, body),
  '/employees': (id, body) => Object.keys(body).length === 1 && 'status' in body
    ? api.users.updateStatus(id, body.status)
    : api.users.update(id, body),
  '/expenses': (id, body) => api.expenses.update(id, body),
  '/finance': (id, body) => api.invoices.update(id, body),
  '/leave': (id, body) => Object.keys(body).length === 1 && 'status' in body
    ? api.leaves.updateStatus(id, body.status)
    : api.leaves.update(id, body),
  '/payroll': (id, body) => api.payroll.update(id, body),
  '/quotations': (id, body) => api.quotations.updateStatus(id, body.status),
  '/settings': (id, body) => Object.keys(body).length === 1 && 'status' in body
    ? api.users.updateStatus(id, body.status)
    : api.users.update(id, body),
  '/workspace': (id, body) => api.workspaces.update(id, body),
};

import { readDemoJson, writeDemoJson } from './demoStorage';

export async function getApiRecords(path, params, fallbackRows = []) {
  const request = listRequests[path];
  if (!request) {
    return [];
  }
  try {
    const response = await request(params);
    if (path === '/reports') return normalizeReportResponses(response);
    if (path === '/analytics') return normalizeAnalytics(response);
    return getApiCollection(response).map((record, index) => normalizeRecord(path, record, index));
  } catch (error) {
    console.error(`[NanoSpace API] Error loading records for ${path}:`, error.message);
    throw error;
  }
}

export async function getApiRecordDetail(path, id) {
  const request = {
    '/agreements': api.agreements.detail,
    '/attendance': api.attendance.detail,
    '/bookings': api.bookings.detail,
    '/customers': api.customers.detail,
    '/expenses': api.expenses.detail,
    '/finance': api.invoices.detail,
    '/leave': api.leaves.detail,
    '/payroll': api.payroll.detail,
    '/reminders': api.payments.detail,
    '/audit-logs': api.auditLogs.detail,
  }[path];
  if (!request) return null;
  try {
    return normalizeRecord(path, getApiPayload(await request(id)));
  } catch (error) {
    console.error(`[NanoSpace API] Error loading detail for ${path}/${id}:`, error.message);
    return null;
  }
}

export async function createApiRecord(path, record) {
  const request = createRequests[path];
  const payload = Object.fromEntries(Object.entries(record).filter(([key]) => key !== '_recordId'));
  if (!request) {
    throw new Error(`Creating records is not supported for ${path}.`);
  }
  return getApiPayload(await request(payload));
}

export async function updateApiRecord(path, id, record, changedFields) {
  const request = updateRequests[path];
  const payload = changedFields || Object.fromEntries(Object.entries(record).filter(([key]) => !['_recordId', 'id'].includes(key)));
  const keys = Object.keys(payload);
  const statusOnlyPaths = ['/bookings', '/complaints', '/quotations'];
  if (statusOnlyPaths.includes(path) && (keys.length !== 1 || keys[0] !== 'status')) {
    throw new Error(`The supplied API only supports changing the status for ${path}.`);
  }
  if (statusOnlyPaths.includes(path) && !payload.status) {
    throw new Error(`A status value is required to update ${path}.`);
  }
  if (!request) {
    throw new Error(`Updating records is not supported for ${path}.`);
  }
  return getApiPayload(await request(id, payload));
}

export async function removeApiRecord(path, id) {
  if (path === '/bookings') return api.bookings.cancel(id);
  if (path === '/expenses') return api.expenses.remove(id);
  if (path === '/leave') return api.leaves.remove(id);
  if (path === '/workspace') return api.workspaces.remove(id);
  return { success: true };
}

function getFallbackRecords(path, defaults = []) {
  try {
    const saved = readDemoJson(`nanospace-records:${path}`);
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map((r, i) => ({ ...r, _recordId: r._recordId || String(r.id || `${path}-${i}`), _isLocalFallback: true }));
    }
  } catch (_) {}
  return defaults.map((r, i) => ({ ...r, _recordId: String(r.id || `${path}-${i}`), _isLocalFallback: true }));
}

function saveFallbackRecord(path, record) {
  const existing = getFallbackRecords(path, []);
  const newRecord = { ...record, _recordId: record._recordId || `NS-${Date.now()}`, _isLocalFallback: true };
  const updated = [newRecord, ...existing];
  try { writeDemoJson(`nanospace-records:${path}`, updated); } catch (_) {}
  return newRecord;
}

function updateFallbackRecord(path, id, record) {
  const existing = getFallbackRecords(path, []);
  const updated = existing.map((r) => (r.id === id || r._recordId === id ? { ...r, ...record, _isLocalFallback: true } : r));
  try { writeDemoJson(`nanospace-records:${path}`, updated); } catch (_) {}
  return record;
}

function removeFallbackRecord(path, id) {
  const existing = getFallbackRecords(path, []);
  const updated = existing.filter((r) => r.id !== id && r._recordId !== id);
  try { writeDemoJson(`nanospace-records:${path}`, updated); } catch (_) {}
  return { success: true };
}

export function formatShortBookingId(branchName, rawId) {
  if (!rawId) return '';
  const str = String(rawId).trim();
  if (/^[a-z]+[0-9a-f]{6,12}$/i.test(str)) {
    return str.toLowerCase();
  }
  const prefix = String(branchName || 'kphb').toLowerCase().replace(/[^a-z0-9]/g, '') || 'kphb';
  const clean = str.replace(/[^a-f0-9]/gi, '').toLowerCase();
  const shortUuid = (clean.length >= 8 ? clean.slice(0, 8) : (clean || '00000000').padEnd(8, '0')).slice(0, 8);
  return `${prefix}${shortUuid}`;
}

function normalizeRecord(path, record, index = 0) {
  if (!record || typeof record !== 'object') return { value: record, _recordId: `${path}-${index}` };
  const recordId = record.id ?? record._id ?? record.email;
  const branch = record.branch?.name || record.branch || record.branchName || record.branch_name;
  if (path === '/bookings') {
    const rawId = record.raw_id || record.id || record._id;
    const formattedId = formatShortBookingId(branch, record.id || record._id);
    return {
      ...record,
      id: formattedId,
      raw_id: rawId,
      _recordId: String(rawId ?? recordId ?? `${path}-${index}`),
      branch,
      customer: record.customer?.name || record.customer || record.customerName,
      workspace: record.workspace ?? record.itemName,
      amount: record.amount ?? record.total,
    };
  }
  if (path === '/customers') {
    const normalizedCustomer = normalizeApiCustomer(record);
    return { ...normalizedCustomer, _recordId: String(recordId ?? `${path}-${index}`) };
  }
  if (path === '/employees' || path === '/settings') {
    const normalizedUser = normalizeApiUser(record);
    return { ...normalizedUser, _recordId: String(recordId ?? `${path}-${index}`), branch: normalizedUser.branch || branch };
  }
  if (path === '/audit-logs') {
    return {
      ...record,
      id: record.id ?? record._id,
      _recordId: String(recordId ?? `${path}-${index}`),
      createdAt: record.createdAt ?? record.timestamp ?? record.time,
      actor: record.actor ?? record.user?.name ?? record.user ?? record.createdBy,
      action: record.action ?? record.event ?? record.operation,
      entity: record.entity ?? record.resource ?? record.recordType,
      branch,
    };
  }
  if (path === '/branches') {
    return {
      ...record,
      id: record.id ?? record._id,
      _recordId: String(recordId ?? `${path}-${index}`),
      name: record.name || record.branchName || record.branch_name,
      code: record.code || record.branchCode || record.branch_code,
      address: record.address || '',
      floorCount: Number(record.floorCount ?? record.floor_count ?? 1),
    };
  }
  if (path === '/finance' || path === '/reminders' || path === '/expenses' || path === '/payroll') {
    return {
      ...record,
      id: record.id ?? record._id,
      _recordId: String(recordId ?? `${path}-${index}`),
      branch,
      customer: record.customer?.name || record.customer || record.customerName,
      name: record.name || record.employeeName || record.employee?.name || record.user?.name,
      email: record.email || record.customerEmail || record.employee?.email || record.user?.email,
      amount: record.amount ?? record.total,
    };
  }
  return {
    ...record,
    id: record.id ?? record._id,
    _recordId: String(recordId ?? `${path}-${index}`),
    branch,
    customer: record.customer?.name || record.customer || record.customerName,
    name: record.name || record.fullName || record.employeeName || record.employee?.name || record.user?.name,
    email: record.email || record.customerEmail || record.employee?.email || record.user?.email,
  };
}

function normalizeReportResponses(responses) {
  return responses.flatMap(({ report, response }) => {
    const payload = getApiPayload(response);
    const collection = getApiCollectionIfPresent(payload);
    if (collection) {
      return collection.map((record, index) => ({
        ...(record && typeof record === 'object' ? record : { value: record }),
        report,
        _recordId: String(record?.id ?? record?._id ?? `${report}-${index}`),
      }));
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return Object.entries(payload).map(([metric, value]) => ({
        report,
        metric,
        current: value && typeof value === 'object' ? JSON.stringify(value) : value,
        _recordId: `${report}-${metric}`,
      }));
    }
    if (payload == null) return [];
    throw new Error(`${report} report response must be an object or collection.`);
  });
}

function normalizeAnalytics(response) {
  const payload = getApiPayload(response);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Dashboard summary response must be an object.');
  }
  return Object.entries(payload)
    .filter(([, value]) => !Array.isArray(value) && value !== null && typeof value !== 'object')
    .map(([metric, current]) => ({
      metric: metric.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
      current,
      _recordId: metric,
    }));
}

function getApiCollectionIfPresent(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['items', 'results', 'records', 'data', 'rows', 'revenue', 'bookings', 'expenses', 'occupancy', 'customers', 'employees', 'payroll', 'logs', 'auditLogs', 'audit_logs']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return null;
}
