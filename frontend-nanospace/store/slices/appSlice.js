import { createSlice } from '@reduxjs/toolkit';

const appSlice = createSlice({
  name: 'app',
  initialState: { demoDataLoaded: false },
  reducers: {
    setDemoDataLoaded(state) {
      state.demoDataLoaded = true;
    },
  },
});

export const { setDemoDataLoaded } = appSlice.actions;
export default appSlice.reducer;
