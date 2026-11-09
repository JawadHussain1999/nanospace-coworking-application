import { createSlice } from '@reduxjs/toolkit';

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState: [],
  reducers: {
    hydrateAttendance(state, action) {
      return action.payload;
    },
    clockIn(state, action) {
      if (!state.some((entry) => entry.id === action.payload.id)) state.unshift(action.payload);
    },
    clockOut(state, action) {
      const entry = state.find((item) => item.id === action.payload.id);
      if (entry && !entry.clockOut) entry.clockOut = action.payload.clockOut;
    },
  },
});

export const { hydrateAttendance, clockIn, clockOut } = attendanceSlice.actions;
export default attendanceSlice.reducer;
