import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row } from 'reactstrap';
import { Controller, useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { FiCalendar, FiMapPin, FiUsers, FiBriefcase, FiCheckCircle, FiArrowRight, FiZap, FiHome, FiHeadphones, FiMonitor, FiCoffee, FiShield, FiClock, FiCreditCard } from 'react-icons/fi';
import WorkspaceFloorMap from '../workspace/WorkspaceFloorMap';
import { branchFloors, PARKING_INVENTORY_ID, inventory as defaultInventory } from '../../data/inventory';
import { addBooking } from '../../store/slices/workspaceSlice';
import { hydrateInventory } from '../../store/slices/inventorySlice';
import { showSuccess, showError } from '../../utils/toast';
import { api, getApiCollection, getApiErrorMessage, getApiPayload, isApiEnabled, normalizeApiCustomer, normalizeInventoryItem } from '../../services/api';

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const today = new Date().toISOString().slice(0, 10);

function loadRazorpayCheckout() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay checkout could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Razorpay checkout could not be loaded.'));
    document.body.appendChild(script);
  });
}

const categoryDefs = [
  { key: 'hot', label: 'Hot Seat', caption: 'Flexible day & month desks', icon: FiZap, match: (i) => /hot|flex|day/i.test(`${i.name} ${i.description}`) },
  { key: 'dedicated', label: 'Dedicated Desk', caption: 'Your assigned workstation', icon: FiMonitor, match: (i) => /dedicated/i.test(`${i.name} ${i.description}`) },
  { key: 'office', label: 'Private Office', caption: 'Team cabins & suites', icon: FiHome, match: (i) => /cabin|office|seater/i.test(`${i.name} ${i.description}`) },
  { key: 'meeting', label: 'Conference Room', caption: 'Equipped meeting spaces', icon: FiUsers, match: (i) => /conference|meeting|boardroom/i.test(`${i.name} ${i.description}`) },
  { key: 'podcast', label: 'Podcast Room', caption: 'Audio & media recording', icon: FiHeadphones, match: (i) => /podcast|studio|record/i.test(`${i.name} ${i.description}`) },
];

export default function BookingExperience({ user }) {
  const dispatch = useDispatch();
  const inventory = useSelector((state) => state.inventory);
  const localBookings = useSelector((state) => state.workspace.bookings);
  const isCustomer = user?.role === 'customer';
  const canChooseBranch = user.role === 'super_admin' || isCustomer;
  const defaultBranch = (user.branch && user.branch.toLowerCase() !== 'all branches')
    ? user.branch
    : user.role === 'super_admin' ? 'Nanakramguda' : 'KPHB';
  const [apiCustomers, setApiCustomers] = useState([]);
  const [apiNotice, setApiNotice] = useState('');
  const [apiBusy, setApiBusy] = useState(false);
  const [catalogueLoading, setCatalogueLoading] = useState(isApiEnabled);
  const [apiAvailableSeatIds, setApiAvailableSeatIds] = useState([]);
  const [apiAvailabilitySpaces, setApiAvailabilitySpaces] = useState([]);
  const [apiAvailabilityContext, setApiAvailabilityContext] = useState('');
  const [apiAvailabilityLoaded, setApiAvailabilityLoaded] = useState(false);
  const [apiBranches, setApiBranches] = useState([]);
  const [apiBranchFloorCounts, setApiBranchFloorCounts] = useState({});
  const [apiWorkspaces, setApiWorkspaces] = useState([]);
  const branchCustomers = useMemo(() => {
    const customers = apiCustomers;
    return (canChooseBranch ? customers : customers.filter((customer) => customer.branch === defaultBranch));
  }, [apiCustomers, canChooseBranch, defaultBranch]);
  const [category, setCategory] = useState('office');
  const [activeStep, setActiveStep] = useState(1);
  const [showAvailability, setShowAvailability] = useState(false);
  const [seat, setSeat] = useState(null);
  const [completedBooking, setCompletedBooking] = useState(null);
  const [demoCheckout, setDemoCheckout] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [seatCount, setSeatCount] = useState(1);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceEdited, setAdvanceEdited] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [confirmingCounterPayment, setConfirmingCounterPayment] = useState(false);
  const [includeParking, setIncludeParking] = useState(false);
  const { register, control, handleSubmit, watch, getValues, setValue, reset, trigger, clearErrors, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      branch: defaultBranch,
      date: today,
      duration: '1',
      customerId: isCustomer ? user.customerId || user.id || '' : '',
      customerName: isCustomer ? user.name || user.full_name || '' : '',
      email: isCustomer ? user.email || '' : '',
      phone: isCustomer ? user.phone || '' : '',
      itemId: '',
      notes: ''
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const values = watch();

  useEffect(() => {
    if (isCustomer) {
      const custName = user.name || user.full_name || user.fullName || '';
      const custEmail = user.email || '';
      const custPhone = user.phone || user.phone_number || user.phoneNumber || '';
      const custId = user.customerId || user.customer_id || user.id || '';
      const custBranch = (user.branch && user.branch.toLowerCase() !== 'all branches') ? user.branch : '';
      if (custName) setValue('customerName', custName, { shouldValidate: true });
      if (custEmail) setValue('email', custEmail, { shouldValidate: true });
      if (custPhone) setValue('phone', custPhone, { shouldValidate: true });
      if (custId) setValue('customerId', custId);
      if (custBranch && !getValues('branch')) setValue('branch', custBranch);
    }
  }, [user, isCustomer, setValue, getValues]);

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    const loadCatalogues = async () => {
      try {
        const inventoryResult = await api.inventory.list();
        const apiItems = getApiCollection(inventoryResult).map(normalizeInventoryItem).filter(Boolean);
        const combined = apiItems.length > 0 ? apiItems : defaultInventory;
        if (active) dispatch(hydrateInventory(combined));
        const [branchResult, workspaceResult] = await Promise.all([
          api.branches.list(canChooseBranch ? undefined : { branch: user.branch }),
          api.workspaces.list(canChooseBranch ? undefined : { branch: user.branch }),
        ]);
        if (active) {
          const branchRecords = getApiCollection(branchResult);
          const branchNames = branchRecords.map((branch) =>
            branch.name || branch.branchName || branch.branch_name
          ).filter(Boolean);
          const workspaceRecords = getApiCollection(workspaceResult);
          setApiBranches(branchNames);
          setApiBranchFloorCounts(Object.fromEntries(branchRecords.map((branch) => [
            branch.name || branch.branchName || branch.branch_name,
            Number(branch.floorCount ?? branch.floor_count) || 1
          ])));
          setApiWorkspaces(workspaceRecords);
          if (canChooseBranch && branchNames.length && !branchNames.includes(getValues('branch'))) {
            setValue('branch', branchNames[0]);
          }
          if (user.role === 'super_admin' && workspaceRecords.length) {
            const currentBranch = getValues('branch');
            const branchHasWorkspaces = workspaceRecords.some((workspace) =>
              String(workspace.branch_name || workspace.branch || '').toLowerCase() === String(currentBranch).toLowerCase()
            );
            if (!branchHasWorkspaces) {
              const firstConfiguredBranch = branchNames.find((branchName) =>
                workspaceRecords.some((workspace) =>
                  String(workspace.branch_name || workspace.branch || '').toLowerCase() === branchName.toLowerCase()
                )
              );
              if (firstConfiguredBranch) setValue('branch', firstConfiguredBranch);
            }
          }
        }
        if (!isCustomer) {
          const customerResult = await api.customers.list(canChooseBranch ? undefined : { branch: user.branch });
          if (active) setApiCustomers(getApiCollection(customerResult).map(normalizeApiCustomer));
        } else {
          try {
            const customerResult = await api.customers.list();
            const list = getApiCollection(customerResult);
            if (active && list.length > 0) {
              const myProfile = normalizeApiCustomer(list[0]);
              if (myProfile.name) setValue('customerName', myProfile.name, { shouldValidate: true });
              if (myProfile.email) setValue('email', myProfile.email, { shouldValidate: true });
              if (myProfile.phone) setValue('phone', myProfile.phone, { shouldValidate: true });
              if (myProfile.id) setValue('customerId', myProfile.id);
              if (myProfile.branch && myProfile.branch.toLowerCase() !== 'all branches' && !getValues('branch')) {
                setValue('branch', myProfile.branch);
              }
            }
          } catch (e) {
            console.warn('Could not load customer profile for auto-fill:', e.message);
          }
        }
      } catch (error) {
        console.error('Could not load booking catalogues:', error);
        if (active) setApiNotice(getApiErrorMessage(error, 'Booking catalogues could not be loaded.'));
      } finally {
        if (active) setCatalogueLoading(false);
      }
    };
    loadCatalogues();
    return () => { active = false; };
  }, [canChooseBranch, dispatch, getValues, setValue, user.branch, user.role]);

  const rawInventory = inventory && inventory.length > 0 ? inventory : defaultInventory;
  const activeInventory = useMemo(() => rawInventory.filter(item => item.status === 'Active'), [rawInventory]);
  const parkingItem = activeInventory.find(item => item.id === PARKING_INVENTORY_ID || /parking/i.test(item.name));
  const bookableInventory = useMemo(() => activeInventory.filter(item => item.id !== PARKING_INVENTORY_ID && !/parking/i.test(item.name)), [activeInventory]);

  // Group items into categories with dynamic keyword matching
  const availableCategories = useMemo(() => {
    return categoryDefs.map((def) => {
      const matchingItems = bookableInventory.filter(def.match);
      const minPrice = matchingItems.length > 0 ? Math.min(...matchingItems.map(i => i.rate)) : null;
      return {
        ...def,
        items: matchingItems,
        minPrice,
      };
    }).filter(c => c.items.length > 0);
  }, [bookableInventory]);

  const activeCategory = availableCategories.find(c => c.key === category) || availableCategories[0] || { items: bookableInventory };
  const selectedBookingCategory = activeCategory.key || category;
  const items = activeCategory.items || [];
  const item = items.find(i => i.id === values.itemId) || items[0] || bookableInventory[0];

  useEffect(() => {
    if (item && values.itemId !== item.id) setValue('itemId', item.id, { shouldValidate: true });
  }, [item, setValue, values.itemId]);

  const baseTotal = item ? item.rate * Math.max(1, Number(quantity) || 1) * (item.unit === 'day' ? Math.max(1, Number(values.duration) || 1) : 1) : 0;
  const parkingIncluded = includeParking && Boolean(parkingItem);
  const parkingFee = parkingIncluded ? Number(parkingItem.rate) || 0 : 0;
  const total = baseTotal + parkingFee;
  useEffect(() => {
    if (!advanceEdited) setAdvanceAmount(Math.round((Number(total) || 0) * 20) / 100);
  }, [total, advanceEdited]);
  const bookingDuration = item?.unit === 'day'
    ? Math.max(1, Number(quantity) || 1)
    : item?.unit === 'month' ? Math.max(1, Number(quantity) || 1) * 30 : 1;
  const selectedCustomer = branchCustomers.find(c => c.id === values.customerId);
  const branchOptions = isApiEnabled && apiBranches.length > 0 ? apiBranches : Object.keys(branchFloors);
  const continueFromService = async () => {
    if (await trigger('itemId')) setActiveStep(2);
  };
  const choosePackage = (packageId) => {
    setValue('itemId', packageId, { shouldValidate: true });
    resetScheduleSelection(1);
  };

  const changeCategory = nextCategory => {
    setCategory(nextCategory);
    setSeatCount(1);
    setQuantity(1);
    const targetCat = availableCategories.find(c => c.key === nextCategory);
    if (targetCat && targetCat.items.length > 0) {
      setValue('itemId', targetCat.items[0].id, { shouldValidate: true });
    }
    resetScheduleSelection(1);
  };
  const onCustomerChange = event => {
    const id = event.target.value;
    const customer = branchCustomers.find(c => String(c.id) === String(id));
    setValue('customerId', customer ? String(customer.id) : '', { shouldValidate: true, shouldDirty: true });
    if (customer) {
      setValue('customerName', customer.name || '', { shouldValidate: true, shouldDirty: true });
      setValue('email', customer.email || '', { shouldValidate: true, shouldDirty: true });
      setValue('phone', customer.phone || '', { shouldValidate: true, shouldDirty: true });
      if (canChooseBranch && customer.branch) setValue('branch', customer.branch);
    } else {
      setValue('customerName', '', { shouldValidate: true, shouldDirty: true });
      setValue('email', '', { shouldValidate: true, shouldDirty: true });
      setValue('phone', '', { shouldValidate: true, shouldDirty: true });
    }
    clearErrors(['customerName', 'email', 'phone']);
    void trigger(['customerName', 'email']);
  };
  const findAvailability = async () => {
    const scheduleIsValid = await trigger(['branch', 'date', 'itemId']);
    if (!scheduleIsValid) return;
    const schedule = getValues();
    setApiNotice('');
    setSeat(null);
    if (isApiEnabled) {
      setApiAvailabilityContext(`${schedule.branch}|${schedule.date}`);
      setApiAvailabilityLoaded(false);
      setApiAvailableSeatIds([]);
      setApiAvailabilitySpaces([]);
      setApiBusy(true);
      try {
        const response = getApiPayload(await api.bookings.availability({
          branch: schedule.branch,
          date: schedule.date,
          workspaceId: values.itemId,
        }));
        const availableSeats = Array.isArray(response)
          ? response
          : response?.availableSeats || response?.available;
        if (Array.isArray(response?.workspaces)) {
          setApiAvailabilitySpaces(response.workspaces);
        }
        if (Array.isArray(availableSeats)) {
          setApiAvailableSeatIds(availableSeats.map((entry) =>
            typeof entry === 'string' ? entry : entry.seatId || entry.seat || entry.id || entry.code || entry.name
          ).filter(Boolean));
        }
        setApiAvailabilityLoaded(true);
        setShowAvailability(true);
        setActiveStep(3);
      } catch (error) {
        setApiAvailabilityLoaded(false);
        setApiNotice(getApiErrorMessage(error, 'Could not load workspace availability. Please try again.'));
      } finally {
        setApiBusy(false);
      }
      return;
    }
    setShowAvailability(true);
    setActiveStep(3);
  };
  const resetScheduleSelection = (step = 2) => {
    setSeat(null);
    setApiAvailabilityLoaded(false);
    setApiAvailabilitySpaces([]);
    setApiAvailableSeatIds([]);
    setApiAvailabilityContext('');
    setShowAvailability(false);
    setActiveStep(step);
  };
  const confirmDemoPayment = async () => {
    if (!demoCheckout) return;
    setApiBusy(true);
    setApiNotice('');
    try {
      const verification = getApiPayload(await api.payments.verifyRazorpay({
        paymentId: demoCheckout.checkout.paymentId,
        razorpayOrderId: demoCheckout.checkout.orderId,
        razorpayPaymentId: `demo_payment_${demoCheckout.checkout.paymentId}`,
        razorpaySignature: 'demo_signature',
      }));
      setCompletedBooking({
        ...demoCheckout.booking,
        ...(demoCheckout.savedBooking || {}),
        id: demoCheckout.savedBooking.id || demoCheckout.savedBooking._id || '',
        status: 'CONFIRMED',
        demoPayment: true,
        invoiceNumber: verification?.invoiceNumber,
      });
      setDemoCheckout(null);
      setShowAvailability(false);
      showSuccess('Demo payment completed and booking confirmed. No money was charged.');
    } catch (error) {
      console.error('Could not complete demo Razorpay payment:', error);
      const message = getApiErrorMessage(error, 'Demo payment could not be completed.');
      setApiNotice(message);
      showError(message);
    } finally {
      setApiBusy(false);
    }
  };
  const cancelDemoPayment = async () => {
    if (!demoCheckout) return;
    setApiBusy(true);
    try {
      await api.payments.cancelRazorpay(demoCheckout.checkout.paymentId);
      setDemoCheckout(null);
      setApiNotice('Demo payment was cancelled. No booking was confirmed.');
    } catch (error) {
      console.error('Could not cancel demo booking payment:', error);
      const message = getApiErrorMessage(error, 'Demo payment could not be cancelled.');
      setApiNotice(message);
      showError(message);
    } finally {
      setApiBusy(false);
    }
  };
  const confirmCounterPaymentReceived = async () => {
    const paymentId = completedBooking?.paymentRecord?.id;
    if (!paymentId) return;
    setConfirmingCounterPayment(true);
    try {
      const result = getApiPayload(await api.payments.confirmReceived(paymentId));
      setCompletedBooking((current) => current ? {
        ...current,
        paymentRecord: { ...current.paymentRecord, ...result, status: 'PAID' },
        invoiceNumber: result?.invoice_number || current.invoiceNumber,
      } : current);
      showSuccess('Payment receipt confirmed and invoice generated.');
    } catch (error) {
      console.error('Could not confirm front-desk payment receipt:', error);
      const message = getApiErrorMessage(error, 'Payment receipt could not be confirmed.');
      setApiNotice(message);
      showError(message);
    } finally {
      setConfirmingCounterPayment(false);
    }
  };
  const submitBooking = async data => {
    if (!seat) {
      const msg = 'Choose an available workspace before confirming this booking.';
      setApiNotice(msg);
      showError(msg);
      setActiveStep(3);
      return;
    }
    if (seat && seat.status !== 'Available') {
      const msg = `Workspace "${seat.code || seat.name || seat.id}" is ${String(seat.status).toUpperCase()} and cannot be booked.`;
      setApiNotice(msg);
      showError(msg);
      return;
    }
    if (seat && Number(seat.availableCapacity) < seatCount) {
      const msg = `Only ${Number(seat.availableCapacity) || 0} seat${Number(seat.availableCapacity) === 1 ? '' : 's'} remain in "${seat.code || seat.name || seat.id}". Choose another workspace or reduce the seat count.`;
      setApiNotice(msg);
      showError(msg);
      setSeat(null);
      setActiveStep(3);
      return;
    }
    const advanceValue = Number(advanceAmount) || 0;
    if ((isCustomer && advanceValue < 1) || advanceValue < 0 || advanceValue > total) {
      const minimum = isCustomer ? 1 : 0;
      const msg = `Enter an advance amount between ₹${minimum} and ${money(total)}.`;
      setApiNotice(msg);
      showError(msg);
      return;
    }
    const booking = {
      branch: data.branch || defaultBranch,
      date: data.date,
      customerId: data.customerId || (isCustomer ? user.customerId || user.id : 'WALK-IN'),
      customerName: data.customerName || user.name,
      email: data.email || user.email,
      phone: data.phone || user.phone || '',
      itemId: data.itemId,
      itemName: item.name,
      unitPrice: item.rate,
      quantity: Number(quantity) || 1,
      seatCount,
      bookingCategory: selectedBookingCategory,
      duration: bookingDuration,
      total,
      advanceAmount: advanceValue,
      paymentMethod: isCustomer ? 'RAZORPAY' : paymentMethod,
      parkingIncluded, 
      parkingFee,
      parkingItemId: parkingIncluded ? parkingItem.id : null,
      parkingItemName: parkingIncluded ? parkingItem.name : null,
      workspaceId: seat ? seat.dbId || seat.id : null,
      seat: seat ? seat.code || seat.id : null,
      floor: seat?.floor || null,
      bookingType: activeCategory.label,
      notes: data.notes,
      status: 'Confirmed',
      source: isCustomer ? 'Online' : 'In-person',
      bookingSource: isCustomer ? 'ONLINE' : 'IN_PERSON',
    };
    setApiNotice('');
    if (isApiEnabled) {
      setApiBusy(true);
      try {
        const response = await api.bookings.create(booking);
        const savedBooking = getApiPayload(response);
        if (isCustomer && (!savedBooking?.paymentRequired || !savedBooking.checkout)) {
          throw new Error('The server did not start secure payment. Your booking has not been confirmed.');
        }
        if (savedBooking?.paymentRequired && savedBooking.checkout) {
          const checkout = savedBooking.checkout;
          if (checkout.mode === 'demo') {
            setDemoCheckout({ checkout, booking, savedBooking });
            return;
          }
          try {
            await loadRazorpayCheckout();
            let verificationStarted = false;
            const cancelPendingPayment = () => api.payments.cancelRazorpay(checkout.paymentId).catch((error) => {
              console.error('Could not cancel pending Razorpay booking:', error);
            });
            const razorpay = new window.Razorpay({
              key: checkout.keyId,
              order_id: checkout.orderId,
              amount: checkout.amount,
              currency: checkout.currency,
              name: checkout.name || 'NanoSpace',
              description: checkout.description,
              prefill: checkout.prefill,
              theme: { color: '#292fdc' },
              handler: async (paymentResponse) => {
                verificationStarted = true;
                setApiBusy(true);
                setApiNotice('');
                try {
                  const verification = getApiPayload(await api.payments.verifyRazorpay({
                    paymentId: checkout.paymentId,
                    razorpayOrderId: paymentResponse.razorpay_order_id,
                    razorpayPaymentId: paymentResponse.razorpay_payment_id,
                    razorpaySignature: paymentResponse.razorpay_signature,
                  }));
                  setCompletedBooking({
                    ...booking,
                    ...(savedBooking || {}),
                    id: savedBooking.id || savedBooking._id || '',
                    status: 'CONFIRMED',
                    invoiceNumber: verification?.invoiceNumber,
                  });
                  setShowAvailability(false);
                  showSuccess('Payment received and booking confirmed.');
                } catch (error) {
                  console.error('Could not verify Razorpay booking payment:', error);
                  const message = getApiErrorMessage(error, 'Payment could not be verified. Your booking is not confirmed.');
                  setApiNotice(`${message} If your account was charged, contact NanoSpace support with your payment reference.`);
                  showError(message);
                } finally {
                  setApiBusy(false);
                }
              },
              modal: {
                ondismiss: () => {
                  if (!verificationStarted) {
                    cancelPendingPayment();
                    setApiNotice('Payment was cancelled. No booking was confirmed.');
                  }
                },
              },
            });
            razorpay.on('payment.failed', (failure) => {
              cancelPendingPayment();
              const message = failure?.error?.description || 'Payment failed. Please try booking again.';
              setApiNotice(message);
              showError(message);
            });
            razorpay.open();
          } catch (error) {
            await api.payments.cancelRazorpay(checkout.paymentId).catch((cancelError) => {
              console.error('Could not cancel booking after checkout could not start:', cancelError);
            });
            throw error;
          }
          return;
        }
        setCompletedBooking({ ...booking, ...(savedBooking || {}), id: savedBooking?.id || savedBooking?._id || '' });
        showSuccess(savedBooking?.paymentRecord
          ? 'Booking confirmed. Payment is pending until staff confirms receipt.'
          : 'Booking confirmed successfully!');
        setShowAvailability(false);
      } catch (error) {
        console.error('Could not create booking:', error);
        const _bookErr = getApiErrorMessage(error, 'Booking could not be created.'); setApiNotice(_bookErr); showError(_bookErr);
      } finally {
        setApiBusy(false);
      }
      return;
    }
    setCompletedBooking(dispatch(addBooking(booking)).payload);
    setShowAvailability(false);
  };

  if (completedBooking) return (
    <div className="booking-experience booking-simple booking-mmt-page booking-complete-page">
      <div className="booking-complete-banner">
        <div className="booking-complete-icon"><FiCheckCircle /></div>
        <Badge color="success" pill>
          {completedBooking.demoPayment ? 'Demo payment complete' : isCustomer && isApiEnabled ? 'Payment received' : 'Booking confirmed'}
        </Badge>
        <h2>Your workspace is reserved</h2>
        <p>{completedBooking.demoPayment
          ? 'The demo payment was simulated. No real payment was taken.'
          : isCustomer && isApiEnabled
          ? 'Your payment was verified and your booking is confirmed.'
          : 'Confirmation has been recorded. You can review these details with the customer.'}</p>
        <div className="booking-confirmation-code">{completedBooking.id || completedBooking.booking_id || 'CONFIRMED'}</div>
          {completedBooking.invoiceNumber && (
            <div className="small text-secondary mt-2">Invoice generated: <strong>{completedBooking.invoiceNumber}</strong></div>
          )}
      </div>
      <Card className="booking-confirmation-card border-0">
        <CardBody>
          <div className="booking-confirmation-heading">
            <div>
              <span className="booking-section-kicker">RESERVATION DETAILS</span>
              <h3>{completedBooking.itemName || item.name}</h3>
            </div>
            <strong>{money(completedBooking.total ?? total)}</strong>
          </div>
          <div className="booking-confirmation-grid">
            <div><FiMapPin /><span>Location</span><strong>{completedBooking.branch || values.branch}</strong></div>
            <div><FiCalendar /><span>Booking date</span><strong>{completedBooking.date || values.date}</strong></div>
            <div><FiBriefcase /><span>Workspace</span><strong>{completedBooking.seat || seat?.code || seat?.name || 'Assigned by front desk'}</strong></div>
            <div><FiUsers /><span>Seats reserved</span><strong>{completedBooking.seatCount || seatCount}</strong></div>
            <div><FiUsers /><span>Booked for</span><strong>{completedBooking.customerName || values.customerName}</strong></div>
            <div><FiCreditCard /><span>{completedBooking.paymentRecord?.status === 'PAID' ? 'Advance received' : 'Advance amount'}</span><strong>{money(completedBooking.advance_amount ?? completedBooking.advanceAmount ?? advanceAmount)}</strong></div>
            <div><FiCreditCard /><span>Balance due</span><strong>{money(Math.max(0, (completedBooking.total_amount ?? completedBooking.total ?? total) - (completedBooking.advance_amount ?? completedBooking.advanceAmount ?? advanceAmount)))}</strong></div>
          </div>
          {completedBooking.paymentRecord && (
            <>
              <div className={`booking-payment-receipt ${completedBooking.paymentRecord.status === 'PAID' ? 'received' : 'pending'}`}>
                <FiCreditCard />
                <span>
                  {completedBooking.paymentRecord.payment_method === 'CASH' ? 'Cash at counter' : 'Online / UPI'} ·{' '}
                  {completedBooking.paymentRecord.status === 'PAID' ? 'Payment received' : 'Awaiting receipt confirmation'}
                </span>
              </div>
              {completedBooking.paymentRecord.status !== 'PAID' && ['super_admin', 'branch_admin', 'reception_admin'].includes(user.role) && isApiEnabled && (
                <Button
                  type="button"
                  color="success"
                  outline
                  className="mb-3"
                  disabled={confirmingCounterPayment}
                  onClick={confirmCounterPaymentReceived}
                >
                  {confirmingCounterPayment
                    ? 'Confirming receipt...'
                    : `Confirm ${completedBooking.paymentRecord.payment_method === 'CASH' ? 'cash' : 'online payment'} received`}
                </Button>
              )}
            </>
          )}
          {completedBooking.parkingIncluded && (
            <div className="booking-confirmation-addon"><FiCheckCircle /> Car parking included</div>
          )}
          <div className="booking-confirmation-footer">
            <span>{completedBooking.demoPayment
              ? 'Demo mode only — no money was charged.'
              : isCustomer && isApiEnabled
                ? 'Payment processed securely by Razorpay.'
                : 'Payment can be collected or recorded separately.'}</span>
            <Button color="primary" className="btn-primary-custom" onClick={() => { setCompletedBooking(null); setSeat(null); setQuantity(1); setSeatCount(1); setIncludeParking(false); setShowAvailability(false); setActiveStep(1); reset({ branch: defaultBranch, date: today, duration: '1', customerId: isCustomer ? user.customerId || user.id || '' : '', customerName: isCustomer ? user.name || '' : '', email: isCustomer ? user.email || '' : '', phone: isCustomer ? user.phone || '' : '', itemId: '', notes: '' }); setCategory('office'); }}>
              Create another booking <FiArrowRight className="ms-2" />
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );

  if (catalogueLoading) return (
    <div className="booking-experience booking-simple">
      <Alert color="info" className="d-flex align-items-center gap-2">
        <FiClock className="me-2" /> Loading workspace catalogue...
      </Alert>
    </div>
  );

  if (!item) return (
    <div className="booking-experience booking-simple">
      {apiNotice && <Alert color="danger">{apiNotice}</Alert>}
      <Alert color="warning">There are no active inventory items available for booking. Contact an administrator to update the inventory catalogue.</Alert>
    </div>
  );

  return (
    <div className="booking-experience booking-simple booking-mmt-page">
      {apiNotice && <Alert color="danger" toggle={() => setApiNotice('')}>{apiNotice}</Alert>}

      <div className="booking-search-hero">
        <div>
          <div className="booking-hero-kicker">NANOSPACE · {user.role === 'customer' ? 'MEMBER BOOKING' : 'FRONT DESK BOOKING'}</div>
          <h2>Your workspace, your way</h2>
          <p>A simple way to find the right space, check availability and reserve it.</p>
        </div>
        <div className="booking-hero-promise"><FiCheckCircle /> Flexible plans <span>·</span> Instant availability</div>
      </div>

      <nav className="booking-journey" aria-label="Booking progress">
        {[
          { step: 1, title: 'Workspace', detail: 'Choose a service', enabled: true },
          { step: 2, title: 'Your visit', detail: 'Location and date', enabled: activeStep >= 2 },
          { step: 3, title: 'Select a space', detail: 'Check the floor plan', enabled: showAvailability },
          { step: 4, title: 'Confirm', detail: 'Customer and booking details', enabled: Boolean(seat) },
        ].map((journeyStep, index) => (
          <div className="booking-journey-part" key={journeyStep.step}>
            <button
              type="button"
              className={`booking-journey-step ${activeStep === journeyStep.step ? 'active' : activeStep > journeyStep.step ? 'complete' : ''}`}
              onClick={() => journeyStep.enabled && setActiveStep(journeyStep.step)}
              disabled={!journeyStep.enabled}
              aria-current={activeStep === journeyStep.step ? 'step' : undefined}
            >
              <span className="booking-journey-number">{activeStep > journeyStep.step ? <FiCheckCircle /> : journeyStep.step}</span>
              <span><strong>{journeyStep.title}</strong><small>{journeyStep.detail}</small></span>
            </button>
            {index < 3 && <span className={`booking-journey-connector ${activeStep > journeyStep.step ? 'complete' : ''}`} />}
          </div>
        ))}
      </nav>

      <Form onSubmit={handleSubmit(submitBooking)} noValidate>
        <Row className="g-4">
          <Col lg={activeStep === 3 ? '12' : '8'}>
            {activeStep === 1 && <Card className="booking-type-card booking-wizard-card booking-search-card border-0 mb-4">
              <CardBody>
                <div className="booking-type-header">
                  <div>
                    <span className="booking-section-kicker">01 · SPACE AND PLAN</span>
                    <h3>What brings you to NanoSpace?</h3>
                    <p>Choose the kind of workspace that fits your day.</p>
                  </div>
                  <span className="booking-step-label">Step 1 of 4</span>
                </div>

                <div className="booking-type-list booking-service-tabs booking-service-cards" role="group" aria-label="Workspace type">
                  {availableCategories.map(option => {
                    const Icon = option.icon;
                    const chosen = category === option.key;
                    return (
                      <button
                        type="button"
                        key={option.key}
                        className={`booking-type-option booking-service-tab ${chosen ? 'active' : ''}`}
                        onClick={() => changeCategory(option.key)}
                        aria-pressed={chosen}
                      >
                        <span className="booking-type-icon"><Icon /></span>
                        <span className="booking-type-copy">
                          <strong>{option.label}</strong>
                          <small>{option.caption}</small>
                          {option.minPrice && (
                            <span className="category-price-pill">From {money(option.minPrice)}</span>
                          )}
                        </span>
                        {chosen && <FiCheckCircle className="booking-type-check" />}
                      </button>
                    );
                  })}
                </div>

                <input type="hidden" {...register('itemId', { required: 'Choose a plan to continue.' })} />
                <div className="booking-package-heading">
                  <div><FiBriefcase /><span>Choose your plan</span></div>
                  <small>{items.length} {items.length === 1 ? 'option' : 'options'} in {activeCategory.label}</small>
                </div>
                <div className="booking-package-list">
                  {items.map((plan) => {
                    const selected = String(values.itemId) === String(plan.id);
                    return (
                      <button
                        type="button"
                        key={plan.id}
                        className={`booking-package-option ${selected ? 'selected' : ''}`}
                        onClick={() => choosePackage(plan.id)}
                        aria-pressed={selected}
                      >
                        <span className="booking-package-radio">{selected && <span />}</span>
                        <span className="booking-package-info">
                          <strong>{plan.name}</strong>
                          <small>{plan.description || `${activeCategory.caption}.`}</small>
                        </span>
                        <span className="booking-package-price"><strong>{money(plan.rate)}</strong><small>per {plan.unit}</small></span>
                      </button>
                    );
                  })}
                </div>
                {errors.itemId && <Alert color="warning" className="booking-inline-validation">{errors.itemId.message}</Alert>}

                <div className="booking-selected-product">
                  <div className="booking-product-mark"><FiCoffee /></div>
                  <div className="booking-product-copy">
                    <strong>{item.name}</strong>
                    <span>{item.description || 'High-speed internet, ergonomic setup, and pantry access included.'}</span>
                    <small>Inventory SKU: {item.id}</small>
                  </div>
                  <div className="booking-product-price">
                    <strong>{money(item.rate)}</strong>
                    <span>per {item.unit}</span>
                  </div>
                </div>

                <div className="booking-wizard-actions mt-4 pt-3 border-top">
                  <div className="booking-selected-hint">
                    <span className="booking-price-inline">
                      <small>Selected plan rate</small>
                      <strong>{money(item.rate)} <small>/ {item.unit}</small></strong>
                    </span>
                  </div>
                  <Button
                    type="button"
                    color="primary"
                    className="btn-primary-custom"
                    onClick={continueFromService}
                  >
                    Choose location and date
                    <FiArrowRight className="ms-2" />
                  </Button>
                </div>
              </CardBody>
            </Card>}

            {activeStep === 2 && (
              <Card className="booking-type-card booking-wizard-card booking-search-card border-0 mb-4">
                <CardBody>
                  <div className="booking-type-header">
                    <div>
                      <span className="booking-section-kicker">02 · LOCATION AND DATE</span>
                      <h3>When and where do you need it?</h3>
                      <p>Choose your branch and booking date. We’ll show the floor plan for this visit.</p>
                    </div>
                    <span className="booking-step-label">Step 2 of 4</span>
                  </div>
                  <div className="booking-search-fields booking-search-panel">
                    <Row className="g-3">
                      <Col md="6">
                        <FormGroup className="mb-0">
                          <Label htmlFor="booking-branch"><FiMapPin className="field-label-icon" /> NanoSpace location</Label>
                          <Controller
                            name="branch"
                            control={control}
                            rules={{ required: 'Choose a branch' }}
                            render={({ field }) => (
                              <Input
                                type="select"
                                id="booking-branch"
                                {...field}
                                value={field.value || defaultBranch}
                                onChange={(event) => {
                                  field.onChange(event.target.value);
                                  resetScheduleSelection();
                                }}
                                disabled={!canChooseBranch}
                              >
                                {(canChooseBranch ? branchOptions : [defaultBranch]).map((branchName) => (
                                  <option key={branchName} value={branchName}>{branchName}</option>
                                ))}
                              </Input>
                            )}
                          />
                          {errors.branch && <FormFeedback className="d-block">{errors.branch.message}</FormFeedback>}
                        </FormGroup>
                      </Col>
                      <Col md="6">
                        <FormGroup className="mb-0">
                          <Label htmlFor="booking-date"><FiCalendar className="field-label-icon" /> Booking date</Label>
                          <Controller
                            name="date"
                            control={control}
                            rules={{ required: 'Choose a date' }}
                            render={({ field }) => (
                              <Input
                                type="date"
                                id="booking-date"
                                {...field}
                                value={field.value || ''}
                                onChange={(event) => {
                                  field.onChange(event.target.value);
                                  resetScheduleSelection();
                                }}
                              />
                            )}
                          />
                          {errors.date && <FormFeedback className="d-block">{errors.date.message}</FormFeedback>}
                          <small className="text-muted d-block mt-2">
                            {isCustomer ? 'Choose the date you want to use the space.' : 'Past dates are allowed for recording an existing booking.'}
                          </small>
                        </FormGroup>
                      </Col>
                      <Col md="6">
                        <FormGroup className="mb-0">
                          <Label><FiUsers className="field-label-icon" />
                            {item.unit === 'day' ? 'Number of days' : item.unit === 'month' ? 'Number of months' : 'Number of units'}
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max="99"
                            value={quantity}
                            onChange={(event) => {
                              setQuantity(Math.max(1, Number(event.target.value) || 1));
                              resetScheduleSelection();
                            }}
                          />
                          <small className="text-muted d-block mt-2">Rate: {money(item.rate)} per {item.unit}</small>
                        </FormGroup>
                      </Col>
                      <Col md="6">
                        <FormGroup className="mb-0">
                          <Label htmlFor="booking-seat-count"><FiUsers className="field-label-icon" /> Number of seats</Label>
                          <Input
                            id="booking-seat-count"
                            type="number"
                            min="1"
                            max="99"
                            value={seatCount}
                            onChange={(event) => {
                              setSeatCount(Math.max(1, Math.min(99, Number(event.target.value) || 1)));
                              resetScheduleSelection();
                            }}
                          />
                          <small className="text-muted d-block mt-2">Only this many seats will be reserved inside the selected space.</small>
                        </FormGroup>
                      </Col>
                      <Col md="6">
                        <div className="booking-visit-choice">
                          <span className="booking-visit-choice-icon"><FiBriefcase /></span>
                          <span><small>YOUR SELECTED PLAN</small><strong>{item.name}</strong><em>{activeCategory.label} · {money(item.rate)} / {item.unit}</em></span>
                        </div>
                      </Col>
                    </Row>
                  </div>
                  <div className="booking-wizard-actions mt-4 pt-3 border-top">
                    <Button type="button" color="light" onClick={() => setActiveStep(1)}>Back to plans</Button>
                    <Button type="button" color="primary" className="btn-primary-custom" onClick={findAvailability} disabled={apiBusy}>
                      {apiBusy ? 'Checking availability...' : 'Check workspace availability'}
                      {!apiBusy && <FiArrowRight className="ms-2" />}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {activeStep === 3 && showAvailability && (
              <Card className="booking-type-card booking-wizard-card border-0 mb-4">
                <CardBody>
                  <div className="booking-type-header">
                    <div>
                      <span className="booking-section-kicker">03 · YOUR WORKSPACE</span>
                      <h3>Choose a {activeCategory.label.toLowerCase()}</h3>
                      <p>The full floor is shown. Choose an available {activeCategory.label.toLowerCase()} with at least {seatCount} free seat{seatCount === 1 ? '' : 's'} for {values.branch} on {values.date}.</p>
                    </div>
                    <span className="booking-step-label">Step 3 of 4</span>
                  </div>
                  <WorkspaceFloorMap
                    key={`${values.branch}-${values.date}`}
                    initialBranch={values.branch}
                    branches={[values.branch]}
                    branchFloorCounts={apiBranchFloorCounts}
                    workspaceRecords={isApiEnabled ? apiWorkspaces : undefined}
                    selectedSeat={seat?.id}
                    availableSeatIds={isApiEnabled ? apiAvailableSeatIds : null}
                    availabilitySpaces={isApiEnabled && apiAvailabilityContext === `${values.branch}|${values.date}` ? apiAvailabilitySpaces : null}
                    availabilityReady={!isApiEnabled || (
                      apiAvailabilityLoaded && apiAvailabilityContext === `${values.branch}|${values.date}`
                    )}
                    requestedSeatCount={seatCount}
                    bookingCategory={selectedBookingCategory}
                    availabilityDate={values.date}
                    onChangeBookingType={() => resetScheduleSelection(1)}
                    bookings={isApiEnabled ? undefined : localBookings}
                    bookingMode
                    onSelectSeat={s => {
                      if (s.status !== 'Available' || s.availableCapacity < seatCount) {
                        const message = s.availableCapacity < seatCount
                          ? `Only ${s.availableCapacity} seat${s.availableCapacity === 1 ? '' : 's'} remain in "${s.code || s.name || s.id}".`
                          : `"${s.code || s.name || s.id}" is ${String(s.status).toUpperCase()} and cannot be booked.`;
                        showError(message);
                        return;
                      }
                      setSeat(s);
                      if (s.branch && canChooseBranch) setValue('branch', s.branch);
                    }}
                  />
                  <div className="booking-wizard-actions mt-4 pt-3 border-top">
                    <Button type="button" color="light" onClick={() => resetScheduleSelection(2)}>
                      Change location or date
                    </Button>
                    <Button type="button" color="primary" className="btn-primary-custom" onClick={() => setActiveStep(4)} disabled={!seat}>
                      Continue to your details <FiArrowRight className="ms-2" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {activeStep === 4 && <Card className="booking-type-card booking-wizard-card border-0">
              <CardBody>
                <div className="booking-type-header">
                  <div>
                    <span className="booking-section-kicker">04 · CUSTOMER AND CONFIRMATION</span>
                    <h3>{isCustomer ? 'Your booking details' : 'Who are we booking for?'}</h3>
                    <p>{isCustomer ? 'Check your contact information and reservation before confirming.' : 'Select a customer profile or add details for a new walk-in.'}</p>
                  </div>
                  <Badge color={isCustomer ? 'success' : 'light'} className={isCustomer ? 'px-3 py-1' : 'text-secondary border px-2 py-1'}>
                    {isCustomer ? <><FiCheckCircle className="me-1" /> Member booking</> : values.customerId ? 'Existing customer' : 'New walk-in'}
                  </Badge>
                </div>

                {isCustomer && (
                  <div className="booking-customer-selected mb-3 p-3 bg-light rounded-3 d-flex align-items-center gap-3">
                    <span className="booking-customer-avatar">
                      {(values.customerName || user.name || 'C').split(' ').map(x => x[0]).slice(0, 2).join('')}
                    </span>
                    <div>
                      <div className="fw-bold text-dark">{values.customerName || user.name}</div>
                      <small className="text-muted">{values.email || user.email} · {values.phone || user.phone || 'No phone set'} · {values.branch || user.branch}</small>
                    </div>
                    <Badge color="success" className="ms-auto"><FiCheckCircle className="me-1" /> Auto-filled</Badge>
                  </div>
                )}

                {user.role !== 'customer' && (
                  <FormGroup className="mb-3">
                    <Label className="fw-semibold small">Customer profile</Label>
                    <Input type="select" value={values.customerId} onChange={onCustomerChange}>
                      <option value="">+ New walk-in customer</option>
                      {branchCustomers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.company || 'Individual'} · {c.branch}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                )}

                {user.role !== 'customer' && selectedCustomer && (
                  <div className="booking-customer-selected mb-3">
                    <span className="booking-customer-avatar">
                      {selectedCustomer.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
                    </span>
                    <div>
                      <strong>{selectedCustomer.name}</strong>
                      <small>{selectedCustomer.company} · {selectedCustomer.branch}</small>
                    </div>
                    <Badge color="success" className="ms-auto">Verified Customer</Badge>
                  </div>
                )}

                <Row className="g-3">
                  <Col md="4">
                    <FormGroup className="mb-0">
                      <Label className="fw-semibold small">Full name <span className="required-star">*</span></Label>
                      <Controller
                        name="customerName"
                        control={control}
                        rules={{
                          validate: value => Boolean(String(value || '').trim()) || 'Customer name is required',
                        }}
                        render={({ field }) => (
                          <Input
                            {...field}
                            value={field.value || ''}
                            invalid={!!errors.customerName}
                            placeholder="John Doe"
                            readOnly={isCustomer}
                            className={isCustomer ? 'bg-light' : ''}
                          />
                        )}
                      />
                      {errors.customerName && <FormFeedback>{errors.customerName.message}</FormFeedback>}
                    </FormGroup>
                  </Col>
                  <Col md="4">
                    <FormGroup className="mb-0">
                      <Label className="fw-semibold small">Email address <span className="required-star">*</span></Label>
                      <Controller
                        name="email"
                        control={control}
                        rules={{
                          validate: value => {
                            const email = String(value || '').trim();
                            if (!email) return 'Email is required';
                            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || 'Enter a valid email';
                          },
                        }}
                        render={({ field }) => (
                          <Input
                            {...field}
                            type="email"
                            value={field.value || ''}
                            invalid={!!errors.email}
                            placeholder="john@example.com"
                            readOnly={isCustomer}
                            className={isCustomer ? 'bg-light' : ''}
                          />
                        )}
                      />
                      {errors.email && <FormFeedback>{errors.email.message}</FormFeedback>}
                    </FormGroup>
                  </Col>
                  <Col md="4">
                    <FormGroup className="mb-0">
                      <Label className="fw-semibold small">Phone number</Label>
                      <Controller
                        name="phone"
                        control={control}
                        render={({ field }) => (
                          <Input {...field} value={field.value || ''} placeholder="+91 98765 43210" />
                        )}
                      />
                    </FormGroup>
                  </Col>
                </Row>

                <FormGroup className="mt-3 mb-0">
                  <Label className="fw-semibold small">Special requests / front desk notes (optional)</Label>
                  <Input
                    type="textarea"
                    rows="2"
                    placeholder="E.g. extra display cable, whiteboard markers, client visit at 11 AM..."
                    {...register('notes')}
                  />
                </FormGroup>
                <div className="booking-wizard-actions mt-4 pt-3 border-top">
                  <Button type="button" color="light" onClick={() => setActiveStep(3)}>
                    Back to workspace
                  </Button>
                  <span className="booking-selected-hint">
                    <FiShield className="text-success" /> {isCustomer ? 'Secure online payment is required to confirm your booking.' : 'Payment can be collected or recorded separately.'}
                  </span>
                </div>
              </CardBody>
            </Card>}
          </Col>

          <Col lg="4" className={activeStep === 3 ? 'd-none' : undefined}>
            <div className="booking-sidebar-sticky">
              <Card className="reservation-summary-card border-0">
                <CardBody className="p-4">
                  <div className="summary-header">
                    <div>
                      <span className="summary-eyebrow">{activeStep === 4 ? 'FINAL REVIEW' : 'YOUR BOOKING'}</span>
                      <h4 className="summary-title">{item.name}</h4>
                    </div>
                    <Badge color="primary" pill className="summary-category-pill">
                      {activeCategory.label}
                    </Badge>
                  </div>

                  <div className="summary-specs">
                    <div className="spec-row">
                      <span className="spec-label"><FiMapPin className="me-1 text-primary" /> Location</span>
                      <span className="spec-val">{values.branch}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-label"><FiCalendar className="me-1 text-primary" /> Start date</span>
                      <span className="spec-val">{values.date}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-label"><FiUsers className="me-1 text-primary" /> Booking length</span>
                      <span className="spec-val">{quantity} {item.unit === 'day' ? 'Day(s)' : item.unit === 'month' ? 'Month(s)' : item.unit === 'session' ? 'Session(s)' : 'Unit(s)'}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-label"><FiUsers className="me-1 text-primary" /> Seats</span>
                      <span className="spec-val">{seatCount}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-label"><FiCoffee className="me-1 text-primary" /> Seat selection</span>
                      <span className="spec-val">{seat ? `${seat.code || seat.name || seat.id}${seat.floor ? ` · ${seat.floor}` : ''}` : 'Not selected yet'}</span>
                    </div>
                  </div>

                  {parkingItem && (
                    <div className="summary-addon-box">
                      <FormGroup check className="mb-0">
                        <Input
                          id="booking-car-parking"
                          type="checkbox"
                          checked={includeParking}
                          onChange={event => setIncludeParking(event.target.checked)}
                        />
                        <Label check for="booking-car-parking" className="d-flex justify-content-between w-100 ps-2">
                          <span>Car parking bay</span>
                          <strong>+{money(parkingItem.rate)}</strong>
                        </Label>
                      </FormGroup>
                    </div>
                  )}

                  <div className="summary-pricing">
                    <div className="pricing-row">
                      <span>Plan rate ({quantity} × {item.unit})</span>
                      <span>{money(baseTotal)}</span>
                    </div>
                    {parkingIncluded && (
                      <div className="pricing-row">
                        <span>Parking add-on</span>
                        <span>{money(parkingFee)}</span>
                      </div>
                    )}
                    <div className="pricing-row text-muted small">
                      <span>Estimated GST (18% inclusive)</span>
                      <span>{money(Math.round(total * 0.18 / 1.18))}</span>
                    </div>
                    <div className="pricing-divider" />
                    <FormGroup className="mb-3">
                      <Label htmlFor="booking-advance" className="fw-semibold">{isCustomer ? 'Advance payment' : 'Amount to collect now'}</Label>
                      <Input
                        id="booking-advance"
                        type="number"
                        min={isCustomer ? '1' : '0'}
                        max={total}
                        step="1"
                        value={advanceAmount}
                        onChange={(event) => {
                          setAdvanceEdited(true);
                          setAdvanceAmount(Math.max(0, Number(event.target.value) || 0));
                        }}
                      />
                      <small className="text-muted">
                        {isCustomer
                          ? 'Secure online payment amount.'
                          : 'Set to ₹0 to record the booking without collecting an advance.'}
                        {' '}Balance due: {money(Math.max(0, total - (Number(advanceAmount) || 0)))}
                      </small>
                    </FormGroup>
                    {!isCustomer && (
                      <FormGroup className="mb-3">
                        <Label htmlFor="booking-payment-method" className="fw-semibold">Payment method</Label>
                        <Input
                          id="booking-payment-method"
                          type="select"
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                        >
                          <option value="CASH">Cash at counter</option>
                          <option value="ONLINE">Online / UPI</option>
                        </Input>
                        <small className="text-muted">
                          {paymentMethod === 'CASH'
                            ? 'The booking is reserved; confirm receipt from Payments after cash is collected.'
                            : 'After verifying the online transfer, confirm receipt from Payments.'}
                        </small>
                      </FormGroup>
                    )}
                    <div className="pricing-total-row">
                      <div>
                        <strong>Total Amount</strong>
                        <small className="text-muted d-block">All inclusive INR</small>
                      </div>
                      <div className="total-highlight">{money(total)}</div>
                    </div>
                  </div>

                  {activeStep === 4 ? (
                    <Button
                      color="primary"
                      type="submit"
                      className="btn-primary-custom w-100 py-3 mt-3 confirm-action-btn"
                      disabled={isSubmitting || apiBusy || !seat || seat.status !== 'Available'}
                    >
                      <FiCheckCircle size={18} className="me-2" />
                      {apiBusy ? 'Starting secure payment...' : isCustomer && isApiEnabled ? 'Pay and confirm booking' : !isCustomer && Number(advanceAmount) > 0 ? 'Confirm booking & record payment' : 'Confirm reservation'}
                    </Button>
                  ) : (
                    <div className="booking-summary-next">
                      {activeStep < 4 ? <FiCheckCircle className="text-success" /> : <FiShield className="text-success" />}
                      <span>
                        {activeStep === 1 && 'Choose a plan to start your reservation.'}
                        {activeStep === 2 && 'Your date and location determine live workspace availability.'}
                        {activeStep === 3 && (seat ? 'Your selected workspace is ready for customer details.' : 'Select an available workspace to continue.')}
                      </span>
                    </div>
                  )}

                  <div className="summary-guarantee-note">
                    <FiShield className="text-success me-2" size={16} />
                    <span>{isCustomer && isApiEnabled
                      ? 'Payment is required to confirm. Demo mode simulates checkout and does not charge money.'
                      : 'Booking confirmation is recorded here. Payment is handled separately.'}</span>
                  </div>
                </CardBody>
              </Card>
            </div>
          </Col>
        </Row>
      </Form>
      <Modal isOpen={Boolean(demoCheckout)} centered backdrop="static" keyboard={!apiBusy}>
        <ModalHeader>Demo Razorpay checkout</ModalHeader>
        <ModalBody>
          <Alert color="warning">
            Demo payment mode is active. This will simulate a successful payment; no money will be charged.
          </Alert>
          <div className="d-flex justify-content-between mb-2">
            <span>Workspace</span><strong>{demoCheckout?.booking.itemName}</strong>
          </div>
          <div className="d-flex justify-content-between">
            <span>Total (INR)</span><strong>{money(demoCheckout?.checkout.amount / 100)}</strong>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="light" disabled={apiBusy} onClick={cancelDemoPayment}>Cancel</Button>
          <Button color="primary" className="btn-primary-custom" disabled={apiBusy} onClick={confirmDemoPayment}>
            {apiBusy ? 'Processing...' : 'Simulate successful payment'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
