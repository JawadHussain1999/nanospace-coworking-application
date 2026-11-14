import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Badge, Button, Card, Form, FormGroup, Input, Label, Modal, ModalBody, ModalHeader, Spinner } from 'reactstrap';
import { FiEdit2, FiPlus, FiUserCheck, FiShield, FiTrash2 } from 'react-icons/fi';
import DataTable from '../shared/DataTable';
import UserAvatar from '../shared/UserAvatar';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import { BRANCHES } from '../../data/mockData';
import { ROLE_LABELS } from '../../utils/permissions';
import { useAuth } from '../../context/AuthContext';
import { addUserAccount, updateUserAccount, deleteUserAccount } from '../../store/slices/userAccountsSlice';
import { showSuccess, showError } from '../../utils/toast';
import { api, getApiCollection, getApiErrorMessage, isApiEnabled, normalizeApiUser } from '../../services/api';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS);
const EMPTY_ACCOUNT = { name: '', email: '', role: 'employee', branch: BRANCHES[0], status: 'Active' };

export default function UserAccountsManagement({ user: propUser } = {}) {
  const auth = useAuth();
  const user = propUser || auth?.user;
  const dispatch = useDispatch();
  const localAccounts = useSelector((state) => state?.userAccounts) || [];
  const [apiAccounts, setApiAccounts] = useState([]);
  const [loading, setLoading] = useState(isApiEnabled);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [notice, setNotice] = useState('');
  const [accountToDelete, setAccountToDelete] = useState(null);

  const rawAccounts = isApiEnabled ? apiAccounts : localAccounts;
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : [];

  const refreshAccounts = async () => {
    try {
      const response = await api.users.list();
      setApiAccounts(normalizeAccounts(getApiCollection(response)));
    } catch (e) {
      console.error('Could not refresh accounts:', e);
    }
  };

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    api.users.list()
      .then((response) => {
        if (active) setApiAccounts(normalizeAccounts(getApiCollection(response)));
      })
      .catch((error) => {
        console.error('Could not load users:', error);
        if (active) setNotice(getApiErrorMessage(error, 'Users could not be loaded.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const openAdd = () => {
    setEditingEmail(null);
    setForm(EMPTY_ACCOUNT);
    setModalOpen(true);
  };

  const openEdit = (account) => {
    if (!account) return;
    setEditingEmail(account.email);
    setForm({ ...account });
    setModalOpen(true);
  };

  const promptDelete = (account) => {
    if (!account) return;
    setAccountToDelete(account);
  };

  const confirmDelete = async () => {
    if (!accountToDelete) return;
    const target = accountToDelete;
    setBusy(true);
    setNotice('');
    try {
      if (isApiEnabled) {
        await api.users.delete(target.id);
        await refreshAccounts();
      } else {
        dispatch(deleteUserAccount(target.id || target.email));
      }
      const msg = `User account "${target.name || target.email}" deleted successfully.`;
      setNotice(msg);
      showSuccess(msg);
      setAccountToDelete(null);
    } catch (error) {
      console.error('Could not delete user account:', error);
      const errMsg = getApiErrorMessage(error, 'User account could not be deleted.');
      setNotice(errMsg);
      showError(errMsg);
    } finally {
      setBusy(false);
    }
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    const email = (form.email || '').trim().toLowerCase();
    const duplicate = accounts.some((account) => account?.email?.toLowerCase() === email && account?.email !== editingEmail);
    if (!form.name?.trim() || !email || duplicate) {
      const errMsg = duplicate ? 'An account with this email already exists.' : 'Enter a name and a valid email address.';
      setNotice(errMsg);
      showError(errMsg);
      return;
    }
    const account = {
      ...form,
      name: form.name.trim(),
      email,
      branch: form.role === 'super_admin' ? 'All branches' : form.branch,
    };

    if (isApiEnabled) {
      setBusy(true);
      try {
        if (editingEmail) {
          await api.users.update(form.id, {
            fullName: account.name,
            email: account.email,
            role: account.role,
            branch: account.branch,
            status: account.status,
          });
          setNotice('User account and role updated successfully.');
          showSuccess('User account and role updated successfully.');
        } else {
          const response = await api.users.create(account);
          const emailStatus = response?.data?.welcomeEmail;
          const createdMessage = emailStatus?.sent
            ? 'User account created. Welcome email sent with the user ID and a secure password-setup link.'
            : emailStatus?.simulated
              ? 'User account created. Email delivery is simulated in this environment; configure SMTP to send the welcome email.'
              : 'User account created, but the welcome email could not be delivered. Check SMTP settings and resend password instructions.';
          setNotice(createdMessage);
          showSuccess(createdMessage);
        }
        await refreshAccounts();
        setModalOpen(false);
      } catch (error) {
        console.error('Could not save user account:', error);
        const _usrErr = getApiErrorMessage(error, 'User account could not be saved.');
        setNotice(_usrErr);
        showError(_usrErr);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (editingEmail) {
      dispatch(updateUserAccount({ previousEmail: editingEmail, account }));
      setNotice('User account updated.');
      showSuccess('User account updated successfully.');
    } else {
      dispatch(addUserAccount(account));
      setNotice('User account added. Demo users share the password shown on the sign-in page.');
      showSuccess('User account added successfully.');
    }
    setModalOpen(false);
  };

  const toggleStatus = async (account) => {
    if (!account) return;
    const nextStatus = account.status === 'Active' ? 'Inactive' : 'Active';
    if (isApiEnabled) {
      setBusy(true);
      setNotice('');
      try {
        await api.users.updateStatus(account.id, nextStatus);
        await refreshAccounts();
        showSuccess(`User account ${nextStatus === 'Active' ? 'activated' : 'deactivated'}.`);
      } catch (error) {
        console.error('Could not update user status:', error);
        const _stErr = getApiErrorMessage(error, 'User status could not be updated.');
        setNotice(_stErr);
        showError(_stErr);
      } finally {
        setBusy(false);
      }
      return;
    }
    dispatch(updateUserAccount({
      previousEmail: account.email,
      account: { ...account, status: nextStatus },
    }));
    showSuccess(`User account ${nextStatus === 'Active' ? 'activated' : 'deactivated'}.`);
  };

  const isSuperAdmin = String(user?.role || '').toLowerCase() === 'super_admin';

  const columns = [
    {
      key: 'name',
      label: 'User',
      render: (_, a) => (
        <div className="d-flex align-items-center gap-2">
          <UserAvatar user={a} size={30} />
          <strong>{a?.name || a?.full_name || 'Unnamed User'}</strong>
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (v, a) => v || a?.email || '—' },
    {
      key: 'role',
      label: 'Role',
      render: (v, a) => {
        const roleKey = String(v || a?.role || '').toLowerCase();
        return (
          <Badge color={roleKey === 'super_admin' ? 'danger' : roleKey === 'branch_admin' ? 'primary' : roleKey === 'reception_admin' ? 'info' : roleKey === 'employee' ? 'success' : 'secondary'} pill>
            {ROLE_LABELS[roleKey] || v || a?.role || '—'}
          </Badge>
        );
      },
    },
    { key: 'branch', label: 'Branch', render: (v, a) => v || a?.branch || 'All branches' },
    {
      key: 'status',
      label: 'Status',
      render: (v, a) => {
        const st = v || a?.status || 'Active';
        return <Badge color={st === 'Active' ? 'success' : 'secondary'} pill>{st}</Badge>;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, account) => {
        if (!account) return null;
        const isSelf = Boolean(
          user && account && (
            (user.email && account.email && String(user.email).toLowerCase() === String(account.email).toLowerCase()) ||
            (user.id && account.id && String(user.id) === String(account.id))
          )
        );
        return (
          <div className="text-nowrap d-flex gap-2">
            {(isSuperAdmin || !isApiEnabled) && (
              <Button color="light" size="sm" onClick={() => openEdit(account)}>
                <FiEdit2 className="me-1" />Edit
              </Button>
            )}
            <Button color={account.status === 'Active' ? 'light' : 'success'} size="sm" disabled={busy} onClick={() => toggleStatus(account)}>
              <FiUserCheck className="me-1" />{account.status === 'Active' ? 'Deactivate' : 'Activate'}
            </Button>
            {isSuperAdmin && (
              <Button
                color="light"
                size="sm"
                className="text-danger"
                disabled={busy || isSelf}
                title={isSelf ? 'Cannot delete your own account' : 'Delete user account'}
                onClick={() => promptDelete(account)}
              >
                <FiTrash2 />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="user-accounts-management">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">NANOSPACE / SETTINGS</div>
          <h2>Users & roles</h2>
          <p>Manage user accounts, change role access and configure branch assignments.</p>
        </div>
        {isSuperAdmin && (
          <Button color="primary" className="btn-primary-custom" onClick={openAdd}>
            <FiPlus className="me-2" />Add user
          </Button>
        )}
      </div>
      {notice && <Alert color={notice.toLowerCase().includes('could not') ? 'danger' : 'info'} toggle={() => setNotice('')}>{notice}</Alert>}
      <Card className="panel-card border-0">
        <div className="panel-toolbar">
          <div>
            <h3>User accounts</h3>
            <p>{accounts.length} accounts • {isSuperAdmin ? 'Super Admin can edit roles and assignments' : 'Read-only role access'}</p>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading users...</div>
        ) : (
          <DataTable columns={columns} rows={accounts} rowKey="email" pageSize={10} emptyMessage="No user accounts found." />
        )}
      </Card>

      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} centered size="lg">
        <ModalHeader toggle={() => setModalOpen(false)}>
          {editingEmail ? 'Edit user account & role' : 'Add user account'}
        </ModalHeader>
        <ModalBody>
          {isSuperAdmin && editingEmail && (
            <Alert color="primary" className="py-2 small mb-3">
              <FiShield className="me-1" />
              As <strong>Super Admin</strong>, you can change this user&apos;s role, branch, and access privileges.
            </Alert>
          )}
          <Form onSubmit={saveAccount} className="modal-compact-form">
            <FormGroup>
              <Label for="account-name">Full name</Label>
              <Input
                id="account-name"
                required
                maxLength="100"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label for="account-email">Email</Label>
              <Input
                id="account-email"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label for="account-role">
                Role {isSuperAdmin ? <Badge color="primary" className="ms-1">Super Admin Editable</Badge> : null}
              </Label>
              <Input
                id="account-role"
                type="select"
                value={form.role}
                disabled={!isSuperAdmin}
                onChange={(event) => {
                  const role = event.target.value;
                  setForm({
                    ...form,
                    role,
                    branch: role === 'super_admin' ? 'All branches' : form.branch === 'All branches' ? BRANCHES[0] : form.branch,
                  });
                }}
              >
                {ROLE_OPTIONS.map(([role, label]) => (
                  <option key={role} value={role}>{label}</option>
                ))}
              </Input>
            </FormGroup>
            {form.role !== 'super_admin' && (
              <FormGroup>
                <Label for="account-branch">Branch assignment</Label>
                <Input
                  id="account-branch"
                  type="select"
                  value={form.branch}
                  disabled={!isSuperAdmin}
                  onChange={(event) => setForm({ ...form, branch: event.target.value })}
                >
                  {BRANCHES.map((branch) => (
                    <option key={branch}>{branch}</option>
                  ))}
                </Input>
              </FormGroup>
            )}
            <FormGroup>
              <Label for="account-status">Status</Label>
              <Input
                id="account-status"
                type="select"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option>Active</option>
                <option>Inactive</option>
              </Input>
            </FormGroup>
            <div className="modal-compact-form-actions d-flex justify-content-end gap-2 mt-4">
              <Button color="light" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button color="primary" className="btn-primary-custom" type="submit" disabled={busy}>
                {busy ? <Spinner size="sm" className="me-2" /> : null}
                {editingEmail ? 'Save changes' : 'Add account'}
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      {Boolean(accountToDelete) && (
        <DeleteConfirmModal
          isOpen={Boolean(accountToDelete)}
          toggle={() => setAccountToDelete(null)}
          onConfirm={confirmDelete}
          title="Delete User Account"
          message={`Are you sure you want to delete user "${accountToDelete?.name || accountToDelete?.email}"? This action cannot be undone.`}
          confirmText="Delete User"
          cancelText="Cancel"
          busy={busy}
        />
      )}
    </div>
  );
}

function normalizeAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts
    .map((account) => {
      try {
        const normalized = normalizeApiUser(account);
        return {
          ...normalized,
          branch: normalized.branch || 'All branches',
        };
      } catch (e) {
        console.warn('Skipping invalid user account profile:', account, e);
        return null;
      }
    })
    .filter(Boolean);
}
