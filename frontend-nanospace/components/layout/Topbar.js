import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  FiMenu,
  FiBell,
  FiChevronDown,
  FiLogOut,
  FiUser,
  FiClock,
  FiCalendar,
  FiCamera,
  FiUpload,
  FiTrash2,
} from 'react-icons/fi';
import {
  Alert,
  Badge,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  Spinner,
} from 'reactstrap';
import { ROLE_LABELS } from '../../utils/permissions';
import { api, getApiCollection, getApiErrorMessage, getApiPayload, isApiEnabled } from '../../services/api';
import UserAvatar from '../shared/UserAvatar';
import { showSuccess, showError } from '../../utils/toast';

export function TopbarLiveClock() {
  const [time, setTime] = useState(null);

  useEffect(() => {
    setTime(new Date());
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!time) {
    return (
      <div className="topbar-clock-pill">
        <div className="topbar-clock-live-badge">
          <span className="live-dot-pulse" />
          <span className="live-text-tag">LIVE</span>
        </div>
        <div className="topbar-clock-digits">
          <FiClock className="topbar-clock-icon" size={14} />
          <span>--:--:-- --</span>
        </div>
      </div>
    );
  }

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="topbar-clock-pill" title="Current system time (12-hour format)">
      <div className="topbar-clock-live-badge">
        <span className="live-dot-pulse" />
        <span className="live-text-tag">LIVE</span>
      </div>
      <div className="topbar-clock-digits">
        <FiClock className="topbar-clock-icon" size={14} />
        <span>{timeStr}</span>
      </div>
      <span className="topbar-clock-sep">•</span>
      <div className="topbar-clock-calendar">
        <FiCalendar className="topbar-calendar-icon" size={13} />
        <span>{dateStr}</span>
      </div>
    </div>
  );
}

export default function Topbar({ user, onMenu, onLogout, onSaveProfile }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    avatar: user?.avatar || user?.avatarUrl || null,
  });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState('');
  const [notificationsLoading, setNotificationsLoading] = useState(isApiEnabled);
  const [apiHealth, setApiHealth] = useState('checking');
  const [notificationDetail, setNotificationDetail] = useState(null);
  const router = useRouter();
  const pathSegment = router.asPath.split(/[?#]/)[0].split('/')[1] || 'dashboard';
  const title = pathSegment.replace(/-/g, ' ').replace(/^./, (character) => character.toUpperCase());
  const unreadCount = notifications.filter((notification) => !notification.read && !notification.isRead).length;

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;

    api.health()
      .then(() => { if (active) setApiHealth('connected'); })
      .catch((error) => {
        console.error('NanoSpace API health check failed:', error);
        if (active) setApiHealth('unavailable');
      });

    const loadNotifications = async (isBackgroundPoll = false) => {
      try {
        const response = await api.notifications.list();
        if (!active) return;
        const rawList = getApiCollection(response);
        const mapped = rawList.map((notification) => ({
          ...notification,
          id: notification.id || notification._id,
          read: Boolean(notification.read_at || notification.read || notification.isRead),
          createdAt: notification.created_at || notification.createdAt,
        }));

        if (isBackgroundPoll) {
          setNotifications((prev) => {
            const prevIds = new Set(prev.map((n) => n.id));
            const newOnes = mapped.filter((n) => !prevIds.has(n.id) && !n.read);
            if (newOnes.length > 0) {
              const newest = newOnes[0];
              showSuccess(`🔔 ${newest.title || 'New Booking Alert'}`);
            }
            return mapped;
          });
        } else {
          setNotifications(mapped);
        }
      } catch (error) {
        if (!isBackgroundPoll) {
          console.error('Could not load notifications:', error);
          if (active) setNotificationError(getApiErrorMessage(error, 'Notifications could not be loaded.'));
        }
      } finally {
        if (active && !isBackgroundPoll) setNotificationsLoading(false);
      }
    };

    loadNotifications(false);

    // Auto-poll every 12 seconds so Super Admin and Branch Admin see bookings live
    const pollTimer = setInterval(() => {
      loadNotifications(true);
    }, 12000);

    return () => {
      active = false;
      clearInterval(pollTimer);
    };
  }, [user?.id]);

  const openProfile = () => {
    setProfile({
      name: user?.name || '',
      email: user?.email || '',
      avatar: user?.avatar || user?.avatarUrl || null,
    });
    setProfileError('');
    setProfileModalOpen(true);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Please select a valid image file (PNG, JPG, WEBP, GIF).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('Image size must be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setProfile((prev) => ({ ...prev, avatar: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setProfile((prev) => ({ ...prev, avatar: null }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      const res = await onSaveProfile(profile);
      if (res && res.ok === false) {
        const msg = res.message || 'Could not save profile changes.';
        setProfileError(msg);
        showError(msg);
        return;
      }
      showSuccess('Profile updated successfully!');
      setProfileModalOpen(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      const msg = getApiErrorMessage(err, 'Failed to update profile.');
      setProfileError(msg);
      showError(msg);
    } finally {
      setProfileSaving(false);
    }
  };

  const markNotificationRead = async (notification) => {
    if (!isApiEnabled || notification.read) return;
    try {
      await api.notifications.markRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    } catch (error) {
      console.error('Could not mark notification as read:', error);
      setNotificationError(getApiErrorMessage(error, 'Notification could not be updated.'));
    }
  };

  const showNotificationDetail = async (notification) => {
    if (!isApiEnabled) {
      setNotificationDetail(notification);
      return;
    }
    try {
      setNotificationDetail(getApiPayload(await api.notifications.detail(notification.id)));
    } catch (error) {
      console.error('Could not load notification details:', error);
      setNotificationError(getApiErrorMessage(error, 'Notification details could not be loaded.'));
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (error) {
      console.error('Could not mark notifications as read:', error);
      setNotificationError(getApiErrorMessage(error, 'Notifications could not be updated.'));
    }
  };

  const deleteNotification = async (notification) => {
    try {
      await api.notifications.remove(notification.id);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
    } catch (error) {
      console.error('Could not delete notification:', error);
      setNotificationError(getApiErrorMessage(error, 'Notification could not be deleted.'));
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation"><FiMenu size={21} /></button>
        <div className="topbar-heading">
          <h1>{title}</h1>
          <span>Welcome back, {user?.name?.split(' ')[0] || 'User'} 👋</span>
        </div>

        <div className="topbar-actions">
          <div className="topbar-timings">
            <TopbarLiveClock />
          </div>
          <Dropdown isOpen={notificationsOpen} toggle={() => setNotificationsOpen(!notificationsOpen)}>
            <DropdownToggle tag="button" className="icon-button notification-button" aria-label="Notifications">
              <FiBell size={18} />
              {unreadCount > 0 && <i className="unread-dot" />}
            </DropdownToggle>
            <DropdownMenu end className="shadow-lg border-0 notification-menu p-0">
              <div className="px-3 py-2 fw-semibold d-flex align-items-center justify-content-between border-bottom">
                <span className="d-flex align-items-center gap-2">
                  <FiBell size={15} className="text-primary" />
                  <span>Notifications</span>
                  {unreadCount > 0 && <Badge color="danger" pill style={{ fontSize: '10px' }}>{unreadCount} new</Badge>}
                </span>
                {isApiEnabled && unreadCount > 0 && (
                  <Button color="link" size="sm" className="p-0 text-decoration-none small" onClick={markAllNotificationsRead}>
                    Mark all read
                  </Button>
                )}
              </div>
              <div className="notification-list-scroll">
                {notificationError && <div className="px-3 py-2 small text-danger">{notificationError}</div>}
                {notificationsLoading && <div className="px-3 py-3 text-center small text-muted"><Spinner size="sm" className="me-2" />Loading notifications...</div>}
                {isApiEnabled && notifications.map((notification) => {
                  const isBooking = (notification.title || '').toLowerCase().includes('booking');
                  const notifDateStr = notification.createdAt
                    ? new Date(notification.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '';

                  return (
                    <div
                      key={notification.id}
                      className={`notification-item-card p-3 border-bottom ${!notification.read ? 'unread-bg' : ''}`}
                    >
                      <div className="d-flex align-items-start justify-content-between gap-2 mb-1">
                        <strong className="notification-card-title text-dark">
                          {isBooking ? '📋 ' : ''}{notification.title || notification.subject || 'Notification'}
                        </strong>
                        {!notification.read && <Badge color="primary" pill style={{ fontSize: '9.5px', padding: '2px 6px' }}>New</Badge>}
                      </div>
                      <div className="small text-muted notification-card-message mb-2" style={{ whiteSpace: 'pre-line', fontSize: '12px', lineHeight: 1.45 }}>
                        {notification.message || notification.body}
                      </div>
                      <div className="d-flex align-items-center justify-content-between mt-2 pt-1 border-top border-light">
                        {notifDateStr && (
                          <span className="d-inline-flex align-items-center gap-1 text-primary fw-medium" style={{ fontSize: '11px' }}>
                            <FiClock size={12} />
                            <span>{notifDateStr}</span>
                          </span>
                        )}
                        <div className="d-flex align-items-center gap-2">
                          {isBooking && (
                            <Button
                              color="link"
                              size="sm"
                              className="p-0 text-decoration-none small fw-semibold text-primary"
                              onClick={() => {
                                markNotificationRead(notification);
                                router.push('/bookings');
                              }}
                            >
                              Open Bookings →
                            </Button>
                          )}
                          <Button
                            color="link"
                            size="sm"
                            className="p-0 text-decoration-none text-muted small"
                            onClick={() => deleteNotification(notification)}
                            title="Dismiss notification"
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isApiEnabled && !notificationsLoading && !notifications.length && (
                  <div className="px-3 py-4 small text-muted text-center">
                    <FiBell size={24} className="d-block mx-auto mb-2 opacity-50" />
                    No notifications yet. When a booking is made, Super Admin and Branch Admin will be notified here with date and time.
                  </div>
                )}
                {!isApiEnabled && (
                  <>
                    <DropdownItem onClick={() => router.push('/reminders')}><strong>Payment reminders</strong><div className="small text-muted">Open payment reminders</div></DropdownItem>
                    <DropdownItem onClick={() => router.push('/bookings')}><strong>Bookings</strong><div className="small text-muted">Review workspace reservations</div></DropdownItem>
                  </>
                )}
              </div>
            </DropdownMenu>
          </Dropdown>
          <div className="topbar-divider" />
          <Dropdown isOpen={profileOpen} toggle={() => setProfileOpen(!profileOpen)}>
            <DropdownToggle tag="button" className="profile-toggle">
              <UserAvatar user={user} size={36} className="profile-avatar-topbar" />
              <span className="profile-info"><strong>{user?.name || 'Admin'}</strong><small>{ROLE_LABELS[user?.role] || user?.role}</small></span>
              <FiChevronDown size={14} className="profile-chevron" />
            </DropdownToggle>
            <DropdownMenu end className="shadow-lg border-0 profile-menu-dropdown">
              <DropdownItem onClick={openProfile}><FiUser className="me-2" />My profile</DropdownItem>
              <DropdownItem divider />
              <DropdownItem onClick={onLogout} className="text-danger"><FiLogOut className="me-2" />Sign out</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </header>

      {/* My Profile Modal with Optional Picture Upload & Drawback Picture */}
      <Modal isOpen={profileModalOpen} toggle={() => !profileSaving && setProfileModalOpen(false)} centered>
        <ModalHeader toggle={() => !profileSaving && setProfileModalOpen(false)}>My Profile</ModalHeader>
        <ModalBody>
          {profileError && <Alert color="danger" className="mb-3">{profileError}</Alert>}
          <Form onSubmit={saveProfile}>
            {/* Profile Avatar Upload / Preview */}
            <div className="profile-avatar-upload-card text-center mb-4">
              <div className="profile-avatar-frame position-relative d-inline-block">
                <UserAvatar
                  src={profile.avatar}
                  name={profile.name}
                  size={92}
                  className="profile-modal-avatar"
                />
                <label
                  htmlFor="profile-avatar-file-input"
                  className="profile-avatar-cam-badge"
                  title="Upload profile picture"
                >
                  <FiCamera size={15} />
                </label>
                <input
                  id="profile-avatar-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="d-none"
                  onChange={handleAvatarChange}
                />
              </div>

              <div className="d-flex align-items-center justify-content-center gap-2 mt-3">
                <label
                  htmlFor="profile-avatar-file-input"
                  className="btn btn-sm btn-outline-primary mb-0 cursor-pointer d-inline-flex align-items-center gap-1"
                >
                  <FiUpload size={13} />
                  <span>{profile.avatar ? 'Change photo' : 'Upload photo'}</span>
                </label>
                {profile.avatar && (
                  <Button
                    color="light"
                    size="sm"
                    type="button"
                    className="text-danger border d-inline-flex align-items-center gap-1"
                    onClick={handleRemoveAvatar}
                    title="Remove custom photo and use default profile picture"
                  >
                    <FiTrash2 size={13} />
                    <span>Remove</span>
                  </Button>
                )}
              </div>

              <div className="profile-avatar-caption mt-2">
                {profile.avatar ? (
                  <span className="text-success fw-medium">✓ Custom photo uploaded</span>
                ) : (
                  <span className="text-muted">Upload optional — default picture shown</span>
                )}
              </div>
            </div>

            <FormGroup>
              <Label for="profile-name">Full name</Label>
              <Input
                id="profile-name"
                required
                maxLength="100"
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                placeholder="Enter your full name"
              />
            </FormGroup>
            <FormGroup>
              <Label for="profile-email">Email address</Label>
              <Input
                id="profile-email"
                type="email"
                required
                value={profile.email}
                onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                placeholder="Enter your email"
              />
            </FormGroup>
            <FormGroup>
              <Label>Role</Label>
              <Input value={ROLE_LABELS[user.role] || user.role} disabled />
            </FormGroup>
            <FormGroup>
              <Label>Branch</Label>
              <Input value={user.branch || 'All branches'} disabled />
            </FormGroup>
            <div className="d-flex justify-content-end gap-2 mt-4">
              <Button color="light" type="button" disabled={profileSaving} onClick={() => setProfileModalOpen(false)}>
                Cancel
              </Button>
              <Button color="primary" className="btn-primary-custom" type="submit" disabled={profileSaving}>
                {profileSaving ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    Saving...
                  </>
                ) : (
                  'Save profile'
                )}
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      <Modal isOpen={Boolean(notificationDetail)} toggle={() => setNotificationDetail(null)} centered>
        <ModalHeader toggle={() => setNotificationDetail(null)}>Notification details</ModalHeader>
        <ModalBody><pre className="small mb-0" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(notificationDetail, null, 2)}</pre></ModalBody>
      </Modal>
    </>
  );
}
