import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Badge, Button, Card, Form, FormGroup, Input, Label, Modal, ModalBody, ModalHeader, Spinner } from 'reactstrap';
import { FiEdit2, FiPlus, FiSearch } from 'react-icons/fi';
import DataTable from '../shared/DataTable';
import { addInventoryItem, hydrateInventory, updateInventoryItem } from '../../store/slices/inventorySlice';
import { showSuccess, showError } from '../../utils/toast';
import { api, getApiCollection, getApiErrorMessage, isApiEnabled, normalizeInventoryItem } from '../../services/api';

const emptyItem = { name: '', description: '', rate: '', unit: 'month', type: 'Service', status: 'Active' };
const money = (rate) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(Number(rate) || 0);

const normalizeInventoryCollection = (response) => {
  const records = getApiCollection(response);
  const normalized = records.map(normalizeInventoryItem);
  const items = normalized.filter(Boolean);
  return {
    items,
    skipped: normalized.length - items.length,
  };
};

export default function InventoryManagement({ user }) {
  const dispatch = useDispatch();
  const items = useSelector((state) => state.inventory);
  const canManage = user.role === 'super_admin';
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(isApiEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    dispatch(hydrateInventory([]));
    api.inventory.list()
      .then((result) => {
        const { items: normalizedItems, skipped } = normalizeInventoryCollection(result);
        if (active) {
          dispatch(hydrateInventory(normalizedItems));
          setNotice(skipped ? `${skipped} inventory record${skipped === 1 ? ' was' : 's were'} skipped because the API record is missing an ID, price, or billing unit.` : '');
        }
      })
      .catch((error) => {
        console.error('Could not load inventory from API:', error);
        if (active) setNotice(getApiErrorMessage(error, 'Inventory could not be loaded from the API.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [dispatch]);

  const filteredItems = useMemo(() => items.filter((item) =>
    `${item.name} ${item.description} ${item.id} ${item.unit}`.toLowerCase().includes(query.toLowerCase())
  ), [items, query]);

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyItem);
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setForm({ ...item, rate: String(item.rate) });
    setModalOpen(true);
  };

  const saveItem = async (event) => {
    event.preventDefault();
    const rate = Number(form.rate);
    if (!form.name.trim() || !Number.isFinite(rate) || rate < 0) {
      setNotice('Enter an item name and a valid price of zero or more.');
      return;
    }

    const item = { ...form, ...(editingId ? { id: editingId } : {}), name: form.name.trim(), rate };
    if (isApiEnabled) {
      setBusy(true);
      try {
        if (editingId) await api.inventory.update(editingId, item);
        else await api.inventory.create(item);
        const refreshed = await api.inventory.list();
        const { items: normalizedItems, skipped } = normalizeInventoryCollection(refreshed);
        dispatch(hydrateInventory(normalizedItems));
        setNotice(skipped
          ? `${editingId ? 'Inventory item updated' : 'Inventory item added'}, but ${skipped} invalid API record${skipped === 1 ? ' was' : 's were'} skipped.`
          : editingId ? 'Inventory item updated.' : 'Inventory item added.');
        setModalOpen(false);
      } catch (error) {
        console.error('Could not save inventory item:', error);
        const _invErr = getApiErrorMessage(error, 'Inventory item could not be saved.'); setNotice(_invErr); showError(_invErr);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (editingId) dispatch(updateInventoryItem(item));
    else dispatch(addInventoryItem({ ...item, id: `INV-${Date.now()}` }));
    const _invMsg = editingId ? 'Inventory item updated.' : 'Inventory item added.'; setNotice(_invMsg); showSuccess(_invMsg);
    setModalOpen(false);
  };

  const columns = [
    {
      key: 'name',
      label: 'Item',
      render: (_, item) => (
        <>
          <strong>{item.name}</strong>
          <small className="inventory-item-id d-block">{item.id}</small>
        </>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (v) => <span className="inventory-description">{v}</span>,
    },
    {
      key: 'rate',
      label: 'Price',
      render: (v) => <span className="text-nowrap fw-semibold">{money(v)}</span>,
    },
    { key: 'unit', label: 'Unit' },
    { key: 'type', label: 'Type' },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <Badge color={v === 'Active' ? 'success' : 'secondary'} pill>{v}</Badge>,
    },
    ...(canManage ? [{
      key: 'actions',
      label: 'Actions',
      render: (_, item) => (
        <Button color="light" size="sm" className="inventory-edit-button" onClick={() => openEditModal(item)} aria-label={`Edit ${item.name}`}>
          <FiEdit2 className="me-1" />Edit
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="inventory-management">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">NANOSPACE / WORKSPACE</div>
          <h2>Inventory</h2>
          <p>{canManage ? 'Manage workspace offerings and shared rates from one place.' : 'View the shared workspace offerings and rates available for your branch.'}</p>
        </div>
          {canManage && <Button color="primary" className="btn-primary-custom" onClick={openAddModal}>
          <FiPlus className="me-2" />Add inventory item
          </Button>}
      </div>

      {notice && <Alert color={notice.toLowerCase().includes('could not') ? 'danger' : notice.toLowerCase().includes('skipped') ? 'warning' : 'success'} toggle={() => setNotice('')}>{notice}</Alert>}

      <Card className="panel-card border-0">
        <div className="panel-toolbar inventory-toolbar">
          <div>
            <h3>Inventory catalogue</h3>
            <p>{items.length} items</p>
          </div>
          <div className="table-search">
            <FiSearch size={16} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory..."
              bsSize="sm"
              aria-label="Search inventory"
            />
          </div>
        </div>
        {loading ? (
          <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading inventory...</div>
        ) : (
          <DataTable
            columns={columns}
            rows={filteredItems}
            rowKey="id"
            pageSize={10}
            emptyMessage="No inventory items match your search."
            itemLabel="items"
          />
        )}
      </Card>

      {canManage && <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} centered size="lg">
        <ModalHeader toggle={() => setModalOpen(false)}>{editingId ? 'Edit inventory item' : 'Add inventory item'}</ModalHeader>
        <ModalBody>
          <Form onSubmit={saveItem} className="modal-compact-form inventory-compact-form">
            <FormGroup>
              <Label for="inventory-name">Item name</Label>
              <Input id="inventory-name" required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Meeting room" />
            </FormGroup>
            <FormGroup>
              <Label for="inventory-description">Description</Label>
              <Input id="inventory-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe this workspace or service" />
            </FormGroup>
            <FormGroup>
              <Label for="inventory-rate">Price (₹)</Label>
              <Input id="inventory-rate" type="number" min="0" step="0.01" required value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} />
            </FormGroup>
            <FormGroup>
              <Label for="inventory-unit">Billing unit</Label>
              <Input id="inventory-unit" required maxLength="30" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="day, month, session..." />
            </FormGroup>
            <FormGroup>
              <Label for="inventory-type">Type</Label>
              <Input id="inventory-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} />
            </FormGroup>
            <FormGroup>
              <Label for="inventory-status">Status</Label>
              <Input id="inventory-status" type="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </Input>
            </FormGroup>
            <div className="modal-compact-form-actions d-flex justify-content-end gap-2">
              <Button color="light" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button color="primary" className="btn-primary-custom" type="submit" disabled={busy}>{busy ? <Spinner size="sm" className="me-2" /> : null}{editingId ? 'Save changes' : 'Add item'}</Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>}
    </div>
  );
}
