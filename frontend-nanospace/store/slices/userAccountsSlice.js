import { createSlice } from '@reduxjs/toolkit';
import { DEMO_USERS } from '../../data/mockData';

const userAccountsSlice = createSlice({
  name: 'userAccounts',
  initialState: DEMO_USERS.map(({ email, name, role, branch }) => ({
    email,
    name,
    role,
    branch: branch || 'All branches',
    status: 'Active',
  })),
  reducers: {
    hydrateUserAccounts(state, action) {
      return action.payload;
    },
    addUserAccount(state, action) {
      state.push(action.payload);
    },
    updateUserAccount(state, action) {
      const index = state.findIndex((account) => account.email === action.payload.previousEmail);
      if (index !== -1) state[index] = action.payload.account;
    },
    deleteUserAccount(state, action) {
      return state.filter((account) => account.email !== action.payload && account.id !== action.payload);
    },
  },
});

export const { hydrateUserAccounts, addUserAccount, updateUserAccount, deleteUserAccount } = userAccountsSlice.actions;
export default userAccountsSlice.reducer;
