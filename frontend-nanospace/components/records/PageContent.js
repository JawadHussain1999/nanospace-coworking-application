import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Badge, Button, Card, CardBody, Col, Form, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from 'reactstrap';
import { FiPlus, FiDownload, FiFilter, FiSearch, FiFileText, FiCheckCircle, FiClock, FiUsers, FiEdit2, FiTrash2, FiMessageCircle, FiCalendar, FiEye, FiCreditCard } from 'react-icons/fi';
import DataTable, { StatusBadge } from '../shared/DataTable';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import { showSuccess, showError } from '../../utils/toast';
import StatMetricCard from '../shared/StatMetricCard';
import { customers, quotations, recentBookings, BRANCHES } from '../../data/mockData';
import { removeBooking, updateBooking } from '../../store/slices/workspaceSlice';
import { readDemoJson, writeDemoJson } from '../../services/demoStorage';
import { getPaymentReminderUrl } from '../../utils/paymentReminders';
import { api, getApiCollection, getApiErrorMessage, isApiEnabled } from '../../services/api';
import { createApiRecord, getApiRecordDetail, getApiRecords, removeApiRecord, updateApiRecord } from '../../services/apiRecords';
const dataByPath = {
  '/quotations': { title: 'Quotations', desc: 'Create, share and track workspace proposals.', action: 'Create quotation', cols: [{key:'id',label:'Quote ID'},{key:'customer',label:'Customer'},{key:'branch',label:'Branch'},{key:'date',label:'Created date'},{key:'amount',label:'Amount'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/bookings': { title: 'Bookings', desc: 'Manage online and walk-in workspace bookings.', action: 'New booking', cols: [{key:'id',label:'Booking ID'},{key:'customer',label:'Customer'},{key:'branch',label:'Branch'},{key:'workspace',label:'Workspace'},{key:'date',label:'Date'},{key:'amount',label:'Amount'},{key:'advance_amount',label:'Advance',render:(v)=>v === undefined || v === null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN')}`},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/customers': { title: 'Customers', desc: 'Customer profiles, memberships and KYC status.', action: 'Add customer', cols: [{key:'name',label:'Customer'},{key:'email',label:'Email'},{key:'branch',label:'Branch'},{key:'plan',label:'Membership'},{key:'advance_amount',label:'Advance paid',render:(v)=>v === undefined || v === null || v === '' ? '₹0' : `₹${Number(v).toLocaleString('en-IN')}`},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/agreements': { title: 'Agreements', desc: 'Track agreements, renewals and signature status.', action: 'Create agreement', cols: [{key:'id',label:'Agreement ID'},{key:'customer',label:'Customer'},{key:'branch',label:'Branch'},{key:'date',label:'Start date'},{key:'amount',label:'Contract value'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/finance': { title: 'Revenue & Invoices', desc: 'Monitor collections, invoices and outstanding balances.', action: 'Create invoice', cols: [{key:'id',label:'Invoice'},{key:'customer',label:'Customer'},{key:'branch',label:'Branch'},{key:'issued_at',label:'Issued at',render:(v,row)=>v ? new Date(v).toLocaleString('en-IN') : row.date || '—'},{key:'amount',label:'Amount'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/reminders': { title: 'Payments', desc: 'Review booking payments, confirm funds received, and follow up on balances.', action: 'Record payment', cols: [{key:'payment_number',label:'Payment ID'},{key:'customer',label:'Customer'},{key:'payment_method',label:'Method',render:(v)=>({ CASH: 'Cash at counter', ONLINE: 'Online / UPI', RAZORPAY: 'Online (Razorpay)' }[String(v || '').toUpperCase()] || v || '—')},{key:'branch',label:'Branch'},{key:'booking_id',label:'Booking',render:(v)=>v ? String(v).slice(0, 8).toUpperCase() : '—'},{key:'due',label:'Due date'},{key:'amount',label:'Amount'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/expenses': { title: 'Expenses', desc: 'Review branch operating costs and expense claims.', action: 'Add expense', cols: [{key:'id',label:'Expense ID'},{key:'category',label:'Category'},{key:'branch',label:'Branch'},{key:'date',label:'Date'},{key:'amount',label:'Amount'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/complaints': { title: 'Complaints & Support', desc: 'Track customer issues and resolution progress.', action: 'Raise complaint', cols: [{key:'id',label:'Ticket'},{key:'customer',label:'Customer'},{key:'branch',label:'Branch'},{key:'issue',label:'Issue'},{key:'date',label:'Created'},{key:'priority',label:'Priority'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/branches': { title: 'Branches', desc: 'Manage branch locations and their floor counts.', action: 'Add branch', cols: [{key:'name',label:'Branch'},{key:'code',label:'Branch code'},{key:'address',label:'Address'},{key:'floorCount',label:'Number of floors (including Ground Floor)'}], rows: [] },
  '/workspace': { title: 'Floor Studio', desc: 'Create and manage floor layouts for every branch and floor.', action: null, cols: [], rows: [] },
  '/employees': { title: 'Employees', desc: 'Manage team members and branch assignments.', action: 'Add employee', cols: [{key:'name',label:'Employee'},{key:'email',label:'Email'},{key:'branch',label:'Branch'},{key:'role',label:'Role'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/attendance': { title: 'Attendance', desc: 'Review attendance and working hours.', action: 'Export attendance', cols: [{key:'name',label:'Employee'},{key:'branch',label:'Branch'},{key:'date',label:'Date'},{key:'checkin',label:'Check in'},{key:'checkout',label:'Check out'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/leave': { title: 'Leave Management', desc: 'Review leave requests and balances.', action: 'Apply for leave', cols: [{key:'name',label:'Employee'},{key:'branch',label:'Branch'},{key:'type',label:'Leave type'},{key:'dates',label:'Dates'},{key:'days',label:'Days'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/payroll': { title: 'Payroll', desc: 'View salary statements and payroll processing.', action: 'Add payroll entry', cols: [{key:'name',label:'Employee'},{key:'branch',label:'Branch'},{key:'period',label:'Pay period'},{key:'amount',label:'Net salary'},{key:'date',label:'Pay date'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/reports': { title: 'Reports & Analytics', desc: 'Review revenue, bookings, expenses, occupancy, customers, employees and payroll reports.', action: 'Export report', cols: [{key:'report',label:'Report'},{key:'metric',label:'Metric'},{key:'current',label:'Current value'},{key:'branch',label:'Branch'},{key:'period',label:'Period'}], rows: [] },
  '/settings': { title: 'Users & Roles', desc: 'Manage user access and branch assignments.', action: 'Invite user', cols: [{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'role',label:'Role'},{key:'branch',label:'Branch'},{key:'status',label:'Status',render:(v)=><StatusBadge status={v}/> }], rows: [] },
  '/analytics': { title: 'Analytics', desc: 'Business trends and branch performance at a glance.', action: 'Export analytics', cols: [{key:'metric',label:'Metric'},{key:'current',label:'Current month'},{key:'previous',label:'Previous month'},{key:'change',label:'Change'}], rows: [] },
  '/audit-logs': { title: 'Audit Logs', desc: 'Review recorded account and operational changes.', action: 'Export audit logs', cols: [{key:'createdAt',label:'Time'},{key:'actor',label:'User'},{key:'action',label:'Action'},{key:'entity',label:'Record'},{key:'branch',label:'Branch'}], rows: [] },
  '/book-workspace': { title: 'Book a Workspace', desc: 'Choose a branch and workspace type to request a booking.', action: 'Request booking', cols: [{key:'name',label:'Workspace'},{key:'branch',label:'Branch'},{key:'type',label:'Type'},{key:'price',label:'Starting price'},{key:'status',label:'Availability',render:(v)=><StatusBadge status={v}/> }], rows: [] }
};
export default function PageContent({ path, user }) {
 const router = useRouter();
 const dispatch = useDispatch();
 const workspace = useSelector((state) => state.workspace);
 const isSuperAdmin = String(user?.role || '').toLowerCase() === 'super_admin';
 const isAllBranches = (b) => !b || String(b).trim().toLowerCase() === 'all branches';
 const config = dataByPath[path] || dataByPath['/customers'];
 const [query, setQuery] = useState('');
 const [customerTab, setCustomerTab] = useState('active');
 const [branch, setBranch] = useState(() => isSuperAdmin ? 'All branches' : (user?.branch || 'All branches'));
 const [initialRecords] = useState(() => isApiEnabled ? { rows: [], notice: null } : readRecords(path, config.rows));
 const [rows, setRows] = useState(initialRecords.rows);

 const customerCounts = useMemo(() => {
   if (path !== '/customers') return { active: 0, inactive: 0, total: 0 };
   let active = 0;
   let inactive = 0;
   rows.forEach((row) => {
     const isAll = isAllBranches(branch);
     const rowBranchStr = String(row.branch || '').trim().toLowerCase();
     const matchesBranch = isSuperAdmin
       ? (isAll || rowBranchStr === String(branch).trim().toLowerCase())
       : (!user?.branch || isAllBranches(user.branch) || rowBranchStr === String(user.branch).trim().toLowerCase());
     if (matchesBranch) {
       if (String(row.status || '').trim().toLowerCase() === 'active') {
         active += 1;
       } else {
         inactive += 1;
       }
     }
   });
   return { active, inactive, total: active + inactive };
 }, [branch, isSuperAdmin, path, rows, user?.branch]);
 const [loading, setLoading] = useState(isApiEnabled);
 const [saving, setSaving] = useState(false);
 const [modalOpen, setModalOpen] = useState(false);
 const [detailOpen, setDetailOpen] = useState(false);
 const [detailRecord, setDetailRecord] = useState(null);
 const [customerDocuments, setCustomerDocuments] = useState([]);
 const [customerDocumentsCustomer, setCustomerDocumentsCustomer] = useState(null);
 const [customerDocumentsOpen, setCustomerDocumentsOpen] = useState(false);
 const [customerDocumentsLoading, setCustomerDocumentsLoading] = useState(false);
 const [customerDocumentsError, setCustomerDocumentsError] = useState('');
 const [downloadingDocumentId, setDownloadingDocumentId] = useState(null);
 const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);
 const [settlingPaymentId, setSettlingPaymentId] = useState(null);
 const [calendarDate, setCalendarDate] = useState(new Date().toISOString().slice(0, 10));
 const [calendarRows, setCalendarRows] = useState([]);
 const [calendarOpen, setCalendarOpen] = useState(false);
 const [calendarLoading, setCalendarLoading] = useState(false);
 const [editingId, setEditingId] = useState(null);
 const [recordToDelete, setRecordToDelete] = useState(null);
 const [form, setForm] = useState({});
 const [formErrors, setFormErrors] = useState({});
 const [branchPaymentOpen, setBranchPaymentOpen] = useState(false);
 const [branchPaymentBranch, setBranchPaymentBranch] = useState(null);
 const [branchPaymentForm, setBranchPaymentForm] = useState({ keyId: '', keySecret: '' });
 const [branchPaymentConfigured, setBranchPaymentConfigured] = useState(false);
 const [branchPaymentLoading, setBranchPaymentLoading] = useState(false);
 const [branchPaymentSaving, setBranchPaymentSaving] = useState(false);
 const [branchPaymentError, setBranchPaymentError] = useState('');
 const [notice, setNotice] = useState(initialRecords.notice);
 const isManager = ['super_admin', 'branch_admin', 'reception_admin'].includes(user.role);
 const canCreate = (isManager && !['/reports', '/analytics', '/audit-logs'].includes(path)) || (user.role === 'customer' && ['/complaints', '/book-workspace'].includes(path)) || (user.role === 'employee' && path === '/leave');
 const canEdit = (isManager && !['/reports', '/analytics', '/audit-logs'].includes(path)) || (user.role === 'customer' && ['/complaints', '/bookings'].includes(path)) || (user.role === 'employee' && path === '/leave');
 const canDelete = isManager;

 useEffect(() => {
   if (isApiEnabled) return;
   try {
     writeDemoJson(`nanospace-records:${path}`, rows);
   } catch (error) {
     console.error(`Could not save records for ${path}:`, error);
   }
 }, [path, rows]);

 const refreshApiRecords = async () => {
   const isAll = isAllBranches(branch);
   const params = isSuperAdmin
     ? (!isAll ? { branch } : undefined)
     : (user?.branch && !isAllBranches(user.branch) ? { branch: user.branch } : undefined);
   const records = await getApiRecords(path, params, []);
   setRows(records);
 };

 useEffect(() => {
   if (!isApiEnabled) return undefined;
   let active = true;
   const isAll = isAllBranches(branch);
   const params = isSuperAdmin
     ? (!isAll ? { branch } : undefined)
     : (user?.branch && !isAllBranches(user.branch) ? { branch: user.branch } : undefined);
   Promise.resolve()
     .then(() => {
       if (!active) return undefined;
       setLoading(true);
       setRows([]);
       setNotice(null);
       return getApiRecords(path, params, []);
     })
     .then((records) => {
       if (active) {
         setRows(records);
       }
     })
     .catch((error) => {
       console.error(`Could not load ${path} from API:`, error);
       if (active) setNotice({ color: 'danger', text: getApiErrorMessage(error, `${config.title} could not be loaded.`) });
     })
     .finally(() => { if (active) setLoading(false); });
   return () => { active = false; };
 }, [branch, config.rows, config.title, isSuperAdmin, path, user?.branch, user?.role]);

 const workspaceRows = useMemo(() => {
   if (isApiEnabled) return [];
   if (path === '/bookings') return workspace.bookings
     .filter((booking) => user.role === 'super_admin' || booking.branch === user.branch)
     .map((booking) => ({
     _recordId: booking.id,
     id: booking.id,
     customer: booking.customerName,
     branch: booking.branch,
     workspace: booking.itemName,
     date: booking.date,
     amount: `₹${Number(booking.total).toLocaleString('en-IN')}`,
     status: booking.status,
   }));
   if (path === '/quotations' && user.role === 'customer') return workspace.quotations
     .filter((quotation) => quotation.customer === user.name)
     .map((quotation) => ({
       _recordId: quotation.id,
       id: quotation.id,
       customer: quotation.customer,
       branch: quotation.branch,
       date: quotation.date,
       amount: `₹${Number(quotation.amount).toLocaleString('en-IN')}`,
       status: quotation.status,
     }));
   return [];
 }, [path, user.branch, user.name, user.role, workspace.bookings, workspace.quotations]);

 const visibleRows = useMemo(() => [...workspaceRows, ...rows].filter((row) => {
   const matchesSearch = !query || Object.values(row).some((value) => String(value).toLowerCase().includes(query.toLowerCase()));
   const isAll = isAllBranches(branch);
   const rowBranchStr = String(row.branch || '').trim().toLowerCase();
   const matchesBranch = isSuperAdmin
     ? (isAll || rowBranchStr === String(branch).trim().toLowerCase())
     : (!user?.branch || isAllBranches(user.branch) || rowBranchStr === String(user.branch).trim().toLowerCase());
   const matchesScope = path === '/book-workspace' || (user?.role === 'customer'
     ? (!row.customer && !row.name) || row.customer === user?.name || row.name === user?.name
     : user?.role === 'employee'
       ? !row.name || row.name === user?.name
       : true);
   const matchesCustomerTab = path !== '/customers' || (
     customerTab === 'active'
       ? String(row.status || '').trim().toLowerCase() === 'active'
       : String(row.status || '').trim().toLowerCase() !== 'active'
   );
   return matchesSearch && matchesBranch && matchesScope && matchesCustomerTab;
 }), [branch, customerTab, isSuperAdmin, path, query, rows, user?.branch, user?.name, user?.role, workspaceRows]);

 const makeEmptyForm = () => {
   if (path === '/customers') {
     const customerForm = Object.fromEntries(config.cols.map(({ key }) => {
       if (key === 'branch') return [key, user.branch || BRANCHES[0]];
       if (key === 'status') return [key, customerTab === 'inactive' ? 'Inactive' : 'Active'];
       return [key, ''];
     }));
     return { ...customerForm, phone: '', companyName: '', gstin: '', panNumber: '' };
   }
   return Object.fromEntries(config.cols.map(({ key }) => {
     if (key === 'id') return [key, ''];
     if (key === 'floorCount') return [key, 1];
     if (key === 'branch') return [key, user.branch || BRANCHES[0]];
     if (key === 'customer' && user.role === 'customer') return [key, user.name];
     if (key === 'name' && ['customer', 'employee'].includes(user.role)) return [key, user.name];
     if (key === 'email') return [key, user.email];
     if (key === 'date' || key === 'uploaded' || key === 'updated') return [key, new Date().toLocaleDateString('en-IN')];
     if (key === 'status') return [key, path === '/customers' ? (customerTab === 'inactive' ? 'Inactive' : 'Active') : (path === '/leave' || path === '/complaints' ? 'Pending' : 'Active')];
     return [key, ''];
   }));
 };

 const openAdd = () => {
   setEditingId(null);
   setFormErrors({});
   setForm(makeEmptyForm());
   setModalOpen(true);
 };

 const openEdit = (row) => {
   setEditingId(row._recordId);
   setFormErrors({});
   setForm({ ...row });
   setModalOpen(true);
 };

 const saveRecord = async (event) => {
   event.preventDefault();
   const errors = {};
   const record = { ...form };
   config.cols.filter((col) => col.key !== 'id').forEach((col) => {
     const rawVal = record[col.key];
     const val = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
     if (['name', 'customer', 'issue', 'category'].includes(col.key) && (!val || val === '')) {
       errors[col.key] = `${col.label} is required.`;
     }
     if (path === '/branches' && col.key === 'code' && !val) {
       errors[col.key] = 'Branch code is required.';
     }
     if (path === '/branches' && col.key === 'floorCount' &&
       (!Number.isInteger(Number(val)) || Number(val) < 1)) {
       errors[col.key] = 'Enter a whole number of floors greater than zero.';
     }
     if (col.key === 'email') {
       if (!val) errors[col.key] = 'Email is required.';
       else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) errors[col.key] = 'Enter a valid email address.';
     }
     if (col.key === 'amount' && val) {
       const num = Number(String(val).replace(/[^\d.]/g, ''));
       if (!Number.isFinite(num) || num < 0) {
         errors[col.key] = 'Amount must be a valid positive number.';
       }
     }
   });
   if (path === '/customers' && !editingId) {
     if (!String(record.phone || '').trim()) errors.phone = 'Phone number is required.';
     if (record.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(String(record.gstin).trim())) {
       errors.gstin = 'Enter a valid 15-character GSTIN, or leave it blank.';
     }
     if (record.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(record.panNumber).trim())) {
       errors.panNumber = 'Enter a valid 10-character PAN, or leave it blank.';
     }
   }
   if (Object.keys(errors).length > 0) {
     setFormErrors(errors);
     return;
   }
   setFormErrors({});
   if (path === '/branches') {
     record.floorCount = Number(record.floorCount);
     record.code = String(record.code || '').trim().toUpperCase();
   }

   const idColumn = config.cols.find((column) => column.key === 'id');
   if (idColumn && !record.id && !isApiEnabled) record.id = `NS-${Date.now()}`;
   record._recordId = editingId || String(record.id || `${path}-${Date.now()}`);
   if (isApiEnabled) {
     setSaving(true);
     try {
       if (editingId) {
         const original = rows.find((row) => row._recordId === editingId) || {};
         const changes = Object.fromEntries(Object.entries(record).filter(([key, value]) =>
           key !== '_recordId' && JSON.stringify(value) !== JSON.stringify(original[key])
         ));
         if (!Object.keys(changes).length) {
           setModalOpen(false);
           setSaving(false);
           return;
         }
         await updateApiRecord(path, editingId, record, changes);
       }
       else await createApiRecord(path, record);
       await refreshApiRecords();
       const createdLogin = !editingId && user.role === 'super_admin' && ['/customers', '/employees'].includes(path);
       const successMessage = editingId
         ? 'Record updated successfully.'
         : createdLogin
           ? `Record added. Login: ${record.email}; default password: nanospace123.`
           : 'Record added successfully.';
       setNotice({ color: 'success', text: successMessage });
       showSuccess(successMessage);
       setModalOpen(false);
     } catch (error) {
       console.error(`Could not save ${path} record:`, error);
       const _errMsg = getApiErrorMessage(error, 'Record could not be saved.'); setNotice({ color: 'danger', text: _errMsg }); showError(_errMsg);
     } finally {
       setSaving(false);
     }
     return;
   }
   if (path === '/bookings' && workspace.bookings.some((booking) => booking.id === editingId)) {
     dispatch(updateBooking({
       id: editingId,
       updates: {
         customerName: record.customer,
         branch: record.branch,
         itemName: record.workspace,
         date: record.date,
         total: Number(String(record.amount).replace(/[^\d.]/g, '')) || 0,
         status: record.status,
       },
     }));
   } else {
     setRows((current) => editingId
       ? current.map((row) => row._recordId === editingId ? record : row)
       : [record, ...current]);
   }
   setNotice({ color: 'success', text: editingId ? 'Record updated.' : 'Record added.' });
   setModalOpen(false);
 };

 const promptDelete = (record) => {
    setRecordToDelete(record);
  };

  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    const record = recordToDelete;
    if (isApiEnabled) {
      setSaving(true);
      try {
        await removeApiRecord(path, record._recordId);
        await refreshApiRecords();
        setNotice({ color: 'success', text: 'Record deleted.' }); showSuccess('Record deleted successfully.');
        setRecordToDelete(null);
      } catch (error) {
        console.error(`Could not delete ${path} record:`, error);
        const _delErr = getApiErrorMessage(error, 'Record could not be deleted.'); setNotice({ color: 'danger', text: _delErr }); showError(_delErr);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (path === '/bookings' && workspace.bookings.some((booking) => booking.id === record._recordId)) {
      dispatch(removeBooking(record._recordId));
    } else {
      setRows((current) => current.filter((row) => row._recordId !== record._recordId));
    }
    setRecordToDelete(null);
    setNotice({ color: 'success', text: 'Record deleted.' });
  };

 const loadBookingCalendar = async () => {
   setCalendarLoading(true);
   setNotice(null);
   try {
     const params = {
       date: calendarDate,
       ...(user.role === 'super_admin' && branch !== 'All branches' ? { branch } : {}),
       ...(user.role !== 'super_admin' && user.branch ? { branch: user.branch } : {}),
     };
     const records = getApiCollection(await api.bookings.calendar(params));
     setCalendarRows(records.map((booking, index) => ({
       ...booking,
       id: booking.id || booking._id,
       customer: booking.customer?.name || booking.customer || booking.customerName,
       branch: booking.branch?.name || booking.branch || booking.branchName,
       workspace: booking.workspace?.name || booking.workspace || booking.itemName,
       date: booking.date || booking.startDate || calendarDate,
       amount: booking.amount ?? booking.total,
       _recordId: String(booking.id || booking._id || `calendar-${index}`),
     })));
     setCalendarOpen(true);
   } catch (error) {
     console.error('Could not load booking calendar:', error);
     setNotice({ color: 'danger', text: getApiErrorMessage(error, 'Booking calendar could not be loaded.') });
   } finally {
     setCalendarLoading(false);
   }
 };

 const exportCsv = () => {
   const headers = config.cols.map((column) => column.label);
   const csvRows = visibleRows.map((row) => config.cols.map((column) =>
     `"${String(row[column.key] ?? '').replace(/"/g, '""')}"`
   ).join(','));
   const csv = [headers.map((header) => `"${header.replace(/"/g, '""')}"`).join(','), ...csvRows].join('\r\n');
   const link = document.createElement('a');
   link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
   link.download = `${path.slice(1)}.csv`;
   link.click();
   window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
 };

 const downloadInvoicePdf = async (invoice) => {
   const invoiceId = invoice._id || invoice._recordId || invoice.id;
   setDownloadingInvoiceId(invoiceId);
   try {
     const blob = await api.invoices.pdf(invoiceId, { responseType: 'blob' });
     const url = URL.createObjectURL(blob);
     const link = window.document.createElement('a');
     link.href = url;
     link.download = `${invoice.id || 'invoice'}.pdf`;
     link.click();
     window.setTimeout(() => URL.revokeObjectURL(url), 1000);
   } catch (error) {
     console.error('Could not download invoice:', error);
     showError(getApiErrorMessage(error, 'Invoice could not be downloaded.'));
   } finally {
     setDownloadingInvoiceId(null);
   }
 };

 const confirmPaymentReceived = async (payment) => {
   const paymentId = payment._recordId || payment.id;
   setSettlingPaymentId(paymentId);
   try {
     await api.payments.confirmReceived(paymentId);
     await refreshApiRecords();
     showSuccess(`Payment ${payment.payment_number || ''} marked as received.`);
   } catch (error) {
     console.error('Could not confirm booking payment receipt:', error);
     showError(getApiErrorMessage(error, 'Payment receipt could not be confirmed.'));
   } finally {
     setSettlingPaymentId(null);
   }
 };

 const paymentActions = path === '/reminders' && isManager && isApiEnabled ? [{
   key: '_confirmReceived',
   label: 'Receipt',
   render: (_, row) => {
     if (!row.booking_id || String(row.status).toUpperCase() !== 'PENDING') {
       return <span className="text-secondary small">{row.payment_date ? 'Received' : '—'}</span>;
     }
     return (
       <Button
         color="success"
         size="sm"
         disabled={settlingPaymentId === (row._recordId || row.id)}
         onClick={() => confirmPaymentReceived(row)}
         aria-label={`Confirm payment received for ${row.payment_number || row.customer}`}
       >
         {settlingPaymentId === (row._recordId || row.id)
           ? <Spinner size="sm" />
           : <><FiCheckCircle className="me-1" />Confirm received</>}
       </Button>
     );
   },
 }, {
   key: '_whatsapp',
   label: 'WhatsApp',
   render: (_, row) => {
     const href = getPaymentReminderUrl(row);
     if (['COMPLETED', 'PAID', 'CANCELLED'].includes(String(row.status || '').toUpperCase())) {
       return <span className="text-secondary small">No payment due</span>;
     }
     return href
       ? <Button tag="a" href={href} target="_blank" rel="noopener noreferrer" color="success" size="sm" aria-label={`Send WhatsApp payment reminder to ${row.customer}`}><FiMessageCircle className="me-1" />Send</Button>
       : <Button color="light" size="sm" disabled title="Add a valid WhatsApp number to send a reminder"><FiMessageCircle className="me-1" />Unavailable</Button>;
   },
 }] : [];
 const toggleCustomerStatus = async (customerRecord) => {
   if (!isManager) return;
   const isCurrentlyActive = String(customerRecord.status || '').trim().toLowerCase() === 'active';
   const newStatus = isCurrentlyActive ? 'Inactive' : 'Active';
   const targetId = customerRecord._recordId;

   try {
     if (isApiEnabled) {
       setSaving(true);
       await updateApiRecord('/customers', targetId, customerRecord, { status: newStatus });
       await refreshApiRecords();
       showSuccess(`Customer marked as ${newStatus}.`);
     } else {
       setRows((current) => current.map((row) =>
         row._recordId === targetId ? { ...row, status: newStatus } : row
       ));
       showSuccess(`Customer marked as ${newStatus}.`);
     }
   } catch (error) {
     console.error('Could not toggle customer status:', error);
     showError(getApiErrorMessage(error, `Could not mark customer as ${newStatus}.`));
   } finally {
     setSaving(false);
   }
 };

 const openCustomerDocuments = async (customer) => {
   setCustomerDocuments([]);
   setCustomerDocumentsCustomer(customer);
   setCustomerDocumentsError('');
   setCustomerDocumentsOpen(true);
   setCustomerDocumentsLoading(true);
   try {
     const response = await api.documents.customer(customer._recordId || customer.id);
     setCustomerDocuments(getApiCollection(response).map((document) => ({
       ...document,
       id: document.id || document._id,
       fileName: document.fileName || document.file_name || document.name || 'Document',
       documentType: document.documentType || document.document_type || 'Other',
       size: Number(document.size ?? document.file_size ?? 0),
       uploadedAt: document.uploadedAt || document.created_at || document.createdAt,
       status: document.status || 'Pending',
     })));
   } catch (error) {
     console.error('Could not load customer documents:', error);
     setCustomerDocumentsError(getApiErrorMessage(error, 'Customer documents could not be loaded.'));
   } finally {
     setCustomerDocumentsLoading(false);
   }
 };

 const downloadCustomerDocument = async (document) => {
   setDownloadingDocumentId(document.id);
   setCustomerDocumentsError('');
   try {
     const blob = await api.documents.download(document.id);
     const url = URL.createObjectURL(blob);
     const link = window.document.createElement('a');
     link.href = url;
     link.download = document.fileName;
     link.click();
     window.setTimeout(() => URL.revokeObjectURL(url), 1000);
   } catch (error) {
     console.error('Could not download customer document:', error);
     setCustomerDocumentsError(getApiErrorMessage(error, 'Document could not be downloaded.'));
   } finally {
     setDownloadingDocumentId(null);
   }
 };

 const openBranchPaymentSettings = async (branchRecord) => {
   setBranchPaymentBranch(branchRecord);
   setBranchPaymentForm({ keyId: '', keySecret: '' });
   setBranchPaymentConfigured(false);
   setBranchPaymentError('');
   setBranchPaymentLoading(true);
   setBranchPaymentOpen(true);
   try {
     const response = await api.branches.paymentAccount(branchRecord._recordId || branchRecord.id);
     const account = response?.data?.data || response?.data || {};
     setBranchPaymentForm({ keyId: account.keyId || account.razorpay_key_id || '', keySecret: '' });
     setBranchPaymentConfigured(Boolean(account.configured));
   } catch (error) {
     console.error('Could not load branch payment settings:', error);
     setBranchPaymentError(getApiErrorMessage(error, 'Branch payment settings could not be loaded.'));
   } finally {
     setBranchPaymentLoading(false);
   }
 };

 const saveBranchPaymentSettings = async (event) => {
   event.preventDefault();
   setBranchPaymentError('');
   if (!branchPaymentForm.keyId.trim()) {
     setBranchPaymentError('Razorpay Key ID is required.');
     return;
   }
   if (!branchPaymentConfigured && !branchPaymentForm.keySecret.trim()) {
     setBranchPaymentError('Razorpay Key Secret is required for initial setup.');
     return;
   }
   setBranchPaymentSaving(true);
   try {
     await api.branches.updatePaymentAccount(branchPaymentBranch._recordId || branchPaymentBranch.id, branchPaymentForm);
     setBranchPaymentConfigured(true);
     setBranchPaymentForm((current) => ({ ...current, keySecret: '' }));
     showSuccess(`Razorpay payments configured for ${branchPaymentBranch.name}.`);
     setBranchPaymentOpen(false);
   } catch (error) {
     console.error('Could not save branch payment settings:', error);
     setBranchPaymentError(getApiErrorMessage(error, 'Razorpay settings could not be saved.'));
   } finally {
     setBranchPaymentSaving(false);
   }
 };

 const columns = [...config.cols, ...(path === '/finance' && isApiEnabled ? [{
   key: '_invoiceDownload',
   label: 'Invoice file',
   render: (_, row) => {
     const invoiceId = row._id || row._recordId || row.id;
     return (
       <Button
         color="light"
         size="sm"
         disabled={downloadingInvoiceId === invoiceId}
         onClick={() => downloadInvoicePdf(row)}
         aria-label={`Download invoice ${row.id}`}
       >
         {downloadingInvoiceId === invoiceId
           ? <Spinner size="sm" />
           : <><FiDownload className="me-1" /> PDF</>}
       </Button>
     );
   },
 }] : []), ...paymentActions, ...(path === '/branches' && user.role === 'super_admin' && isApiEnabled ? [{
   key: '_payments',
   label: 'Payments',
   render: (_, row) => (
     <Button color="light" size="sm" onClick={() => openBranchPaymentSettings(row)}>
       <FiCreditCard className="me-1" /> Configure Razorpay
     </Button>
   ),
 }] : []), ...(path === '/customers' && isApiEnabled ? [{
   key: '_documents',
   label: 'Documents',
   render: (_, row) => (
     <Button
       color="light"
       size="sm"
       onClick={() => openCustomerDocuments(row)}
       aria-label={`View documents for ${row.name || row.customer || row.email}`}
     >
       <FiEye className="me-1" /> View documents
     </Button>
   ),
 }] : []), ...(canEdit ? [{
   key: '_actions',
   label: 'Actions',
   render: (_, row) => <div className="d-flex align-items-center gap-2">
     {path === '/customers' && isManager && (
       <Button
         color={String(row.status || '').toLowerCase() === 'active' ? 'outline-warning' : 'outline-success'}
         size="sm"
         className="btn-status-toggle"
         disabled={saving}
         onClick={() => toggleCustomerStatus(row)}
         title={String(row.status || '').toLowerCase() === 'active' ? 'Click to mark customer as Inactive' : 'Click to mark customer as Active'}
       >
         {String(row.status || '').toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}
       </Button>
     )}
     <Button color="light" size="sm" onClick={() => openEdit(row)} aria-label={`Edit ${row[config.cols[0].key]}`}><FiEdit2 /></Button>
     {canDelete && <Button color="light" size="sm" className="text-danger" onClick={() => promptDelete(row)} aria-label={`Delete ${row[config.cols[0].key]}`}><FiTrash2 /></Button>}
   </div>,
 }] : [])];

 const goToBooking = () => router.push('/new-booking');
 const metrics = path === '/customers' ? [
   { icon: FiUsers, label: 'Active Customers', value: customerCounts.active, hint: 'Currently active accounts', tone: 'green' },
   { icon: FiClock, label: 'Inactive Customers', value: customerCounts.inactive, hint: 'Inactive / pending accounts', tone: 'orange' },
   { icon: FiCheckCircle, label: 'Total Customers', value: customerCounts.total, hint: branch === 'All branches' ? 'Organization-wide' : branch, tone: 'blue' },
   { icon: FiFileText, label: customerTab === 'active' ? 'Active in Table' : 'Inactive in Table', value: visibleRows.length, hint: query ? 'Filtered by search' : 'Current tab view', tone: 'purple' },
 ] : [
   { icon: FiFileText, label: 'Total records', value: visibleRows.length, hint: 'In this view', tone: 'blue' },
   { icon: FiCheckCircle, label: 'Active / completed', value: visibleRows.filter((row) => ['Active', 'Confirmed', 'Accepted', 'Completed'].includes(row.status)).length, hint: 'Current records', tone: 'green' },
   { icon: FiClock, label: 'Needs attention', value: visibleRows.filter((row) => ['Pending', 'Overdue', 'Draft'].includes(row.status)).length, hint: 'Follow-up required', tone: 'orange' },
   { icon: FiUsers, label: 'Access scope', value: user.role === 'super_admin' ? 'All branches' : '1 branch', hint: user.branch || 'Organization-wide', tone: 'purple' },
 ];

 return <>
   <div className="page-heading-row">
     <div><div className="eyebrow">NANOSPACE / MANAGEMENT</div><h2>{config.title}</h2><p>{config.desc}</p></div>
     <div className="heading-actions">
       {path === '/bookings' && isApiEnabled && <>
         <Input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} aria-label="Booking calendar date" className="heading-date-input" />
         <Button color="light" className="btn-soft text-nowrap" onClick={loadBookingCalendar} disabled={calendarLoading}><FiCalendar className="me-2" />{calendarLoading ? 'Loading...' : 'Calendar'}</Button>
       </>}
       <Button color="light" className="btn-soft text-nowrap" onClick={exportCsv}><FiDownload className="me-2" />Export CSV</Button>
       {canCreate && <Button color="primary" className="btn-primary-custom text-nowrap" onClick={path === '/bookings' || path === '/book-workspace' ? goToBooking : openAdd}><FiPlus className="me-2" />{config.action}</Button>}
     </div>
   </div>
   {notice && <Alert color={notice.color} toggle={() => setNotice(null)}>{notice.text}</Alert>}
   <Row className="g-3 mb-4">{metrics.map((metric) => <Col sm="6" xl="3" key={metric.label}><StatMetricCard {...metric} /></Col>)}</Row>
   <Card className="panel-card border-0">
     {path === '/customers' && (
       <div className="customer-tabs-bar">
         <div className="customer-nav-tabs" role="tablist" aria-label="Customer status tabs">
           <button
             type="button"
             role="tab"
             aria-selected={customerTab === 'active'}
             className={`customer-tab-pill ${customerTab === 'active' ? 'active' : ''}`}
             onClick={() => setCustomerTab('active')}
           >
             <span className="customer-status-dot dot-active" />
             <span className="customer-tab-text">Active Customers</span>
             <span className={`customer-count-badge ${customerTab === 'active' ? 'badge-active' : ''}`}>
               {customerCounts.active}
             </span>
           </button>
           <button
             type="button"
             role="tab"
             aria-selected={customerTab === 'inactive'}
             className={`customer-tab-pill ${customerTab === 'inactive' ? 'active' : ''}`}
             onClick={() => setCustomerTab('inactive')}
           >
             <span className="customer-status-dot dot-inactive" />
             <span className="customer-tab-text">Inactive Customers</span>
             <span className={`customer-count-badge ${customerTab === 'inactive' ? 'badge-inactive' : ''}`}>
               {customerCounts.inactive}
             </span>
           </button>
         </div>
       </div>
     )}
     <div className="panel-toolbar"><div><h3>{path === '/customers' ? (customerTab === 'active' ? 'Active Customers' : 'Inactive Customers') : `${config.title} list`}</h3><p>{visibleRows.length} {visibleRows.length === 1 ? 'record' : 'records'} available</p></div><div className="table-tools">
       <div className="table-search"><FiSearch size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={path === '/customers' ? `Search ${customerTab} customers...` : 'Search records...'} bsSize="sm" aria-label="Search records" /></div>
       {user.role === 'super_admin' && <div className="filter-select"><FiFilter size={15} /><Input type="select" bsSize="sm" value={branch} onChange={(event) => setBranch(event.target.value)}><option>All branches</option>{BRANCHES.map((item) => <option key={item}>{item}</option>)}</Input></div>}
     </div></div>
     {loading ? (
       <div className="text-center py-4">Loading {config.title.toLowerCase()}...</div>
     ) : (
       <DataTable
         columns={columns}
         rows={visibleRows}
         rowKey="_recordId"
         emptyMessage={
           path === '/customers'
             ? (customerTab === 'active' ? 'No active customers match your search.' : 'No inactive customers match your search.')
             : 'No records match your search.'
         }
         pageSize={10}
       />
     )}
   </Card>
   {path === '/bookings' && calendarOpen && <Card className="panel-card border-0 mt-4">
     <div className="panel-toolbar"><div><h3>Bookings for {calendarDate}</h3><p>{calendarRows.length} calendar records.</p></div><Button color="light" size="sm" onClick={() => setCalendarOpen(false)}>Close</Button></div>
     <DataTable columns={config.cols} rows={calendarRows} rowKey="_recordId" emptyMessage="No bookings returned for this date." pageSize={10} />
   </Card>}

   <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} centered>
     <ModalHeader toggle={() => setModalOpen(false)}>{editingId ? `Edit ${config.title.toLowerCase()} record` : config.action}</ModalHeader>
     <ModalBody><Form onSubmit={saveRecord} noValidate>
       {config.cols.filter((column) => column.key !== 'id').map((column) => {
         const key = column.key;
         const statusOnlyApi = isApiEnabled && ['/bookings', '/complaints', '/quotations'].includes(path);
         const locked = ((key === 'name' || key === 'customer' || key === 'email') && ['customer', 'employee'].includes(user.role)) ||
           (statusOnlyApi && key !== 'status');
         if (key === 'status') {
           const statusOptions = path === '/customers'
             ? ['Active', 'Inactive', 'Pending']
             : ['Pending', 'Active', 'Confirmed', 'Completed', 'Accepted', 'Sent', 'Draft', 'Overdue', 'Cancelled', 'Rejected'];
           return (
             <FormGroup key={key}>
               <Label for={`record-${key}`}>{column.label}</Label>
               <Input
                 id={`record-${key}`}
                 type="select"
                 value={form[key] || (path === '/customers' ? (customerTab === 'inactive' ? 'Inactive' : 'Active') : 'Pending')}
                 disabled={!isManager}
                 onChange={(event) => setForm({ ...form, [key]: event.target.value })}
               >
                 {statusOptions.map((value) => <option key={value}>{value}</option>)}
               </Input>
             </FormGroup>
           );
         }
         if (key === 'floorCount') return <FormGroup key={key}>
           <Label for={`record-${key}`}>{column.label} <span className="text-danger">*</span></Label>
           <Input
             id={`record-${key}`}
             type="number"
             min="1"
             step="1"
             required
             invalid={Boolean(formErrors[key])}
             value={form[key] ?? 1}
             onChange={(event) => {
               setForm({ ...form, [key]: event.target.value });
               if (formErrors[key]) setFormErrors({ ...formErrors, [key]: null });
             }}
           />
           {formErrors[key] && <FormFeedback>{formErrors[key]}</FormFeedback>}
         </FormGroup>;
         if (key === 'role') return <FormGroup key={key}><Label for={`record-${key}`}>{column.label} {user.role === 'super_admin' ? <Badge color="primary" className="ms-1">Editable</Badge> : null}</Label><Input id={`record-${key}`} type="select" value={form[key] || 'employee'} disabled={user.role !== 'super_admin'} onChange={(event) => setForm({ ...form, [key]: event.target.value })}><option value="super_admin">Super Admin</option><option value="branch_admin">Branch Admin</option><option value="reception_admin">Reception Admin</option><option value="employee">Employee</option><option value="customer">Customer</option></Input></FormGroup>;
         if (path === '/branches' && key === 'code') return <FormGroup key={key}>
           <Label for={`record-${key}`}>{column.label} <span className="text-danger">*</span></Label>
           <Input
             id={`record-${key}`}
             required
             maxLength="30"
             invalid={Boolean(formErrors[key])}
             value={form[key] ?? ''}
             onChange={(event) => {
               setForm({ ...form, [key]: event.target.value });
               if (formErrors[key]) setFormErrors({ ...formErrors, [key]: null });
             }}
           />
           {formErrors[key] && <FormFeedback>{formErrors[key]}</FormFeedback>}
         </FormGroup>;
         if (key === 'branch') return <FormGroup key={key}><Label for={`record-${key}`}>{column.label}</Label><Input id={`record-${key}`} type="select" value={form[key] || user.branch || BRANCHES[0]} disabled={user.role !== 'super_admin'} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>{(user.role === 'super_admin' ? ['All branches', ...BRANCHES] : [user.branch || BRANCHES[0]]).map((value) => <option key={value}>{value}</option>)}</Input></FormGroup>;
         return <FormGroup key={key}>
           <Label for={`record-${key}`}>{column.label} {['name', 'customer', 'email'].includes(key) && <span className="text-danger">*</span>}</Label>
           <Input
             id={`record-${key}`}
             type={key === 'email' ? 'email' : 'text'}
             invalid={Boolean(formErrors[key])}
             maxLength="300"
             value={form[key] ?? ''}
             disabled={locked}
             onChange={(event) => {
               setForm({ ...form, [key]: event.target.value });
               if (formErrors[key]) setFormErrors({ ...formErrors, [key]: null });
             }}
           />
           {formErrors[key] && <FormFeedback>{formErrors[key]}</FormFeedback>}
         </FormGroup>;
       })}
       {path === '/customers' && (
         <>
           <FormGroup>
             <Label for="record-phone">Phone number {!editingId && <span className="text-danger">*</span>}</Label>
             <Input
               id="record-phone"
               type="tel"
               maxLength="40"
               required={!editingId}
               invalid={Boolean(formErrors.phone)}
               value={form.phone ?? ''}
               onChange={(event) => {
                 setForm({ ...form, phone: event.target.value });
                 if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
               }}
             />
             {formErrors.phone && <FormFeedback>{formErrors.phone}</FormFeedback>}
           </FormGroup>
           <FormGroup>
             <Label for="record-companyName">Company name <span className="text-muted">(optional)</span></Label>
             <Input id="record-companyName" value={form.companyName ?? ''} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
           </FormGroup>
           <FormGroup>
             <Label for="record-gstin">GSTIN <span className="text-muted">(optional)</span></Label>
             <Input
               id="record-gstin"
               maxLength="15"
               invalid={Boolean(formErrors.gstin)}
               value={form.gstin ?? ''}
               onChange={(event) => {
                 setForm({ ...form, gstin: event.target.value.toUpperCase() });
                 if (formErrors.gstin) setFormErrors({ ...formErrors, gstin: null });
               }}
             />
             {formErrors.gstin && <FormFeedback>{formErrors.gstin}</FormFeedback>}
           </FormGroup>
           <FormGroup>
             <Label for="record-panNumber">PAN number <span className="text-muted">(optional)</span></Label>
             <Input
               id="record-panNumber"
               maxLength="10"
               invalid={Boolean(formErrors.panNumber)}
               value={form.panNumber ?? ''}
               onChange={(event) => {
                 setForm({ ...form, panNumber: event.target.value.toUpperCase() });
                 if (formErrors.panNumber) setFormErrors({ ...formErrors, panNumber: null });
               }}
             />
             {formErrors.panNumber && <FormFeedback>{formErrors.panNumber}</FormFeedback>}
           </FormGroup>
         </>
       )}
       <div className="d-flex justify-content-end gap-2"><Button color="light" type="button" onClick={() => setModalOpen(false)}>Cancel</Button><Button color="primary" className="btn-primary-custom" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save record'}</Button></div>
     </Form></ModalBody>
   </Modal>
   <Modal isOpen={branchPaymentOpen} toggle={() => !branchPaymentSaving && setBranchPaymentOpen(false)} centered>
     <Form onSubmit={saveBranchPaymentSettings}>
       <ModalHeader toggle={() => !branchPaymentSaving && setBranchPaymentOpen(false)}>
         Razorpay · {branchPaymentBranch?.name || 'Branch'}
       </ModalHeader>
       <ModalBody>
         <p className="text-secondary small">
           Bookings for this branch will be paid into its Razorpay account. Secrets are encrypted and never returned to the browser.
         </p>
         <p className="text-secondary small">
           The server must have <code>RAZORPAY_CREDENTIALS_ENCRYPTION_KEY</code> configured before credentials can be saved.
         </p>
         {branchPaymentError && <Alert color="danger">{branchPaymentError}</Alert>}
         {branchPaymentLoading ? (
           <div className="text-center py-3"><Spinner size="sm" color="primary" /> Loading payment settings...</div>
         ) : (
           <>
             {branchPaymentConfigured && <Alert color="success">Razorpay is configured. Leave the secret blank to keep the current Key Secret.</Alert>}
             <FormGroup>
               <Label for="branch-razorpay-key-id">Razorpay Key ID</Label>
               <Input
                 id="branch-razorpay-key-id"
                 value={branchPaymentForm.keyId}
                 placeholder="rzp_test_..."
                 autoComplete="off"
                 onChange={(event) => setBranchPaymentForm((current) => ({ ...current, keyId: event.target.value }))}
               />
             </FormGroup>
             <FormGroup>
               <Label for="branch-razorpay-key-secret">Razorpay Key Secret</Label>
               <Input
                 id="branch-razorpay-key-secret"
                 type="password"
                 value={branchPaymentForm.keySecret}
                 placeholder={branchPaymentConfigured ? 'Leave blank to keep current secret' : 'Enter branch Key Secret'}
                 autoComplete="new-password"
                 onChange={(event) => setBranchPaymentForm((current) => ({ ...current, keySecret: event.target.value }))}
               />
             </FormGroup>
           </>
         )}
       </ModalBody>
       <ModalFooter>
         <Button color="light" type="button" disabled={branchPaymentSaving} onClick={() => setBranchPaymentOpen(false)}>Cancel</Button>
         <Button color="primary" className="btn-primary-custom" type="submit" disabled={branchPaymentLoading || branchPaymentSaving}>
           {branchPaymentSaving && <Spinner size="sm" className="me-2" />}
           {branchPaymentSaving ? 'Saving...' : 'Save payment settings'}
         </Button>
       </ModalFooter>
     </Form>
   </Modal>
   <Modal
     isOpen={customerDocumentsOpen}
     toggle={() => setCustomerDocumentsOpen(false)}
     centered
     size="lg"
   >
     <ModalHeader toggle={() => setCustomerDocumentsOpen(false)}>
       Documents · {customerDocumentsCustomer?.name || customerDocumentsCustomer?.customer || customerDocumentsCustomer?.email || 'Customer'}
     </ModalHeader>
     <ModalBody>
       {customerDocumentsError && <Alert color="danger">{customerDocumentsError}</Alert>}
       {customerDocumentsLoading ? (
         <div className="text-center py-4"><Spinner color="primary" /></div>
       ) : customerDocuments.length ? (
         <div className="table-responsive">
           <table className="table align-middle">
             <thead><tr><th>Document</th><th>File</th><th>Uploaded</th><th>Status</th><th /></tr></thead>
             <tbody>
               {customerDocuments.map((document) => (
                 <tr key={document.id}>
                   <td><FiFileText className="me-2 text-primary" />{document.documentType}</td>
                   <td>{document.fileName}<small className="d-block text-secondary">{formatDocumentSize(document.size)}</small></td>
                   <td>{document.uploadedAt ? new Date(document.uploadedAt).toLocaleDateString('en-IN') : '—'}</td>
                   <td><StatusBadge status={document.status} /></td>
                   <td className="text-end">
                     <Button
                       color="light"
                       size="sm"
                       disabled={downloadingDocumentId === document.id}
                       onClick={() => downloadCustomerDocument(document)}
                       aria-label={`Download ${document.documentType}`}
                     >
                       {downloadingDocumentId === document.id
                         ? <Spinner size="sm" />
                         : <><FiDownload className="me-1" /> Download</>}
                     </Button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       ) : (
         <div className="text-center text-secondary py-4">This customer has not uploaded any documents yet.</div>
       )}
     </ModalBody>
   </Modal>
   <DeleteConfirmModal
      isOpen={Boolean(recordToDelete)}
      toggle={() => setRecordToDelete(null)}
      onConfirm={confirmDeleteRecord}
      title="Are you sure you want to delete this?"
      message={recordToDelete ? `Do you really want to delete this ${config.title?.toLowerCase() || 'record'} (${recordToDelete.name || recordToDelete.customer || recordToDelete.title || recordToDelete.id || 'selected item'})? This action cannot be undone.` : 'Do you really want to delete this record? This action cannot be undone.'}
      confirmText="OK, Delete"
      cancelText="Cancel"
      busy={saving}
    />
  </>;
}
function formatDocumentSize(bytes) {
 const size = Number(bytes) || 0;
 if (size < 1024) return `${size} B`;
 if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
 return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function readRecords(path, defaults) {
 const initialRows = defaults.map((row, index) => ({ ...row, _recordId: String(row.id || `${path}-${index}`) }));
 try {
   const parsedRows = readDemoJson(`nanospace-records:${path}`);
   if (parsedRows === null) return { rows: initialRows, notice: null };
   if (!Array.isArray(parsedRows) || parsedRows.some((row) => !row || typeof row !== 'object' || typeof row._recordId !== 'string')) {
     throw new Error(`Saved records for ${path} have an invalid format.`);
   }
   return { rows: parsedRows, notice: null };
 } catch (error) {
   console.error(`Could not load records for ${path}:`, error);
   return { rows: initialRows, notice: { color: 'danger', text: 'Saved records could not be loaded. Showing the original demo data.' } };
 }
}
