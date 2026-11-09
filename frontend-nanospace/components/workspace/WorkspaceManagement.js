import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/router';
import { Alert, Badge, Button, Card, CardBody, Col, Input, Row, Form, FormGroup, Label, Modal, ModalBody, ModalHeader } from 'reactstrap';
import { FiActivity, FiEdit2, FiGrid, FiPlus } from 'react-icons/fi';
import DataTable, { StatusBadge } from '../shared/DataTable';
import WorkspaceFloorMap from './WorkspaceFloorMap';
import StatMetricCard from '../shared/StatMetricCard';
import { branchFloors, demoCustomers, PARKING_INVENTORY_ID } from '../../data/inventory';
import { addBooking } from '../../store/slices/workspaceSlice';
import { hydrateInventory } from '../../store/slices/inventorySlice';
import { showSuccess, showError } from '../../utils/toast';
import { api, getApiCollection, getApiErrorMessage, getApiPayload, isApiEnabled, normalizeApiCustomer, normalizeInventoryItem } from '../../services/api';

export default function WorkspaceManagement({ user }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const inventory = useSelector((state) => state.inventory);
  const localBranches = user.role === 'super_admin' ? Object.keys(branchFloors) : [user.branch || 'Nanakramguda'];
  const [apiBranches, setApiBranches] = useState([]);
  const [apiBranchFloorCounts, setApiBranchFloorCounts] = useState({});
  const [apiWorkspaces, setApiWorkspaces] = useState([]);
  const branches = isApiEnabled && apiBranches.length
    ? (user.role === 'super_admin' ? apiBranches : apiBranches.filter((branch) => branch === user.branch))
    : localBranches;

  const [activeTab, setActiveTab] = useState('floor_map');
  const validBranches = branches.filter((b) => b && b !== 'All Branches');
  const firstWorkspaceBranch = apiWorkspaces.find((workspace) =>
    workspace.branch_name || workspace.branch?.name || workspace.branch
  );
  const defaultBranch = (!user.branch || user.branch === 'All Branches')
    ? (firstWorkspaceBranch?.branch_name || firstWorkspaceBranch?.branch?.name || firstWorkspaceBranch?.branch || validBranches[0] || 'Nanakramguda')
    : user.branch;
  const activeBranch = defaultBranch;
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [itemId, setItemId] = useState('');
  const [includeParking, setIncludeParking] = useState(false);
  const [notice, setNotice] = useState('');
  const [apiCustomers, setApiCustomers] = useState([]);
  const [apiBusy, setApiBusy] = useState(false);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState({});
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [workspaceForm, setWorkspaceForm] = useState({ name: '', branch: user.branch || 'Nanakramguda', floor: 'Ground Floor', type: 'HOT_DESK', capacity: 1, status: 'AVAILABLE' });
  const activeInventory = inventory.filter((item) => item.status === 'Active');
  const parkingItem = activeInventory.find((item) => item.id === PARKING_INVENTORY_ID);
  const bookableInventory = activeInventory.filter((item) => item.id !== PARKING_INVENTORY_ID);
  const selectedBranch = selectedSeat?.branch || activeBranch || branches[0];
  const visibleApiWorkspaces = apiWorkspaces.filter((workspace) => {
    const workspaceBranch = workspace.branch?.name || workspace.branch || workspace.branchName;
    return user.role === 'super_admin' || workspaceBranch === user.branch;
  });
  const apiFloorCount = new Set(visibleApiWorkspaces.map((workspace) => workspace.floor).filter(Boolean)).size;
  const apiCapacity = visibleApiWorkspaces.reduce((total, workspace) =>
    total + (Number.parseFloat(workspace.capacity) || 1), 0);
  const canManageWorkspaces = ['super_admin', 'branch_admin'].includes(user.role);
  const customerSource = isApiEnabled ? apiCustomers : demoCustomers;
  const customers = customerSource.filter((customer) =>
    user.role === 'super_admin' || customer.branch === selectedBranch
  );

  const loadWorkspaceData = useCallback(async () => {
    if (!isApiEnabled) return;
    dispatch(hydrateInventory([]));
    try {
      const [workspaceResponse, customerResponse, inventoryResponse] = await Promise.all([
        api.workspaces.list((user.role === 'super_admin' || user.branch === 'All Branches') ? undefined : { branch: user.branch }),
        api.customers.list((user.role === 'super_admin' || user.branch === 'All Branches') ? undefined : { branch: user.branch }),
        api.inventory.list(),
      ]);
      const branchResponse = await api.branches.list((user.role === 'super_admin' || user.branch === 'All Branches') ? undefined : { branch: user.branch });
      const branchRecords = getApiCollection(branchResponse);
      setApiWorkspaces(getApiCollection(workspaceResponse));
      setApiBranches(branchRecords.map((branch) =>
        branch.name || branch.branchName || branch.branch_name
      ).filter((b) => b && b !== 'All Branches'));
      setApiBranchFloorCounts(Object.fromEntries(branchRecords.map((branch) => [
        branch.name || branch.branchName || branch.branch_name,
        Number(branch.floorCount ?? branch.floor_count) || 1
      ])));
      setApiCustomers(getApiCollection(customerResponse).map(normalizeApiCustomer));
      dispatch(hydrateInventory(getApiCollection(inventoryResponse).map(normalizeInventoryItem)));
    } catch (error) {
      console.error('Could not load workspace booking data:', error);
      setNotice(getApiErrorMessage(error, 'Workspace data could not be loaded.'));
    }
  }, [dispatch, user.branch, user.role]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const reserveSeat = async () => {
    const customer = customers.find((entry) => entry.id === customerId);
    const item = bookableInventory.find((entry) => entry.id === itemId);
    if (!selectedSeat || !customer || !item) {
      setNotice('Select an available seat, customer and active inventory rate before creating a booking.');
      return;
    }
    if (selectedSeat.status !== 'Available') {
      const msg = `Workspace "${selectedSeat.code || selectedSeat.name || selectedSeat.id}" is ${String(selectedSeat.status).toUpperCase()} and cannot be booked.`;
      setNotice(msg);
      showError(msg);
      return;
    }
    const parkingIncluded = includeParking && Boolean(parkingItem);
    const parkingFee = parkingIncluded ? Number(parkingItem.rate) || 0 : 0;
    const booking = {
      branch: selectedSeat.branch,
      date: localDateKey(),
      customerId: customer.id,
      customerName: customer.name,
      email: customer.email,
      phone: customer.phone,
      itemId: item.id,
      itemName: item.name,
      unitPrice: item.rate,
      quantity: 1,
      total: item.rate + parkingFee,
      parkingIncluded,
      parkingFee,
      parkingItemId: parkingIncluded ? parkingItem.id : null,
      parkingItemName: parkingIncluded ? parkingItem.name : null,
      workspaceId: selectedSeat.dbId || selectedSeat.id,
      seat: selectedSeat.code || selectedSeat.id,
      floor: selectedSeat.floor,
      bookingType: 'Workspace seat',
      status: 'Confirmed',
      source: 'Workspace management',
    };
    if (isApiEnabled) {
      setApiBusy(true);
      try {
        await api.bookings.create(booking);
        const seatLabel = selectedSeat.name || selectedSeat.code || selectedSeat.id;
        setNotice(`Seat ${seatLabel} reserved for ${customer.name}.`);
        showSuccess(`Seat ${seatLabel} reserved successfully!`);
        setSelectedSeat(null);
        setCustomerId('');
        setItemId('');
        setIncludeParking(false);
        await loadWorkspaceData();
      } catch (error) {
        console.error('Could not reserve workspace:', error);
        const err = getApiErrorMessage(error, 'Workspace could not be reserved.');
        setNotice(err);
        showError(err);
      } finally {
        setApiBusy(false);
      }
      return;
    }
    dispatch(addBooking(booking));
    setNotice(`Seat ${selectedSeat.id} reserved for ${customer.name}.`);
    setSelectedSeat(null);
    setCustomerId('');
    setItemId('');
    setIncludeParking(false);
  };

  const openWorkspaceForm = (workspace) => {
    setEditingWorkspaceId(workspace?.id || workspace?._id || null);
    setWorkspaceForm(workspace ? {
      name: workspace.name || workspace.workspaceName || '',
      branch: workspace.branch?.name || workspace.branch || workspace.branch_name || user.branch || branches[0] || '',
      floor: workspace.floor || 'Ground Floor',
      type: workspace.workspace_type || workspace.workspaceType || workspace.type || workspace.kind || 'HOT_DESK',
      capacity: workspace.capacity ?? 1,
      status: String(workspace.status || 'AVAILABLE').toUpperCase(),
    } : {
      name: '',
      branch: user.branch || branches[0] || '',
      floor: 'Ground Floor',
      type: 'HOT_DESK',
      capacity: 1,
      status: 'AVAILABLE',
    });
    setWorkspaceModalOpen(true);
  };

  const saveWorkspace = async (event) => {
    event.preventDefault();
    const capacity = Number(workspaceForm.capacity);
    if (!workspaceForm.name.trim() || !Number.isInteger(capacity) || capacity < 1) {
      setNotice('Enter a workspace name and a whole-number capacity greater than zero.');
      return;
    }
    setApiBusy(true);
    setNotice('');
    try {
      const payload = { ...workspaceForm, name: workspaceForm.name.trim(), capacity };
      if (editingWorkspaceId) await api.workspaces.update(editingWorkspaceId, payload);
      else await api.workspaces.create(payload);
      const response = await api.workspaces.list(user.role === 'super_admin' ? undefined : { branch: user.branch });
      setApiWorkspaces(getApiCollection(response));
      setWorkspaceModalOpen(false);
      setNotice(editingWorkspaceId ? 'Workspace updated.' : 'Workspace added.');
    } catch (error) {
      console.error('Could not save workspace:', error);
      setNotice(getApiErrorMessage(error, 'Workspace could not be saved.'));
    } finally {
      setApiBusy(false);
    }
  };

  const saveFloorLayout = async ({ branch, floor, objects, publish = false }) => {
    const changes = Object.entries(layoutDraft);
    setLayoutSaving(true);
    const positionResults = await Promise.allSettled(changes.map(([workspaceId, position]) =>
      api.workspaces.update(workspaceId, { layoutX: position.x, layoutY: position.y })
    ));
    const failedIds = changes
      .filter((_, index) => positionResults[index].status === 'rejected')
      .map(([workspaceId]) => workspaceId);
    let objectSaveError;
    let savedFloorLayout;
    try {
      savedFloorLayout = await api.workspaces.saveLayoutDraft({ branch, floor, objects, publish });
    } catch (error) {
      console.error('Could not save floor objects:', error);
      objectSaveError = error;
    }

    let refreshError;
    try {
      const response = await api.workspaces.list(user.role === 'super_admin' ? undefined : { branch: user.branch });
      setApiWorkspaces(getApiCollection(response));
    } catch (error) {
      console.error('Could not refresh workspaces after saving layout:', error);
      refreshError = error;
    }

    if (refreshError) {
      const message = `Layout updates were sent, but the workspace list could not be refreshed: ${getApiErrorMessage(refreshError, 'Refresh failed.')}`;
      setNotice(message);
      showError(message);
      setLayoutSaving(false);
      return false;
    }

    if (failedIds.length || objectSaveError) {
      setLayoutDraft((current) => Object.fromEntries(
        Object.entries(current).filter(([workspaceId]) => failedIds.includes(workspaceId))
      ));
      const message = objectSaveError
        ? `Workspace positions were saved, but floor objects could not be saved: ${getApiErrorMessage(objectSaveError, 'Save failed.')}`
        : `${positionResults.length - failedIds.length} workspace position(s) saved; ${failedIds.length} could not be saved. Retry to save the remaining positions.`;
      setNotice(message);
      showError(message);
      setLayoutSaving(false);
      return false;
    }

    setLayoutDraft({});
    setLayoutEditing(false);
    setNotice('Layout saved and ready to publish for bookings.');
    showSuccess('Layout saved and ready to publish for bookings.');
    setLayoutSaving(false);
    return { hasDraft: Boolean(getApiPayload(savedFloorLayout)?.hasDraft) };
  };

  const publishFloorLayout = async ({ branch, floor }) => {
    setLayoutSaving(true);
    try {
      await api.workspaces.publishLayout({ branch, floor });
    } catch (error) {
      console.error('Could not publish floor layout:', error);
      const message = getApiErrorMessage(error, 'Floor layout could not be published.');
      setNotice(message);
      showError(message);
      setLayoutSaving(false);
      return;
    }

    try {
      const response = await api.workspaces.list(
        user.role === 'super_admin' || user.branch === 'All Branches' ? undefined : { branch: user.branch }
      );
      setApiWorkspaces(getApiCollection(response));
      const message = `${branch} — ${floor} is now published to bookings.`;
      setNotice(message);
      showSuccess(message);
      return true;
    } catch (error) {
      console.error('Layout was published, but workspace data could not be refreshed:', error);
      const message = `Layout published, but the workspace view could not be refreshed: ${getApiErrorMessage(error, 'Refresh failed.')}`;
      setNotice(message);
      showError(message);
      return false;
    } finally {
      setLayoutSaving(false);
    }
  };

  const cancelFloorLayout = () => {
    setLayoutDraft({});
    setLayoutEditing(false);
  };

  const workspaceColumns = [
    { key: 'name', label: 'Workspace', render: (_, w) => <strong>{w.name || w.workspaceName}</strong> },
    { key: 'branch', label: 'Branch', render: (_, w) => w.branch?.name || w.branch || w.branch_name },
    { key: 'floor', label: 'Floor', render: (v) => v || '—' },
    { key: 'type', label: 'Type', render: (_, w) => w.workspace_type || w.workspaceType || w.type || w.kind || '—' },
    { key: 'capacity', label: 'Capacity', render: (v) => v ?? '—' },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    ...(canManageWorkspaces ? [{
      key: 'actions',
      label: 'Actions',
      render: (_, workspace) => (
        <Button color="light" size="sm" onClick={() => openWorkspaceForm(workspace)} aria-label={`Edit ${workspace.name || 'workspace'}`}><FiEdit2 /></Button>
      ),
    }] : []),
  ];

  return (
    <div className="workspace-management">
      <div className="page-heading-row mb-3">
        <div>
          <div className="eyebrow">NANOSPACE / WORKSPACES</div>
          <h2>Floor Studio</h2>
          <p>Create layouts from scratch for every branch and floor.</p>
        </div>
      </div>

      {notice && <Alert color={notice.startsWith('Seat ') ? 'success' : 'warning'} toggle={() => setNotice('')}>{notice}</Alert>}

      {activeTab === 'floor_map' && (
        <div className="mb-4">
          {canManageWorkspaces && isApiEnabled && (
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div className="text-muted small">
                {layoutEditing
                  ? 'Design the floor layout, arrange elements, and save it for later use.'
                  : 'Create and edit floor layouts for each branch and floor.'}
              </div>
              <div className="d-flex gap-2">
                {layoutEditing ? (
                  <>
                    <Button color="light" onClick={cancelFloorLayout} disabled={layoutSaving}>Cancel</Button>
                  </>
                ) : (
                  <Button color="light" onClick={() => setLayoutEditing(true)}>
                    <FiEdit2 className="me-2" /> Edit layout
                  </Button>
                )}
              </div>
            </div>
          )}
          <WorkspaceFloorMap
            key={`${user.role}-${user.branch || 'all'}-${activeBranch}`}
            initialBranch={activeBranch}
            branches={branches}
            branchFloorCounts={apiBranchFloorCounts}
            workspaceRecords={isApiEnabled ? apiWorkspaces : undefined}
            selectedSeat={selectedSeat?.id}
            layoutEditable={layoutEditing}
            adminLayout={canManageWorkspaces && isApiEnabled}
            publishingLayout={layoutSaving}
            onPublishLayout={publishFloorLayout}
            onSaveLayout={saveFloorLayout}
            layoutOverrides={layoutDraft}
            onLayoutChange={(workspaceId, x, y) => {
              setLayoutDraft((current) => ({ ...current, [workspaceId]: { x, y } }));
            }}
            onSelectSeat={setSelectedSeat}
          />
        </div>
      )}

      {activeTab === 'records' && isApiEnabled && (
        <Card className="panel-card border-0 mt-4">
          <div className="panel-toolbar"><div><h3>Workspace records</h3><p>{visibleApiWorkspaces.length} workspaces.</p></div></div>
          <DataTable
            columns={workspaceColumns}
            rows={visibleApiWorkspaces}
            rowKey={(w) => w.id || w._id || w.name}
            pageSize={10}
            emptyMessage="No workspace records available."
            itemLabel="workspaces"
          />
        </Card>
      )}

      {/* Edit Workspace Modal */}
      {isApiEnabled && canManageWorkspaces && <Modal isOpen={workspaceModalOpen} toggle={() => setWorkspaceModalOpen(false)} centered>
        <ModalHeader toggle={() => setWorkspaceModalOpen(false)}>{editingWorkspaceId ? 'Edit workspace' : 'Add workspace'}</ModalHeader>
        <ModalBody><Form onSubmit={saveWorkspace}>
          <FormGroup><Label for="workspace-name">Workspace name</Label><Input id="workspace-name" required value={workspaceForm.name} onChange={(event) => setWorkspaceForm({ ...workspaceForm, name: event.target.value })} /></FormGroup>
          <FormGroup><Label for="workspace-branch">Branch</Label><Input id="workspace-branch" type="select" required value={workspaceForm.branch} disabled={user.role !== 'super_admin'} onChange={(event) => setWorkspaceForm({ ...workspaceForm, branch: event.target.value, floor: 'Ground Floor' })}>{branches.map((branch) => <option key={branch}>{branch}</option>)}</Input></FormGroup>
          <FormGroup><Label for="workspace-floor">Floor</Label><Input id="workspace-floor" type="select" required value={workspaceForm.floor} onChange={(event) => setWorkspaceForm({ ...workspaceForm, floor: event.target.value })}>{getBranchFloorOptions(workspaceForm.branch, apiBranchFloorCounts, apiWorkspaces, workspaceForm.floor).map((floor) => <option key={floor} value={floor}>{floor}</option>)}</Input></FormGroup>
          <FormGroup><Label for="workspace-type">Type</Label><Input id="workspace-type" value={workspaceForm.type} onChange={(event) => setWorkspaceForm({ ...workspaceForm, type: event.target.value })} /></FormGroup>
          <FormGroup><Label for="workspace-capacity">Capacity</Label><Input id="workspace-capacity" type="number" min="1" step="1" required value={workspaceForm.capacity} onChange={(event) => setWorkspaceForm({ ...workspaceForm, capacity: event.target.value })} /></FormGroup>
          <FormGroup><Label for="workspace-status">Status</Label><Input id="workspace-status" type="select" value={workspaceForm.status} onChange={(event) => setWorkspaceForm({ ...workspaceForm, status: event.target.value })}><option value="AVAILABLE">Available</option><option value="OCCUPIED">Occupied</option><option value="RESERVED">Booked</option><option value="MAINTENANCE">Maintenance</option></Input></FormGroup>
          <div className="d-flex justify-content-end gap-2"><Button color="light" type="button" onClick={() => setWorkspaceModalOpen(false)}>Cancel</Button><Button color="primary" className="btn-primary-custom" type="submit" disabled={apiBusy}>{apiBusy ? 'Saving...' : 'Save workspace'}</Button></div>
        </Form></ModalBody>
      </Modal>}
    </div>
  );
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getBranchFloorOptions(branch, floorCounts, workspaces, selectedFloor) {
  const knownFloors = Object.keys(branchFloors[branch] || {}).length
    ? branchFloors[branch].map((floor) => floor.name)
    : [];
  const floorCount = Number(floorCounts[branch]) || knownFloors.length || 1;
  const ordinalNames = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];
  const generatedFloors = Array.from({ length: floorCount }, (_, index) =>
    knownFloors[index] || ordinalNames[index] || `Floor ${index + 1}`
  );
  const savedFloors = workspaces
    .filter((workspace) => String(workspace.branch_name || workspace.branch?.name || workspace.branch || '').toLowerCase() === branch.toLowerCase())
    .map((workspace) => workspace.floor)
    .filter(Boolean);
  return [...new Set([...generatedFloors, ...savedFloors, ...(selectedFloor ? [selectedFloor] : [])])];
}
