import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Col, Form, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from 'reactstrap';
import { api, getApiCollection, getApiErrorMessage } from '../../services/api';
import { showError, showSuccess } from '../../utils/toast';

const emptyForm = {
  branchId: '',
  customerId: '',
  workspaceId: '',
  inventoryItemId: '',
  startsAt: '',
  endsAt: '',
  seatCount: 1,
  total: '',
  advanceAmount: 0,
  paymentMethod: 'CASH',
  notes: '',
};

const asId = (record) => String(record?.id || record?._id || '');
const branchIdOf = (record) => String(record?.branch_id || record?.branchId || '');
const workspaceTypeLabel = (value) => String(value || 'Workspace').replace(/_/g, ' ').toLowerCase();
const getPlanSeatCount = (plan) => {
  const match = String(`${plan?.name || ''} ${plan?.description || ''}`).match(/(\d+)[ -]*seater/i);
  return match ? Number(match[1]) : null;
};

export default function ExistingBookingModal({ isOpen, onClose, onSaved, user, selectedBranch }) {
  const [branches, setBranches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    let active = true;
    Promise.all([
      api.branches.list(),
      api.customers.list(),
      api.workspaces.list(),
      api.inventory.list(),
    ]).then(([branchResponse, customerResponse, workspaceResponse, inventoryResponse]) => {
      if (!active) return;
      const branchRows = getApiCollection(branchResponse);
      const availableBranches = isSuperAdmin
        ? branchRows
        : branchRows.filter((item) => asId(item) === String(user?.branchId || user?.branch_id || '') ||
          String(item.name || '').toLowerCase() === String(user?.branch || '').toLowerCase());
      const firstBranch = availableBranches.find((item) =>
        String(item.name || '').toLowerCase() === String(selectedBranch || '').toLowerCase()
      ) || availableBranches[0];
      setBranches(availableBranches);
      setCustomers(getApiCollection(customerResponse));
      setWorkspaces(getApiCollection(workspaceResponse));
      setInventory(getApiCollection(inventoryResponse));
      setForm((current) => ({ ...current, branchId: asId(firstBranch) }));
      if (!availableBranches.length) setLoadError('No branch is available for recording a booking.');
    }).catch((error) => {
      console.error('Could not load options for existing booking entry:', error);
      if (active) setLoadError(getApiErrorMessage(error, 'Booking entry options could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [isSuperAdmin, selectedBranch, user?.branch, user?.branchId, user?.branch_id]);

  const branch = branches.find((item) => asId(item) === form.branchId);
  const branchCustomers = useMemo(() => customers.filter((customer) =>
    !form.branchId || branchIdOf(customer) === form.branchId
  ), [customers, form.branchId]);
  const branchWorkspaces = useMemo(() => workspaces.filter((workspace) =>
    (!form.branchId || branchIdOf(workspace) === form.branchId) &&
    workspace.is_active !== false &&
    workspace.layout_published !== false
  ), [form.branchId, workspaces]);
  const selectedWorkspace = branchWorkspaces.find((workspace) => asId(workspace) === form.workspaceId);
  const bookingPlans = useMemo(() => {
    const activeInventory = inventory.filter((item) =>
      item.is_active !== false && !/parking/i.test(String(item.name || ''))
    );
    return activeInventory.filter((item) => item.sellable !== false).sort((first, second) => {
      const linkedId = String(selectedWorkspace?.inventory_item_id || '');
      return Number(asId(second) === linkedId) - Number(asId(first) === linkedId);
    });
  }, [inventory, selectedWorkspace]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setNotice('');
  };

  const changeBranch = (branchId) => {
    setForm((current) => ({
      ...emptyForm,
      branchId,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      notes: current.notes,
    }));
    setErrors({});
  };

  const changeWorkspace = (workspaceId) => {
    const workspace = branchWorkspaces.find((item) => asId(item) === workspaceId);
    const plan = inventory.find((item) => asId(item) === String(workspace?.inventory_item_id || ''));
    const isWholeRoom = /CONFERENCE|MEETING|BOARDROOM/i.test(String(workspace?.workspace_type || ''));
    const planSeats = getPlanSeatCount(plan);
    setForm((current) => ({
      ...current,
      workspaceId,
      inventoryItemId: plan ? asId(plan) : '',
      seatCount: isWholeRoom ? Number(workspace?.capacity) || 1 : planSeats || 1,
      total: plan ? String(plan.rate ?? '') : '',
    }));
    setErrors((current) => ({ ...current, workspaceId: '', inventoryItemId: '' }));
  };

  const changePlan = (inventoryItemId) => {
    const plan = inventory.find((item) => asId(item) === inventoryItemId);
    const planSeats = getPlanSeatCount(plan);
    setForm((current) => ({
      ...current,
      inventoryItemId,
      seatCount: planSeats || current.seatCount,
      total: plan ? String(plan.rate ?? '') : current.total,
    }));
    setErrors((current) => ({ ...current, inventoryItemId: '' }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const validation = {};
    if (!form.branchId) validation.branchId = 'Select a branch.';
    if (!form.customerId) validation.customerId = 'Select an existing customer.';
    if (!form.workspaceId) validation.workspaceId = 'Select a workspace.';
    if (!form.inventoryItemId) validation.inventoryItemId = 'Select a workspace plan.';
    if (!form.startsAt || !Number.isFinite(Date.parse(form.startsAt))) validation.startsAt = 'Enter a valid start date and time.';
    if (!form.endsAt || !Number.isFinite(Date.parse(form.endsAt)) ||
      Date.parse(form.endsAt) <= Date.parse(form.startsAt)) validation.endsAt = 'End date and time must be after the start.';
    if (!Number.isInteger(Number(form.seatCount)) || Number(form.seatCount) < 1) validation.seatCount = 'Enter at least one seat.';
    if (!Number.isFinite(Number(form.total)) || Number(form.total) < 0) validation.total = 'Enter a valid total amount.';
    if (!Number.isFinite(Number(form.advanceAmount)) || Number(form.advanceAmount) < 0 ||
      Number(form.advanceAmount) > Number(form.total)) validation.advanceAmount = 'Advance must be between ₹0 and the total amount.';
    if (Object.values(validation).some(Boolean)) {
      setErrors(validation);
      return;
    }

    setSaving(true);
    setNotice('');
    setErrors({});
    try {
      await api.bookings.create({
        branchId: form.branchId,
        branch: branch?.name,
        customerId: form.customerId,
        workspaceId: form.workspaceId,
        inventoryItemId: form.inventoryItemId,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        seatCount: Number(form.seatCount),
        quantity: 1,
        total: Number(form.total),
        advanceAmount: Number(form.advanceAmount),
        advancePaymentStatus: 'PAID',
        paymentMethod: form.paymentMethod,
        status: 'CONFIRMED',
        isExistingRecord: true,
        bookingCategory: /CONFERENCE|MEETING|BOARDROOM/i.test(String(selectedWorkspace?.workspace_type || ''))
          ? 'meeting'
          : undefined,
        notes: form.notes.trim() || 'Existing booking record entered into NanoSpace.',
      });
      showSuccess('Existing booking saved successfully.');
      await onSaved?.();
      onClose();
    } catch (error) {
      console.error('Could not save existing booking:', error);
      const message = getApiErrorMessage(error, 'Existing booking could not be saved.');
      setNotice(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={() => !saving && onClose()} centered size="lg">
      <Form onSubmit={submit} noValidate>
        <ModalHeader toggle={() => !saving && onClose()}>Record existing booking</ModalHeader>
        <ModalBody>
          <p className="text-muted small">
            Enter a booking that already exists at the branch. Its advance will be recorded as received.
          </p>
          {loadError && <Alert color="danger">{loadError}</Alert>}
          {notice && <Alert color="danger">{notice}</Alert>}
          {loading ? (
            <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading branch, customer, workspace, and plan options…</div>
          ) : (
            <Row>
              {isSuperAdmin && (
                <Col md="6">
                  <FormGroup>
                    <Label for="existing-booking-branch">Branch</Label>
                    <Input
                      id="existing-booking-branch"
                      type="select"
                      value={form.branchId}
                      invalid={Boolean(errors.branchId)}
                      onChange={(event) => changeBranch(event.target.value)}
                    >
                      <option value="">Select branch</option>
                      {branches.map((item) => <option key={asId(item)} value={asId(item)}>{item.name}</option>)}
                    </Input>
                    {errors.branchId && <FormFeedback>{errors.branchId}</FormFeedback>}
                  </FormGroup>
                </Col>
              )}
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-customer">Existing customer</Label>
                  <Input
                    id="existing-booking-customer"
                    type="select"
                    value={form.customerId}
                    invalid={Boolean(errors.customerId)}
                    onChange={(event) => updateForm('customerId', event.target.value)}
                  >
                    <option value="">Select customer</option>
                    {branchCustomers.map((customer) => {
                      const customerName = customer.full_name || customer.name || 'Customer';
                      const company = customer.company_name || customer.companyName || '';
                      const details = [company, customer.email].filter(Boolean).join(' · ');
                      return <option key={asId(customer)} value={asId(customer)}>{customerName}{details ? ` — ${details}` : ''}</option>;
                    })}
                  </Input>
                  {errors.customerId && <FormFeedback>{errors.customerId}</FormFeedback>}
                  {!loading && form.branchId && !branchCustomers.length && <small className="text-danger">No existing customers found for this branch.</small>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-workspace">Workspace / private room</Label>
                  <Input
                    id="existing-booking-workspace"
                    type="select"
                    value={form.workspaceId}
                    invalid={Boolean(errors.workspaceId)}
                    onChange={(event) => changeWorkspace(event.target.value)}
                  >
                    <option value="">Select workspace</option>
                    {branchWorkspaces.map((workspace) => (
                      <option key={asId(workspace)} value={asId(workspace)}>
                        {[workspace.code, workspace.name, workspaceTypeLabel(workspace.workspace_type), `${workspace.capacity || 1} seats`].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </Input>
                  {errors.workspaceId && <FormFeedback>{errors.workspaceId}</FormFeedback>}
                  {!loading && form.branchId && !branchWorkspaces.length && <small className="text-danger">No active published workspaces found for this branch.</small>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-plan">Selected plan</Label>
                  <Input
                    id="existing-booking-plan"
                    type="select"
                    value={form.inventoryItemId}
                    invalid={Boolean(errors.inventoryItemId)}
                    onChange={(event) => changePlan(event.target.value)}
                  >
                    <option value="">Select plan</option>
                    {bookingPlans.map((plan) => <option key={asId(plan)} value={asId(plan)}>{plan.name} — ₹{Number(plan.rate || 0).toLocaleString('en-IN')}</option>)}
                  </Input>
                  {errors.inventoryItemId && <FormFeedback>{errors.inventoryItemId}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-start">From date and time</Label>
                  <Input id="existing-booking-start" type="datetime-local" value={form.startsAt} invalid={Boolean(errors.startsAt)} onChange={(event) => updateForm('startsAt', event.target.value)} />
                  {errors.startsAt && <FormFeedback>{errors.startsAt}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-end">To date and time</Label>
                  <Input id="existing-booking-end" type="datetime-local" value={form.endsAt} invalid={Boolean(errors.endsAt)} onChange={(event) => updateForm('endsAt', event.target.value)} />
                  {errors.endsAt && <FormFeedback>{errors.endsAt}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-seats">Seats booked</Label>
                  <Input id="existing-booking-seats" type="number" min="1" step="1" value={form.seatCount} invalid={Boolean(errors.seatCount)} onChange={(event) => updateForm('seatCount', event.target.value)} />
                  {errors.seatCount && <FormFeedback>{errors.seatCount}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-total">Total booking amount (₹)</Label>
                  <Input id="existing-booking-total" type="number" min="0" step="0.01" value={form.total} invalid={Boolean(errors.total)} onChange={(event) => updateForm('total', event.target.value)} />
                  {errors.total && <FormFeedback>{errors.total}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-advance">Advance already received (₹)</Label>
                  <Input id="existing-booking-advance" type="number" min="0" step="0.01" value={form.advanceAmount} invalid={Boolean(errors.advanceAmount)} onChange={(event) => updateForm('advanceAmount', event.target.value)} />
                  {errors.advanceAmount && <FormFeedback>{errors.advanceAmount}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="existing-booking-payment-method">Advance payment method</Label>
                  <Input id="existing-booking-payment-method" type="select" value={form.paymentMethod} onChange={(event) => updateForm('paymentMethod', event.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online / UPI</option>
                  </Input>
                </FormGroup>
              </Col>
              <Col xs="12">
                <FormGroup className="mb-0">
                  <Label for="existing-booking-notes">Notes (optional)</Label>
                  <Input id="existing-booking-notes" type="textarea" rows="2" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} />
                </FormGroup>
              </Col>
            </Row>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" type="button" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button color="primary" className="btn-primary-custom" type="submit" disabled={loading || saving || Boolean(loadError)}>
            {saving ? <><Spinner size="sm" className="me-2" />Saving booking…</> : 'Save existing booking'}
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  );
}
