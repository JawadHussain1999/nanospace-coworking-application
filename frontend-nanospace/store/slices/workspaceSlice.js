import { createSlice, nanoid } from '@reduxjs/toolkit';

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState: {
    selectedBranch: 'Nanakramguda',
    bookings: [],
    quotations: [],
    notifications: [],
  },
  reducers: {
    hydrateWorkspace(state, action) {
      return { ...state, ...action.payload };
    },
    setSelectedBranch(state, action) { state.selectedBranch = action.payload; },
    addBooking: {
      reducer(state, action) { state.bookings.unshift(action.payload); },
      prepare(booking) {
        const prefix = String(booking?.branch || 'kphb').toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomHex = Math.random().toString(16).slice(2, 10);
        return { payload: { id: `${prefix}${randomHex}`, createdAt: new Date().toISOString(), ...booking } };
      },
    },
    updateBooking(state, action) {
      const booking = state.bookings.find((item) => item.id === action.payload.id);
      if (booking) Object.assign(booking, action.payload.updates);
    },
    removeBooking(state, action) {
      state.bookings = state.bookings.filter((item) => item.id !== action.payload);
    },
    addQuotation: {
      reducer(state, action) { state.quotations.unshift(action.payload); },
      prepare(quotation) { return { payload: { id: `NS-QT-${Date.now()}`, createdAt: new Date().toISOString(), ...quotation } }; },
    },
    updateQuotation(state, action) {
      const quotation = state.quotations.find((item) => item.id === action.payload.id);
      if (quotation) Object.assign(quotation, action.payload.updates);
    },
    removeQuotation(state, action) {
      state.quotations = state.quotations.filter((item) => item.id !== action.payload);
    },
    addNotification: {
      reducer(state, action) { state.notifications.unshift({ id: nanoid(), createdAt: new Date().toISOString(), ...action.payload }); },
    },
    clearNotifications(state) { state.notifications = []; },
  },
});

export const { hydrateWorkspace, setSelectedBranch, addBooking, updateBooking, removeBooking, addQuotation, updateQuotation, removeQuotation, addNotification, clearNotifications } = workspaceSlice.actions;
export default workspaceSlice.reducer;
