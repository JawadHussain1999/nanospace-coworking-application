import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Badge, Button, Card, CardBody, Col, Row, Spinner, Modal, ModalBody, ModalHeader } from 'reactstrap';
import { FiClock, FiLogIn, FiLogOut, FiUsers, FiEye, FiEdit2 } from 'react-icons/fi';
import DataTable from '../shared/DataTable';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import { showSuccess, showError } from '../../utils/toast';
import StatMetricCard from '../shared/StatMetricCard';
import { clockIn, clockOut } from '../../store/slices/attendanceSlice';
import { api, getApiCollection, getApiErrorMessage, getApiPayload, isApiEnabled } from '../../services/api';

const toIsoDateString = (val) => {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  : '—';

const formatDuration = (entry) => {
  if (!entry.clockOut) return 'In progress';
  const minutes = Math.max(0, Math.floor((new Date(entry.clockOut) - new Date(entry.clockIn)) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function AttendanceManagement({ user }) {
  const [apiEntries, setApiEntries] = useState([]);
  const [loading, setLoading] = useState(isApiEnabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [apiSummary, setApiSummary] = useState(null);
  const [detailEntry, setDetailEntry] = useState(null);
  const [checkoutEntry, setCheckoutEntry] = useState(null);
  const entries = apiEntries;

  const refreshAttendance = async () => {
    try {
      setApiEntries(getApiCollection(await api.attendance.list()).map(normalizeAttendance));
    } catch (e) {
      console.error('Could not refresh attendance:', e);
    }
  };

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    api.attendance.list()
      .then((result) => {
        if (active) {
          const list = getApiCollection(result).map(normalizeAttendance);
          setApiEntries(list);
        }
      })
      .catch((error) => {
        console.error('Could not load attendance:', error);
        if (active) setNotice(getApiErrorMessage(error, 'Attendance could not be loaded.'));
      })
      .finally(() => { if (active) setLoading(false); });
    api.attendance.summary()
      .then((result) => { if (active) setApiSummary(getApiPayload(result)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const today = getToday();
  const todayEntry = entries.find((entry) => 
    (entry.email?.toLowerCase() === user.email?.toLowerCase() || entry.userId === user.id) &&
    (entry.date === today || (!entry.clockOut && entry.clockIn))
  );

  const visibleEntries = useMemo(() => entries.filter((entry) =>
    (user.role === 'super_admin' || entry.branch === user.branch) &&
    (user.role !== 'employee' || entry.email === user.email)
  ), [entries, user.branch, user.email, user.role]);

  const startShift = async () => {
    if (todayEntry && !todayEntry.clockOut) {
      showError("You are already clocked in for an active shift.");
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await api.attendance.checkIn({ branch: user.branch, date: today });
      await refreshAttendance();
      setNotice('Shift started. Clock-in successfully recorded.');
      showSuccess('Shift started! Clock-in successfully recorded.');
    } catch (error) {
      console.error('Could not clock in:', error);
      const _ciErr = getApiErrorMessage(error, 'Clock-in could not be recorded.');
      setNotice(_ciErr);
      showError(_ciErr);
    } finally {
      setBusy(false);
    }
  };

  const endShift = async () => {
    if (!todayEntry || todayEntry.clockOut) return;
    setBusy(true);
    setNotice('');
    try {
      await api.attendance.checkOut({ id: todayEntry.id, date: today });
      await refreshAttendance();
      setNotice('Shift ended. Clock-out successfully recorded.');
      showSuccess('Shift ended! Clock-out successfully recorded.');
    } catch (error) {
      console.error('Could not clock out:', error);
      const _coErr = getApiErrorMessage(error, 'Clock-out could not be recorded.');
      setNotice(_coErr);
      showError(_coErr);
    } finally {
      setBusy(false);
    }
  };

  const showAttendanceDetail = async (entry) => {
    if (!isApiEnabled) {
      setDetailEntry(entry);
      return;
    }
    setBusy(true);
    try {
      setDetailEntry(getApiPayload(await api.attendance.detail(entry.id)));
    } catch (error) {
      console.error('Could not load attendance details:', error);
      setNotice(getApiErrorMessage(error, 'Attendance details could not be loaded.'));
    } finally {
      setBusy(false);
    }
  };

  const promptAttendanceCheckout = (entry) => setCheckoutEntry(entry);

  const confirmAttendanceCheckout = async () => {
    if (!checkoutEntry) return;
    const entry = checkoutEntry;
    setBusy(true);
    setNotice('');
    try {
      await api.attendance.update(entry.id, {
        [entry.checkIn !== undefined ? 'checkIn' : 'clockIn']: entry.clockIn,
        [entry.checkOut !== undefined ? 'checkOut' : 'clockOut']: new Date().toISOString(),
      });
      await refreshAttendance();
      setNotice('Attendance record updated.');
      showSuccess('Attendance record updated successfully.');
      setCheckoutEntry(null);
    } catch (error) {
      console.error('Could not update attendance record:', error);
      const _attErr = getApiErrorMessage(error, 'Attendance record could not be updated.');
      setNotice(_attErr);
      showError(_attErr);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Employee' },
    { key: 'branch', label: 'Branch' },
    { key: 'date', label: 'Date' },
    { key: 'clockIn', label: 'Clock in', render: (value) => formatTime(value) },
    { key: 'clockOut', label: 'Clock out', render: (value) => formatTime(value) },
    { key: 'duration', label: 'Hours', render: (_, row) => formatDuration(row) },
    { key: 'status', label: 'Status', render: (_, row) => <Badge color={row.clockOut ? 'secondary' : 'success'} pill>{row.clockOut ? 'Completed' : 'On shift'}</Badge> },
    ...(isApiEnabled ? [{
      key: 'actions', label: 'Actions', render: (_, row) => <div className="d-flex gap-2">
        <Button color="light" size="sm" disabled={busy} onClick={() => showAttendanceDetail(row)} aria-label={`View attendance for ${row.name}`}><FiEye /></Button>
        {['super_admin', 'branch_admin'].includes(user.role) && !row.clockOut && <Button color="light" size="sm" disabled={busy} onClick={() => promptAttendanceCheckout(row)} aria-label={`Edit attendance for ${row.name}`}><FiEdit2 /></Button>}
      </div>,
    }] : []),
  ];

  return (
    <div className="attendance-management">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">NANOSPACE / PEOPLE</div>
          <h2>Attendance</h2>
          <p>Record your shift and review attendance entries in your access scope.</p>
        </div>
        {user.role === 'employee' && (
          <div className="heading-actions">
            {!todayEntry
              ? <Button color="primary" className="btn-primary-custom" disabled={busy} onClick={startShift}>{busy ? <Spinner size="sm" className="me-2" /> : <FiLogIn className="me-2" />}Clock in</Button>
              : !todayEntry.clockOut
                ? <Button color="danger" disabled={busy} onClick={endShift}>{busy ? <Spinner size="sm" className="me-2" /> : <FiLogOut className="me-2" />}Clock out</Button>
                : <Badge color="success" pill className="p-2">Shift completed</Badge>}
          </div>
        )}
      </div>

      {notice && <Alert color="danger" toggle={() => setNotice('')}>{notice}</Alert>}
      <Row className="g-3 mb-4">
        <Col sm="6" xl="4">
          <StatMetricCard
            icon={FiClock}
            label="Today's status"
            value={todayEntry ? (todayEntry.clockOut ? 'Clocked out' : 'On shift') : 'Not clocked in'}
            hint={todayEntry ? 'Recorded entry' : 'Awaiting clock-in'}
            tone={todayEntry ? (todayEntry.clockOut ? 'blue' : 'green') : 'orange'}
          />
        </Col>
        <Col sm="6" xl="4">
          <StatMetricCard
            icon={FiLogIn}
            label="Clock in"
            value={todayEntry ? formatTime(todayEntry.clockIn) : '—'}
            hint={todayEntry?.clockIn ? 'Shift start time' : 'No time recorded'}
            tone="blue"
          />
        </Col>
        <Col sm="6" xl="4">
          <StatMetricCard
            icon={FiUsers}
            label="Attendance records"
            value={apiSummary?.totalRecords ?? apiSummary?.total ?? apiSummary?.count ?? visibleEntries.length}
            hint={apiSummary ? 'Summary count' : 'In this view'}
            tone="purple"
          />
        </Col>
      </Row>

      {user.role === 'employee' && !todayEntry && <Alert color="info">Clock in when your shift starts. Clock out once at the end of your workday.</Alert>}
      {user.role === 'employee' && todayEntry && !todayEntry.clockOut && <Alert color="success">Your shift started at {formatTime(todayEntry.clockIn)}. Clock out to finish today&apos;s attendance entry.</Alert>}

      <Card className="panel-card border-0">
        <div className="panel-toolbar">
          <div>
            <h3>Attendance history</h3>
            <p>{visibleEntries.length} records</p>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading attendance...</div>
        ) : (
          <DataTable columns={columns} rows={visibleEntries} rowKey="id" emptyMessage="No attendance records yet." pageSize={10} />
        )}
      </Card>
      <Modal isOpen={Boolean(detailEntry)} toggle={() => setDetailEntry(null)} centered>
        <ModalHeader toggle={() => setDetailEntry(null)}>Attendance record details</ModalHeader>
        <ModalBody><pre className="small mb-0" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(detailEntry, null, 2)}</pre></ModalBody>
      </Modal>
      <DeleteConfirmModal
        isOpen={Boolean(checkoutEntry)}
        toggle={() => setCheckoutEntry(null)}
        onConfirm={confirmAttendanceCheckout}
        title="Record Employee Clock-Out"
        message={`Do you want to record clock-out for ${checkoutEntry?.name || 'this employee'}?`}
        confirmText="Confirm Clock-out"
        cancelText="Cancel"
        busy={busy}
      />
    </div>
  );
}

function normalizeAttendance(entry) {
  const clockIn = entry.clockIn || entry.checkIn || entry.check_in || '';
  const clockOut = entry.clockOut || entry.checkOut || entry.check_out || null;
  const rawDate = entry.date || entry.workDate || entry.work_date || clockIn;
  const date = toIsoDateString(rawDate);
  return {
    ...entry,
    id: entry.id || entry._id || `${entry.email || entry.employeeEmail}-${date}`,
    email: entry.email || entry.employeeEmail || entry.employee_email || entry.user?.email || entry.employee?.email,
    name: entry.name || entry.employeeName || entry.employee?.name || entry.user?.name || entry.email,
    branch: entry.branch?.name || entry.branch || entry.branchName || entry.branch_name,
    date,
    clockIn,
    clockOut,
  };
}
