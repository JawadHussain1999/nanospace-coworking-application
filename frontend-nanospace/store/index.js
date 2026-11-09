import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import appReducer from './slices/appSlice';
import attendanceReducer from './slices/attendanceSlice';
import inventoryReducer from './slices/inventorySlice';
import userAccountsReducer from './slices/userAccountsSlice';
import workspaceReducer from './slices/workspaceSlice';

// Create a store per application instance. Do not share server-side mutable state between requests.
export const makeStore = (preloadedState) => configureStore({
  reducer: {
    auth: authReducer,
    app: appReducer,
    attendance: attendanceReducer,
    inventory: inventoryReducer,
    userAccounts: userAccountsReducer,
    workspace: workspaceReducer,
  },
  preloadedState,
  devTools: process.env.NODE_ENV !== 'production',
});
