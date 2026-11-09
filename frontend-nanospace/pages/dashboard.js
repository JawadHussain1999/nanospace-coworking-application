import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Badge, Button, Card, CardBody, Col, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from "reactstrap";
import {
  FiArrowUpRight,
  FiCalendar,
  FiDownload,
  FiShield,
  FiPlus,
  FiUsers,
  FiBriefcase,
  FiCreditCard,
  FiTrendingUp,
  FiClock,
  FiArrowRight,
  FiAlertCircle,
  FiFileText,
  FiMessageCircle,
  FiLogIn,
  FiLogOut,
  FiEdit2,
  FiRefreshCw,
  FiMail,
  FiPhone,
  FiMapPin,
} from "react-icons/fi";
import AppLayout from "../components/layout/AppLayout";
import StatCard from "../components/overview/dashboard/StatCard";
import RevenueChart from "../components/overview/insights/RevenueChart";
import BookingChart from "../components/overview/insights/BookingChart";
import DataTable, { StatusBadge } from "../components/shared/DataTable";
import UserAvatar from "../components/shared/UserAvatar";
import { useAuth } from "../context/AuthContext";
import { BRANCHES } from "../data/mockData";
import { ROLE_LABELS } from "../utils/permissions";
import { getPaymentReminderUrl } from "../utils/paymentReminders";
import { clockIn, clockOut } from "../store/slices/attendanceSlice";
import { api, getApiCollection, getApiErrorMessage, getApiPayload, isApiEnabled } from "../services/api";
import { formatShortBookingId } from "../services/apiRecords";
import { showSuccess, showError } from "../utils/toast";

function toIsoDateString(val) {
  if (!val) return "";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDateKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatClockTime(timestamp) {
  return timestamp
    ? new Date(timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "—";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function LiveClockWidget({ className = "" }) {
  const [time, setTime] = useState(null);
  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) {
    return (
      <div className={`live-clock-widget ${className}`}>
        <div className="live-clock-header">
          <span className="live-indicator-dot" />
          <span className="live-indicator-label">REAL-TIME</span>
        </div>
        <div className="live-clock-time">
          <FiClock className="me-1 text-primary" size={16} />
          <span>--:--:-- --</span>
        </div>
        <div className="live-clock-date">
          <FiCalendar className="me-1 text-secondary" size={13} />
          <span>Loading date...</span>
        </div>
      </div>
    );
  }

  const timeStr = time.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const dateStr = time.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className={`live-clock-widget ${className}`}>
      <div className="live-clock-header">
        <span className="live-indicator-dot" />
        <span className="live-indicator-label">REAL-TIME</span>
      </div>
      <div className="live-clock-time">
        <FiClock className="me-1 text-primary" size={16} />
        <span>{timeStr}</span>
      </div>
      <div className="live-clock-date">
        <FiCalendar className="me-1 text-secondary" size={13} />
        <span>{dateStr}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [selectedBranch, setSelectedBranch] = useState("All branches");
  const [apiSummary, setApiSummary] = useState(null);
  const [apiError, setApiError] = useState("");
  const liveBookings = useSelector((state) => state.workspace.bookings);

  useEffect(() => {
    if (!isApiEnabled || !ready || !user || ["customer", "employee", "reception_admin"].includes(user.role)) return undefined;
    let active = true;
    const params = user.role === "super_admin"
      ? selectedBranch !== "All branches" ? { branch: selectedBranch } : undefined
      : user.branch ? { branch: user.branch } : undefined;
    Promise.resolve()
      .then(() => {
        if (!active) return undefined;
        setApiSummary(null);
        setApiError("");
        return api.dashboard.summary(params);
      })
      .then((result) => { if (active) setApiSummary(getApiPayload(result)); })
      .catch((error) => {
        console.warn("Could not load API dashboard summary, using fallback metrics:", error.message);
      });
    return () => { active = false; };
  }, [ready, selectedBranch, user]);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  if (!ready || !user) return null;
  if (["branch_admin", "reception_admin"].includes(user.role) && !user.branch) {
    return (
      <AppLayout>
        <Alert color="warning">
          Your account has no branch assigned. Contact a Super Admin to configure your branch access.
        </Alert>
      </AppLayout>
    );
  }

  const isCustomer = user.role === "customer";
  const isEmployee = user.role === "employee";
  const isReception = user.role === "reception_admin";
  const isSuper = user.role === "super_admin";
  const branchScope = isSuper ? selectedBranch : user.branch || "";
  const apiBranchRevenue = Array.isArray(apiSummary?.branches)
    ? apiSummary.branches
    : Array.isArray(apiSummary?.branchRevenue) ? apiSummary.branchRevenue : [];
  const scopedRevenue = branchScope === "All branches"
    ? (apiSummary?.revenue ?? apiSummary?.totalRevenue ?? 0)
    : (apiBranchRevenue.find((entry) => entry.branch === branchScope)?.revenue ?? 0);
  const apiRecent = Array.isArray(apiSummary?.recentBookings)
    ? apiSummary.recentBookings.map((booking) => ({
      ...booking,
      customer: booking.customer || booking.customerName,
      id: formatShortBookingId(booking.branch, booking.id || booking._id),
    }))
    : [];
  const branchBookings = [
    ...apiRecent,
    ...liveBookings.map((booking) => ({
      id: formatShortBookingId(booking.branch, booking.id),
      customer: booking.customerName,
      branch: booking.branch,
      date: booking.date,
      status: booking.status,
    })),
  ].filter((booking, index, all) =>
    all.findIndex((entry) => entry.id === booking.id) === index &&
    (branchScope === "All branches" || booking.branch === branchScope)
  );
  const activeBookingCount = apiSummary?.activeBookings ?? apiSummary?.bookingCount ?? apiSummary?.bookings ?? branchBookings.length;
  const customerCount = apiSummary?.activeCustomers ?? apiSummary?.customerCount ?? apiSummary?.customers ?? 0;
  const occupancy = apiSummary?.occupancy ?? (apiSummary?.occupancyRate ? `${apiSummary.occupancyRate}%` : "0%");
  const visibleAttentionItems = Array.isArray(apiSummary?.attentionItems)
    ? apiSummary.attentionItems.filter((item) => branchScope === "All branches" || item.branch === branchScope)
    : [];
  const visibleBranchRevenue = apiBranchRevenue.filter((entry) => branchScope === "All branches" || entry.branch === branchScope);

  return (
    <AppLayout>
      <Head>
        <title>Dashboard | NanoSpace</title>
        <meta name="description" content="NanoSpace coworking dashboard" />
      </Head>
      {apiError && <Alert color="danger">{apiError}</Alert>}
      {router.pathname === "/dashboard" && (isCustomer || isEmployee || isReception) ? (
        <PersonalDashboard user={user} isCustomer={isCustomer} isReception={isReception} />
      ) : (
        <>
          <div className="page-heading-row">
            <div>
              <div className="eyebrow">
                {isSuper
                  ? "ORGANIZATION OVERVIEW"
                  : `${user.branch?.toUpperCase() || "NANOSPACE"} / OVERVIEW`}
              </div>
              <h2>
                {getGreeting()}, {user.name.split(" ")[0]}{" "}
                <span className="wave">✦</span>
              </h2>
              <p>
                Here’s what’s happening with your{" "}
                {isSuper ? "workspaces" : `${user.branch} workspace`} today.
              </p>
            </div>
            <div className="heading-actions d-flex align-items-center gap-2 flex-wrap">
              <div className="d-flex align-items-center gap-2">
                <Button
                  color="light"
                  className="btn-soft"
                  onClick={() => window.print()}
                >
                  <FiDownload className="me-2" />
                  Export report
                </Button>
                <Button
                  color="primary"
                  className="btn-primary-custom"
                  onClick={() => router.push("/bookings")}
                >
                  <FiPlus className="me-2" />
                  New booking
                </Button>
              </div>
            </div>
          </div>
          <Row className="g-3 stat-grid">
            <Col sm="6" xl="3">
              <StatCard
                label={branchScope === "All branches" ? "Total revenue" : "Branch revenue"}
                value={Number.isFinite(Number(scopedRevenue)) ? formatCurrency(Number(scopedRevenue)) : "—"}
                change="Recorded total"
                icon={FiTrendingUp}
                tone="blue"
              />
            </Col>
            <Col sm="6" xl="3">
              <StatCard
                label={branchScope === "All branches" ? "Active bookings" : "Branch bookings"}
                value={String(activeBookingCount)}
                change="Current count"
                icon={FiCalendar}
                tone="purple"
              />
            </Col>
            <Col sm="6" xl="3">
              <StatCard
                label={branchScope === "All branches" ? "Active customers" : "Branch customers"}
                value={String(customerCount)}
                change="Current count"
                icon={FiUsers}
                tone="green"
              />
            </Col>
            <Col sm="6" xl="3">
              <StatCard
                label="Occupancy rate"
                value={occupancy}
                change="Current occupancy"
                icon={FiBriefcase}
                tone="orange"
              />
            </Col>
          </Row>
          <Row className="g-3 mt-1">
            <Col xl="8">
              <Card className="panel-card border-0 h-100">
                <CardBody>
                  <div className="panel-heading">
                    <div>
                      <h3>Revenue overview</h3>
                      <p>{branchScope === "All branches" ? "Revenue vs expenses over the last 6 months" : `Revenue reported for ${branchScope}`}</p>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      {isSuper && <Input aria-label="Filter dashboard by branch" type="select" bsSize="sm" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} style={{ width: 170 }}><option>All branches</option>{BRANCHES.map((branch) => <option key={branch}>{branch}</option>)}</Input>}
                      <Badge color="light" className="date-badge">
                        <FiCalendar className="me-2" />
                        {branchScope === "All branches" ? "May – Oct 2026" : branchScope}
                      </Badge>
                    </div>
                  </div>
                  <RevenueChart
                    branch={branchScope}
                    monthlyData={isApiEnabled ? (apiSummary?.monthlyRevenue || []) : undefined}
                    selectedBranchData={isApiEnabled ? apiBranchRevenue : undefined}
                  />
                </CardBody>
              </Card>
            </Col>
            <Col xl="4">
              <Card className="panel-card border-0 h-100">
                <CardBody>
                  <div className="panel-heading">
                    <div>
                      <h3>Branch performance</h3>
                      <p>{branchScope === "All branches" ? "Revenue by location" : `Revenue at ${branchScope}`}</p>
                    </div>
                    {isSuper && <button
                      className="more-button"
                      onClick={() => router.push("/branches")}
                      aria-label="View branches"
                    >
                      <FiArrowUpRight />
                    </button>}
                  </div>
                  <BookingChart branch={branchScope} data={isApiEnabled ? apiBranchRevenue : undefined} />
                  <div className="branch-summary">
                    {visibleBranchRevenue.map((entry, index) => (
                      <div className="branch-summary-row" key={entry.branch}>
                        <span className={`branch-dot ${["blue", "purple", "green", "orange"][index]}`} />
                        <span>{entry.branch}</span>
                        <strong>{formatCurrency(entry.revenue)}</strong>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>
          <Row className="g-3 mt-1">
            <Col xl="8">
              <Card className="panel-card border-0">
                <CardBody className="p-0">
                  <div className="panel-heading px-4 pt-4">
                    <div>
                      <h3>Recent bookings</h3>
                      <p>{branchScope === "All branches" ? "Latest workspace reservations across all branches" : `Latest workspace reservations at ${branchScope}`}</p>
                    </div>
                    <button
                      className="view-all-button"
                      onClick={() => router.push("/bookings")}
                    >
                      View all <FiArrowRight />
                    </button>
                  </div>
                  <DataTable
                    columns={[
                      { key: "id", label: "Booking ID" },
                      { key: "customer", label: "Customer" },
                      { key: "branch", label: "Branch" },
                      { key: "date", label: "Date" },
                      {
                        key: "status",
                        label: "Status",
                        render: (v) => <StatusBadge status={v} />,
                      },
                    ]}
                    rows={branchBookings.slice(0, 4)}
                    rowKey="id"
                    pagination={false}
                  />
                </CardBody>
              </Card>
            </Col>
            <Col xl="4">
              <Card className="panel-card border-0 h-100">
                <CardBody>
                  <div className="panel-heading">
                    <div>
                      <h3>Needs attention</h3>
                      <p>Items that may need a follow-up</p>
                    </div>
                    <span className="attention-count">{visibleAttentionItems.length}</span>
                  </div>
                  <div className="attention-list">
                    {visibleAttentionItems.map((item) => (
                      <AttentionItem
                        key={`${item.branch}-${item.title}`}
                        {...item}
                        action={item.payment ? {
                          href: getPaymentReminderUrl(item.payment),
                          label: `Send WhatsApp payment reminder to ${item.payment.customer}`,
                        } : null}
                      />
                    ))}
                    {!visibleAttentionItems.length && <p className="small text-secondary py-3 mb-0">No follow-ups for this branch.</p>}
                  </div>
                  <Button
                    color="light"
                    className="attention-button"
                    onClick={() => router.push("/reminders")}
                  >
                    View all follow-ups <FiArrowRight />
                  </Button>
                </CardBody>
              </Card>
            </Col>
          </Row>
          <div className="dashboard-bottom-note">
            <span className="bottom-note-item">
              <FiClock size={14} className="me-1 text-primary" /> Last updated just now
            </span>
            <span className="bottom-note-bullet">•</span>
            <span className="bottom-note-item">NanoSpace Live Sync</span>
            <span className="bottom-note-bullet">•</span>
            <span className="bottom-note-badge">{ROLE_LABELS[user.role]} View</span>
          </div>
        </>
      )}
    </AppLayout>
  );
}

const ATTENTION_ICONS = {
  payment: FiCreditCard,
  quotation: FiFileText,
  complaint: FiAlertCircle,
  booking: FiCalendar,
  default: FiAlertCircle,
};

function AttentionItem({ icon, type, color, title, text, tag, action }) {
  const IconComponent = icon || ATTENTION_ICONS[String(type || '').toLowerCase()] || ATTENTION_ICONS.default;
  const badgeColor = color || (String(type || '').toLowerCase() === 'payment' ? 'red' : String(type || '').toLowerCase() === 'quotation' ? 'blue' : String(type || '').toLowerCase() === 'complaint' ? 'orange' : 'blue');
  return (
    <div className="attention-item">
      <div className={`attention-icon ${badgeColor}`}>
        <IconComponent size={17} />
      </div>
      <div className="attention-copy">
        <strong className="attention-title">{title}</strong>
        <span className="attention-text">{text}</span>
      </div>
      <div className="attention-actions-col">
        {action?.href && (
          <a className="btn-whatsapp-pill" href={action.href} target="_blank" rel="noopener noreferrer" aria-label={action.label} title="Open WhatsApp with a pre-filled payment reminder">
            <FiMessageCircle size={13} className="me-1" />
            <span>Remind</span>
          </a>
        )}
        <span className={`attention-tag ${badgeColor}`}>{tag}</span>
      </div>
    </div>
  );
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function PersonalDashboard({ user, isCustomer, isReception }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const { updateProfile } = useAuth();
  const attendance = useSelector((state) => state.attendance);
  const bookings = useSelector((state) => state.workspace.bookings);
  const today = localDateKey();
  const [apiPersonal, setApiPersonal] = useState({ bookings: [], agreements: [], invoices: [], complaints: [], attendance: [], leaves: [], payroll: [] });
  const [apiPersonalLoading, setApiPersonalLoading] = useState(isApiEnabled);
  const [apiPersonalError, setApiPersonalError] = useState('');
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [renewalError, setRenewalError] = useState('');
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    companyName: user.company || '',
    gstin: user.gstin || '',
    panNumber: user.pan_number || '',
    address: user.address || '',
    avatar: user.avatar || null,
  });
  const attendanceRecords = isApiEnabled ? apiPersonal.attendance : attendance;
  const personalBookings = isApiEnabled ? apiPersonal.bookings : bookings;

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    loadPersonalApiData(user, isCustomer)
      .then(({ data, errors }) => {
        if (!active) return;
        setApiPersonal(data);
        if (errors.length) setApiPersonalError(errors.join(' '));
      })
      .catch((error) => {
        console.error('Could not load personal dashboard data:', error);
        if (active) setApiPersonalError(getApiErrorMessage(error, 'Personal dashboard data could not be loaded.'));
      })
      .finally(() => { if (active) setApiPersonalLoading(false); });
    return () => { active = false; };
  }, [isCustomer, user]);

  useEffect(() => {
    if (!isApiEnabled || !isCustomer || !user.customerId) return undefined;
    let active = true;
    api.customers.detail(user.customerId)
      .then((response) => {
        const profile = getApiPayload(response);
        if (!active) return;
        setCustomerProfile(profile);
        setProfileForm({
          name: profile.full_name || user.name || '',
          email: profile.email || user.email || '',
          phone: profile.phone || '',
          companyName: profile.company_name || '',
          gstin: profile.gstin || '',
          panNumber: profile.pan_number || '',
          address: profile.address || '',
          avatar: user.avatar || null,
        });
      })
      .catch((error) => {
        console.error('Could not load customer profile:', error);
        if (active) setProfileError(getApiErrorMessage(error, 'Customer profile could not be loaded.'));
      });
    return () => { active = false; };
  }, [
    isCustomer,
    user.address,
    user.avatar,
    user.company,
    user.customerId,
    user.email,
    user.gstin,
    user.name,
    user.pan_number,
    user.phone,
  ]);

  const todayEntry = attendanceRecords.find((entry) => 
    (entry.email?.toLowerCase() === user.email?.toLowerCase() || entry.userId === user.id) &&
    (entry.date === today || (!entry.clockOut && entry.clockIn))
  );

  const attendanceThisMonth = attendanceRecords.filter((entry) =>
    entry.email?.toLowerCase() === user.email?.toLowerCase() &&
    entry.date &&
    entry.date.startsWith(today.slice(0, 7))
  );

  const recentAttendance = attendanceRecords
    .filter((entry) => entry.email?.toLowerCase() === user.email?.toLowerCase())
    .map((entry) => ({
      date: entry.date || (entry.clockIn ? toIsoDateString(entry.clockIn) : "—"),
      checkin: formatClockTime(entry.clockIn),
      checkout: formatClockTime(entry.clockOut),
      status: entry.clockOut ? "Completed" : "Active",
    }))
    .slice(0, 5);

  const customerBookings = personalBookings
    .filter((booking) => belongsToUser(booking, user))
    .map((booking) => ({
      ...booking,
      id: formatShortBookingId(booking.branch, booking.id || booking._id),
      raw_id: booking.raw_id || booking.id || booking._id,
      workspace: booking.workspace || booking.itemName || booking.workspaceName,
      date: booking.date || booking.startDate || booking.bookingDate,
      amount: booking.amount ?? booking.total,
    }));

  const latestAgreement = apiPersonal.agreements.find((agreement) =>
    ['active', 'accepted'].includes(String(agreement.status || '').toLowerCase())
  ) || apiPersonal.agreements[0];
  const latestPlanBooking = apiPersonal.bookings[0];
  const planRecord = latestAgreement || latestPlanBooking;
  const planName = latestAgreement
    ? latestAgreement.plan || latestAgreement.workspace_name || latestAgreement.agreement_number || 'Workspace membership'
    : latestPlanBooking
      ? latestPlanBooking.plan_name || latestPlanBooking.workspace_name || latestPlanBooking.workspace || 'Workspace booking'
      : '';
  const renewalTitlePrefix = 'Plan renewal request:';
  const renewalTitle = `${renewalTitlePrefix} ${planName}`.slice(0, 180);
  const renewalComplaint = planRecord && apiPersonal.complaints.find((complaint) =>
    String(complaint.title || complaint.issue || '').toLowerCase() === renewalTitle.toLowerCase() &&
    !['resolved', 'closed', 'completed'].includes(String(complaint.status || '').toLowerCase())
  );

  const openCustomerProfile = () => {
    setProfileError('');
    setProfileForm({
      name: customerProfile?.full_name || user.name || '',
      email: customerProfile?.email || user.email || '',
      phone: customerProfile?.phone || user.phone || '',
      companyName: customerProfile?.company_name || user.company || '',
      gstin: customerProfile?.gstin || user.gstin || '',
      panNumber: customerProfile?.pan_number || user.pan_number || '',
      address: customerProfile?.address || user.address || '',
      avatar: user.avatar || null,
    });
    setProfileModalOpen(true);
  };

  const handleProfileAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Choose a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError('Profile pictures must be smaller than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfileForm((current) => ({ ...current, avatar: reader.result }));
    reader.onerror = () => setProfileError('The selected profile picture could not be read.');
    reader.readAsDataURL(file);
  };

  const saveCustomerProfile = async (event) => {
    event.preventDefault();
    setProfileError('');
    const name = profileForm.name.trim();
    const email = profileForm.email.trim().toLowerCase();
    const gstin = profileForm.gstin.trim().toUpperCase();
    const panNumber = profileForm.panNumber.trim().toUpperCase();
    if (!name) return setProfileError('Full name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setProfileError('Enter a valid email address.');
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      return setProfileError('Enter a valid 15-character GSTIN.');
    }
    if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
      return setProfileError('Enter a valid 10-character PAN number.');
    }

    setProfileSaving(true);
    try {
      const result = await updateProfile({
        ...profileForm,
        name,
        email,
        gstin,
        panNumber,
      });
      if (!result.ok) throw new Error(result.message || 'Profile changes could not be saved.');
      const updatedProfile = getApiPayload(await api.customers.detail(user.customerId));
      setCustomerProfile(updatedProfile);
      setProfileModalOpen(false);
      showSuccess('Your profile has been updated.');
    } catch (error) {
      console.error('Could not save customer profile:', error);
      setProfileError(getApiErrorMessage(error, error.message || 'Your profile could not be saved.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const requestPlanRenewal = async () => {
    if (!planRecord) return;
    if (!isApiEnabled) {
      setRenewalError('Plan renewal requests are available after connecting your customer account to NanoSpace.');
      return;
    }
    setRenewalBusy(true);
    setRenewalError('');
    try {
      const planReference = latestAgreement?.agreement_number || latestPlanBooking?.booking_id || latestPlanBooking?.id || '';
      const description = [
        `Customer requested renewal of ${planName}.`,
        planReference ? `Current plan reference: ${planReference}.` : '',
        latestAgreement?.end_date ? `Current plan ends on ${toIsoDateString(latestAgreement.end_date)}.` : '',
        'Please contact the customer to confirm availability, renewal term, and payment.',
      ].filter(Boolean).join(' ');
      const response = await api.complaints.create({
        title: renewalTitle,
        description,
        priority: 'MEDIUM',
      });
      const complaint = getApiPayload(response);
      setApiPersonal((current) => ({
        ...current,
        complaints: [complaint, ...current.complaints],
      }));
      showSuccess('Your renewal request was sent to the NanoSpace team.');
    } catch (error) {
      console.error('Could not submit plan renewal request:', error);
      setRenewalError(getApiErrorMessage(error, 'Your renewal request could not be submitted.'));
    } finally {
      setRenewalBusy(false);
    }
  };

  const toggleClock = async () => {
    if (isApiEnabled) {
      setAttendanceBusy(true);
      setApiPersonalError('');
      try {
        if (!todayEntry) {
          await api.attendance.checkIn({ branch: user.branch, date: today });
          showSuccess("Shift started! Clock-in successfully recorded.");
        } else if (!todayEntry.clockOut) {
          await api.attendance.checkOut({ id: todayEntry.id, date: today });
          showSuccess("Shift ended! Clock-out successfully recorded.");
        }
        const { data, errors } = await loadPersonalApiData(user, false);
        setApiPersonal((current) => ({ ...current, ...data }));
        if (errors.length) setApiPersonalError(errors.join(' '));
      } catch (error) {
        console.error('Could not update attendance:', error);
        const errMsg = getApiErrorMessage(error, 'Attendance could not be updated.');
        setApiPersonalError(errMsg);
        showError(errMsg);
      } finally {
        setAttendanceBusy(false);
      }
      return;
    }

    if (!todayEntry) {
      dispatch(clockIn({
        id: `${user.email}-${today}`,
        email: user.email,
        name: user.name,
        branch: user.branch || "All branches",
        date: today,
        clockIn: new Date().toISOString(),
        clockOut: null,
      }));
      showSuccess("Shift started! Clock-in successfully recorded.");
    } else if (!todayEntry.clockOut) {
      dispatch(clockOut({ id: todayEntry.id, clockOut: new Date().toISOString() }));
      showSuccess("Shift ended! Clock-out successfully recorded.");
    }
  };

  return (
    <>
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">MY NANOSPACE</div>
          <h2>
            {isCustomer ? "Welcome back" : "Your workday"},{" "}
            {user.name.split(" ")[0]} <span className="wave">✦</span>
          </h2>
          <p>
            {isCustomer
              ? "Manage your workspace, bookings, documents and payments."
              : "Here is your personal workspace overview."}
          </p>
        </div>
        <div className="heading-actions d-flex align-items-center gap-2 flex-wrap">
          {isCustomer && (
            <Button
              color="primary"
              className="btn-primary-custom"
              onClick={() => router.push("/book-workspace")}
            >
              <FiPlus className="me-2" />
              Book workspace
            </Button>
          )}
          {isReception && (
            <Button
              color="primary"
              className="btn-primary-custom"
              onClick={() => router.push("/in-person-booking")}
            >
              <FiPlus className="me-2" />
              In-person booking
            </Button>
          )}
        </div>
      </div>
      {apiPersonalError && <Alert color="danger">{apiPersonalError}</Alert>}
      {isApiEnabled && apiPersonalLoading && <Alert color="info">Loading your latest account data...</Alert>}
      {isCustomer && (
        <Row className="g-3 mb-3 customer-dashboard-overview">
          <Col xl="6">
            <Card className="panel-card border-0 h-100">
              <CardBody>
                <div className="customer-profile-heading">
                  <div className="d-flex align-items-center gap-3">
                    <UserAvatar user={user} size={64} className="customer-dashboard-avatar" />
                    <div className="min-w-0">
                      <div className="eyebrow">YOUR ACCOUNT</div>
                      <h3 className="customer-profile-name">{customerProfile?.full_name || user.name}</h3>
                      <p className="customer-profile-subtitle">{customerProfile?.company_name || 'NanoSpace member'}</p>
                    </div>
                  </div>
                  <Button color="light" size="sm" className="btn-soft" onClick={openCustomerProfile}>
                    <FiEdit2 className="me-1" /> Edit profile
                  </Button>
                </div>
                {profileError && !profileModalOpen && <Alert color="danger" className="mt-3 mb-0">{profileError}</Alert>}
                <div className="customer-profile-details">
                  {[
                    ['Email address', customerProfile?.email || user.email, FiMail],
                    ['Phone number', customerProfile?.phone || user.phone, FiPhone],
                    ['Company', customerProfile?.company_name || user.company, FiBriefcase],
                    ['GSTIN', customerProfile?.gstin || user.gstin, FiFileText],
                    ['PAN number', customerProfile?.pan_number || user.pan_number, FiShield],
                    ['Address', customerProfile?.address || user.address, FiMapPin],
                  ].map(([label, value, Icon]) => (
                    <div className="customer-profile-detail" key={label}>
                      <Icon size={15} />
                      <div>
                        <span>{label}</span>
                        <strong>{value || <span className="text-muted fw-normal">Add details</span>}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </Col>
          <Col xl="6">
            <Card className="panel-card border-0 h-100">
              <CardBody>
                <div className="panel-heading mb-3">
                  <div>
                    <div className="eyebrow">MEMBERSHIP</div>
                    <h3>Your plan</h3>
                    <p>Your purchased workspace plan and renewal options</p>
                  </div>
                  {planRecord && <Badge color={latestAgreement?.status === 'ACTIVE' ? 'success' : 'light'} pill>{latestAgreement?.status || latestPlanBooking?.status || 'Purchased'}</Badge>}
                </div>
                {planRecord ? (
                  <>
                    <div className="customer-plan-summary">
                      <div className="customer-plan-icon"><FiBriefcase size={20} /></div>
                      <div>
                        <strong>{planName}</strong>
                        <span>{latestAgreement?.branch || latestPlanBooking?.branch || user.branch || 'NanoSpace'}</span>
                      </div>
                    </div>
                    <div className="customer-plan-dates">
                      <div><span>Started</span><strong>{toIsoDateString(latestAgreement?.start_date || latestPlanBooking?.starts_at || latestPlanBooking?.date) || '—'}</strong></div>
                      <div><span>Valid until</span><strong>{toIsoDateString(latestAgreement?.end_date || latestPlanBooking?.ends_at) || 'Contact team'}</strong></div>
                      <div><span>Plan value</span><strong>{latestAgreement?.contract_value != null
                        ? formatMoney(latestAgreement.contract_value)
                        : latestPlanBooking?.total_amount != null ? formatMoney(latestPlanBooking.total_amount) : 'As purchased'}</strong></div>
                    </div>
                    {renewalError && <Alert color="danger" className="mt-3 mb-0">{renewalError}</Alert>}
                    <div className="customer-renewal-action">
                      <div className="small text-muted">
                        {renewalComplaint
                          ? `Renewal request ${String(renewalComplaint.status || 'OPEN').toLowerCase().replace(/_/g, ' ')}`
                          : 'Request a renewal and our team will confirm the term and payment.'}
                      </div>
                      <Button color="primary" className="btn-primary-custom" onClick={requestPlanRenewal} disabled={renewalBusy || Boolean(renewalComplaint)}>
                        {renewalBusy ? <Spinner size="sm" className="me-2" /> : <FiRefreshCw className="me-2" />}
                        {renewalBusy ? 'Sending request...' : renewalComplaint ? 'Request sent' : 'Renew plan'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="customer-plan-empty">
                    <FiBriefcase size={24} />
                    <strong>No purchased plan found</strong>
                    <span>Your active plan or workspace booking will appear here.</span>
                    <Button color="primary" className="btn-primary-custom mt-2" onClick={() => router.push('/book-workspace')}>
                      Browse workspace plans
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      )}
      <Modal isOpen={profileModalOpen} toggle={() => setProfileModalOpen(false)} centered size="lg">
        <Form onSubmit={saveCustomerProfile}>
          <ModalHeader toggle={() => setProfileModalOpen(false)}>Your customer profile</ModalHeader>
          <ModalBody>
            {profileError && <Alert color="danger">{profileError}</Alert>}
            <div className="customer-profile-edit-avatar">
              <UserAvatar src={profileForm.avatar} name={profileForm.name} size={72} />
              <div>
                <Label for="customer-profile-avatar">Profile picture</Label>
                <Input id="customer-profile-avatar" type="file" accept="image/*" onChange={handleProfileAvatar} />
                <small className="text-muted">PNG, JPG or WEBP. Maximum 5MB.</small>
              </div>
            </div>
            <Row>
              {[
                ['name', 'Full name', 'text', true],
                ['email', 'Email address', 'email', true],
                ['phone', 'Phone number', 'tel', false],
                ['companyName', 'Company name', 'text', false],
                ['gstin', 'GSTIN', 'text', false],
                ['panNumber', 'PAN number', 'text', false],
              ].map(([key, label, type, required]) => (
                <Col md="6" key={key}>
                  <FormGroup>
                    <Label for={`customer-profile-${key}`}>{label}{required ? ' *' : ''}</Label>
                    <Input
                      id={`customer-profile-${key}`}
                      type={type}
                      value={profileForm[key]}
                      required={required}
                      maxLength={key === 'gstin' ? 15 : key === 'panNumber' ? 10 : undefined}
                      onChange={(event) => setProfileForm((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </FormGroup>
                </Col>
              ))}
              <Col xs="12">
                <FormGroup>
                  <Label for="customer-profile-address">Billing / business address</Label>
                  <Input
                    id="customer-profile-address"
                    type="textarea"
                    rows="3"
                    value={profileForm.address}
                    onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
                  />
                </FormGroup>
              </Col>
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="light" onClick={() => setProfileModalOpen(false)} disabled={profileSaving}>Cancel</Button>
            <Button color="primary" type="submit" className="btn-primary-custom" disabled={profileSaving}>
              {profileSaving && <Spinner size="sm" className="me-2" />}
              {profileSaving ? 'Saving...' : 'Save profile'}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
      {!isCustomer && (
        <Card className="panel-card border-0 mb-4 attendance-hero-card">
          <CardBody className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <div className="d-flex align-items-center gap-3">
              <div className={`attendance-status-avatar ${todayEntry ? (!todayEntry.clockOut ? 'status-active' : 'status-completed') : 'status-idle'}`}>
                <FiClock size={24} />
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <strong>Today&apos;s Attendance</strong>
                  {todayEntry && !todayEntry.clockOut && (
                    <Badge color="success" pill className="px-2 py-1">
                      <span className="live-dot-sm me-1" /> On shift
                    </Badge>
                  )}
                  {todayEntry && todayEntry.clockOut && (
                    <Badge color="secondary" pill className="px-2 py-1">
                      Completed
                    </Badge>
                  )}
                </div>
                <div className="small text-secondary mt-1">
                  {todayEntry
                    ? todayEntry.clockOut
                      ? `Clocked in at ${formatClockTime(todayEntry.clockIn)} • Clocked out at ${formatClockTime(todayEntry.clockOut)}`
                      : `Clocked in at ${formatClockTime(todayEntry.clockIn)} • Shift currently active`
                    : "You haven't clocked in yet today."}
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              {!todayEntry ? (
                <Button
                  color="primary"
                  className="btn-primary-custom"
                  disabled={attendanceBusy}
                  onClick={toggleClock}
                >
                  {attendanceBusy ? <Spinner size="sm" className="me-2" /> : <FiLogIn className="me-2" />}
                  {attendanceBusy ? "Recording..." : "Clock in"}
                </Button>
              ) : todayEntry.clockOut ? (
                <Badge color="success" pill className="p-2 fs-6">
                  Shift completed at {formatClockTime(todayEntry.clockOut)}
                </Badge>
              ) : (
                <Button
                  color="danger"
                  disabled={attendanceBusy}
                  onClick={toggleClock}
                >
                  {attendanceBusy ? <Spinner size="sm" className="me-2" /> : <FiLogOut className="me-2" />}
                  {attendanceBusy ? "Recording..." : "Clock out"}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
      <Row className="g-3">
        <Col sm="6" xl="3">
          <StatCard
            label={isCustomer ? "My bookings" : "Attendance this month"}
            value={isCustomer ? String(customerBookings.length) : `${attendanceThisMonth.length} days`}
            change={isCustomer ? `${customerBookings.filter((booking) => booking.status !== "Completed").length} upcoming` : "This month"}
            icon={FiCalendar}
            tone="blue"
            helper={isCustomer ? "Workspace bookings" : "Clocked-in days this month"}
          />
        </Col>
        <Col sm="6" xl="3">
          <StatCard
            label={isCustomer ? "Active agreements" : "Leave balance"}
            value={isCustomer
              ? isApiEnabled ? String(apiPersonal.agreements.filter((agreement) => ['active', 'accepted'].includes(String(agreement.status).toLowerCase())).length) : "1"
              : isApiEnabled ? String(apiPersonal.leaves.length) : "8 days"}
            change={isCustomer ? "Current agreements" : isApiEnabled ? "Leave requests" : "Available"}
            icon={FiFileText}
            tone="purple"
            helper={isCustomer ? "Current agreement" : "Remaining"}
          />
        </Col>
        <Col sm="6" xl="3">
          <StatCard
            label={isCustomer ? "Outstanding payment" : "Payroll status"}
            value={isCustomer
              ? isApiEnabled ? formatMoney(apiPersonal.invoices.filter((invoice) => ['pending', 'overdue', 'unpaid'].includes(String(invoice.status).toLowerCase())).reduce((total, invoice) => total + Number(invoice.amount ?? invoice.total ?? 0), 0)) : "₹8,500"
              : isApiEnabled ? apiPersonal.payroll[0]?.status || "—" : "Processed"}
            change={isCustomer ? "Outstanding invoices" : isApiEnabled ? "Latest payroll record" : "September salary"}
            icon={FiCreditCard}
            tone="orange"
            helper={isCustomer ? "Invoice INV-802" : "Latest update"}
          />
        </Col>
        <Col sm="6" xl="3">
          <StatCard
            label={isCustomer ? "Open complaints" : "Attendance status"}
            value={isCustomer
              ? isApiEnabled ? String(apiPersonal.complaints.filter((complaint) => !['resolved', 'closed', 'completed'].includes(String(complaint.status).toLowerCase())).length) : "1"
              : todayEntry ? (todayEntry.clockOut ? "Clocked out" : "On shift") : "Not clocked in"}
            change={isCustomer ? "Open complaints" : todayEntry ? formatClockTime(todayEntry.clockIn) : "No shift today"}
            icon={FiAlertCircle}
            tone="green"
            helper={isCustomer ? "Ticket CMP-117" : "Today"}
          />
        </Col>
      </Row>
      <Row className="g-3 mt-1">
        <Col xl="8">
          <Card className="panel-card border-0">
            <CardBody>
              <div className="panel-heading">
                <div>
                  <h3>{isCustomer ? "My recent bookings" : "My attendance"}</h3>
                  <p>
                    {isCustomer
                      ? "Your latest workspace reservations"
                      : "Your latest attendance entries"}
                  </p>
                </div>
                <button
                  className="view-all-button"
                  onClick={() =>
                    router.push(isCustomer ? "/bookings" : "/attendance")
                  }
                >
                  View all <FiArrowRight />
                </button>
              </div>
              {isCustomer ? (
                <DataTable
                  columns={[
                    { key: "id", label: "Booking ID" },
                    { key: "workspace", label: "Workspace" },
                    { key: "date", label: "Date" },
                    { key: "amount", label: "Amount" },
                    {
                      key: "status",
                      label: "Status",
                      render: (v) => <StatusBadge status={v} />,
                    },
                  ]}
                  rows={customerBookings}
                  rowKey="id"
                  pageSize={5}
                />
              ) : (
                <DataTable
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "checkin", label: "Check in" },
                    { key: "checkout", label: "Check out" },
                    {
                      key: "status",
                      label: "Status",
                      render: (v) => <StatusBadge status={v} />,
                    },
                  ]}
                  rows={recentAttendance}
                  pageSize={5}
                />
              )}
            </CardBody>
          </Card>
        </Col>
        <Col xl="4">
          <Card className="panel-card border-0 h-100">
            <CardBody>
              <div className="panel-heading">
                <div>
                  <h3>{isCustomer ? "Quick actions" : "Quick access"}</h3>
                  <p>Common tasks</p>
                </div>
              </div>
              <div className="quick-actions">
                {(isCustomer
                  ? [
                      [
                        "Book a workspace",
                        "Choose a desk or room",
                        "/book-workspace",
                        FiCalendar,
                        "blue",
                      ],
                      [
                        "My documents",
                        "View or upload KYC files",
                        "/documents",
                        FiFileText,
                        "purple",
                      ],
                      [
                        "Payment reminders",
                        "Check upcoming payments",
                        "/reminders",
                        FiCreditCard,
                        "orange",
                      ],
                      [
                        "Raise a complaint",
                        "Get help from our team",
                        "/complaints",
                        FiAlertCircle,
                        "red",
                      ],
                    ]
                  : [
                      ...(isReception
                        ? [[
                            "In-person booking",
                            "Book a workspace for a walk-in customer",
                            "/in-person-booking",
                            FiPlus,
                            "blue",
                          ]]
                        : []),
                      [
                        "Mark attendance",
                        "Review today’s attendance",
                        "/attendance",
                        FiCalendar,
                        "blue",
                      ],
                      [
                        "Apply for leave",
                        "Submit a leave request",
                        "/leave",
                        FiFileText,
                        "purple",
                      ],
                      [
                        "View payroll",
                        "Review your payslips",
                        "/payroll",
                        FiCreditCard,
                        "green",
                      ],
                    ]
                ).map(([title, desc, path, Icon, color]) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => router.push(path)}
                    className="quick-action"
                  >
                    <div className={`quick-action-icon ${color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="quick-action-copy">
                      <strong className="quick-action-title">{title}</strong>
                      <span className="quick-action-desc">{desc}</span>
                    </div>
                    <FiArrowRight className="quick-arrow" />
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
      <div className="personal-note">
        <FiShield size={16} /> Your authenticated session is active.
      </div>
    </>
  );
}

async function loadPersonalApiData(user, isCustomer) {
  const requests = isCustomer
    ? [
      ['bookings', 'bookings', () => api.bookings.list()],
      ['agreements', 'agreements', () => api.agreements.list()],
      ['invoices', 'invoices', () => api.invoices.list()],
      ['complaints', 'complaints', () => api.complaints.list()],
    ]
    : [
      ['attendance', 'attendance', () => api.attendance.list()],
      ['leaves', 'leave requests', () => api.leaves.list()],
      ['payroll', 'payroll', () => api.payroll.list()],
    ];
  const data = { bookings: [], agreements: [], invoices: [], complaints: [], attendance: [], leaves: [], payroll: [] };
  const errors = [];
  await Promise.all(requests.map(async ([key, label, request]) => {
    try {
      const response = await request();
      const records = getApiCollection(response);
      data[key] = records.map((record) => normalizePersonalRecord(key, record));
    } catch (error) {
      console.error(`Could not load personal ${label}:`, error);
      errors.push(`${label}: ${getApiErrorMessage(error, 'could not be loaded.')}`);
    }
  }));
  return { data, errors };
}

function normalizePersonalRecord(type, record) {
  if (!record || typeof record !== 'object') return record;
  if (type !== 'attendance') return record;
  const clockIn = record.clockIn || record.checkIn || record.check_in;
  const clockOut = record.clockOut || record.checkOut || record.check_out || null;
  const rawDate = record.date || record.workDate || record.work_date || clockIn;
  const date = toIsoDateString(rawDate);
  return {
    ...record,
    id: record.id || record._id,
    email: record.email || record.employeeEmail || record.employee_email || record.user?.email || record.employee?.email,
    date,
    clockIn,
    clockOut,
  };
}

function belongsToUser(record, user) {
  const email = user.email.toLowerCase();
  const identifiers = [
    record.email,
    record.customerEmail,
    record.customer_email,
    record.user?.email,
    record.customer?.email,
    record.employee?.email,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  if (identifiers.length) return identifiers.includes(email);
  const userId = String(user.id || '');
  const relatedIds = [record.userId, record.customerId, record.employeeId, record.user?.id, record.customer?.id, record.employee?.id].filter(Boolean).map(String);
  return !relatedIds.length || (userId && relatedIds.includes(userId));
}

function formatMoney(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}
