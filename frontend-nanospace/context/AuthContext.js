import { useEffect } from 'react';
import { DEMO_USERS } from '../data/mockData';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout as logoutAction, setReady, setUser } from '../store/slices/authSlice';
import { updateUserAccount } from '../store/slices/userAccountsSlice';
import { readDemoValue, writeDemoValue, removeDemoValue } from '../services/demoStorage';
import { API_TOKEN_KEY, api, getApiErrorMessage, getApiPayload, isApiEnabled, normalizeApiUser } from '../services/api';

// Compatibility adapter so existing UI components can keep using useAuth while Redux owns global auth state.
export function AuthProvider({ children }) {
  const dispatch = useAppDispatch();
  const userAccounts = useAppSelector((state) => state.userAccounts);

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    const restoreApiSession = async () => {
      try {
        if (!readDemoValue(API_TOKEN_KEY)) return;
        const payload = getApiPayload(await api.auth.me());
        if (active) dispatch(setUser(normalizeUser(payload?.user || payload)));
      } catch (error) {
        console.error('Could not restore the API session:', error);
        removeDemoValue(API_TOKEN_KEY);
        if (active) dispatch(logoutAction());
      } finally {
        if (active) dispatch(setReady(true));
      }
    };
    restoreApiSession();
    return () => { active = false; };
  }, [dispatch]);

  useEffect(() => {
    if (isApiEnabled) return undefined;
    try {
      const saved = readDemoValue('nanospace_demo_user');
      if (saved) {
        const storedUser = JSON.parse(saved);
        const account = userAccounts.find((item) => item.email === storedUser.email && item.status === 'Active');
        if (account) {
          dispatch(setUser({ email: account.email, name: account.name, role: account.role, branch: account.branch === 'All branches' ? null : account.branch }));
        } else {
          removeDemoValue('nanospace_demo_user');
          dispatch(logoutAction());
        }
      }
    } catch (error) {
      console.error('Could not restore the demo user session:', error);
      removeDemoValue('nanospace_demo_user');
    } finally {
      dispatch(setReady(true));
    }
  }, [dispatch, userAccounts]);

  return children;
}

export function useAuth() {
  const dispatch = useAppDispatch();
  const { user, ready } = useAppSelector((state) => state.auth);
  const userAccounts = useAppSelector((state) => state.userAccounts);
  const login = async (email, password, options = {}) => {
    if (isApiEnabled && options.mode !== 'demo') {
      try {
        const payload = getApiPayload(await api.auth.login({ email: email.trim(), password }));
        const token = payload?.accessToken || payload?.access_token || payload?.token || payload?.jwt;
        const apiUser = payload?.user || payload?.account;
        if (!token || !apiUser) {
          return { ok: false, message: 'The login response must include a JWT token and user profile.' };
        }
        writeDemoValue(API_TOKEN_KEY, token);
        dispatch(setUser(normalizeUser(apiUser)));
        return { ok: true };
      } catch (error) {
        const isNetworkError = error?.code === 'ERR_NETWORK' || (!error?.response && error?.request);
        return {
          ok: false,
          message: isNetworkError
            ? `Cannot reach the NanoSpace API at ${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api'}. Check that the backend is running and the API URL is correct.`
            : getApiErrorMessage(error, 'Could not sign in to the NanoSpace API.'),
        };
      }
    }
    const demoPassword = DEMO_USERS[0].password;
    const match = userAccounts.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.status === 'Active' && demoPassword === password);
    if (!match) return { ok: false, message: 'Invalid email or password. Use one of the demo accounts.' };
    const safeUser = { email: match.email, name: match.name, role: match.role, branch: match.branch === 'All branches' ? null : match.branch };
    try {
      writeDemoValue('nanospace_demo_user', JSON.stringify(safeUser));
      if (isApiEnabled && !readDemoValue(API_TOKEN_KEY)) {
        try {
          const apiLogin = await api.auth.login({ email: 'admin@nanospace.in', password: 'nanospace123' });
          const payload = getApiPayload(apiLogin);
          const token = payload?.accessToken || payload?.access_token || payload?.token || payload?.jwt;
          if (token) writeDemoValue(API_TOKEN_KEY, token);
        } catch (_) {}
      }
    } catch (error) {
      console.error('Could not save the demo sign-in session:', error);
      return { ok: false, message: 'Could not save your sign-in session in this browser.' };
    }
    dispatch(setUser(safeUser));
    return { ok: true };
  };
  const updateProfile = async (profile) => {
    if (!user) return { ok: false, message: 'You must be signed in to update your profile.' };
    const name = (profile.name || profile.fullName || '').trim();
    const email = (profile.email || '').trim().toLowerCase();
    const avatar = profile.avatar !== undefined ? profile.avatar : (user.avatar || null);

    if (!name) return { ok: false, message: 'Full name is required.' };
    if (!email) return { ok: false, message: 'Email address is required.' };

    if (isApiEnabled) {
      try {
        const response = await api.auth.updateProfile({
          name,
          email,
          avatar,
          phone: profile.phone,
          companyName: profile.companyName,
          gstin: profile.gstin,
          panNumber: profile.panNumber,
          address: profile.address,
        });
        const payload = getApiPayload(response);
        const updatedUser = normalizeUser(payload?.user || payload);
        dispatch(setUser(updatedUser));
        return { ok: true, user: updatedUser };
      } catch (error) {
        console.error('Could not update profile via API:', error);
        return {
          ok: false,
          message: getApiErrorMessage(error, 'Could not save profile changes.'),
        };
      }
    }

    const account = userAccounts.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
    if (userAccounts.some((item) => item.email.toLowerCase() === email && item.email.toLowerCase() !== user.email.toLowerCase())) {
      return { ok: false, message: 'That email address is already in use by another account.' };
    }
    const safeUser = { ...user, name, email, avatar, avatarUrl: avatar };
    try {
      writeDemoValue('nanospace_demo_user', JSON.stringify(safeUser));
    } catch (error) {
      console.error('Could not save profile changes:', error);
      return { ok: false, message: 'Could not save profile changes to storage.' };
    }
    if (account) {
      dispatch(updateUserAccount({
        previousEmail: account.email,
        account: { ...account, name, email, avatar },
      }));
    }
    dispatch(setUser(safeUser));
    return { ok: true, user: safeUser };
  };
  const sendOtp = async (email) => {
    try {
      const res = await api.auth.sendOtp({ email: email.trim().toLowerCase() });
      const payload = getApiPayload(res);
      return { ok: true, data: payload };
    } catch (error) {
      const isNetworkError = error?.code === 'ERR_NETWORK' || (!error?.response && error?.request);
      return {
        ok: false,
        message: isNetworkError
          ? 'Cannot reach the NanoSpace API. Check that the backend is running.'
          : getApiErrorMessage(error, 'Could not send verification code.'),
      };
    }
  };

  const loginWithOtp = async (email, otp) => {
    try {
      const res = await api.auth.loginOtp({ email: email.trim().toLowerCase(), otp: otp.trim() });
      const payload = getApiPayload(res);
      const token = payload?.accessToken || payload?.access_token || payload?.token || payload?.jwt;
      const apiUser = payload?.user || payload?.account;
      if (!token || !apiUser) {
        return { ok: false, message: 'The login response must include a JWT token and user profile.' };
      }
      writeDemoValue(API_TOKEN_KEY, token);
      dispatch(setUser(normalizeUser(apiUser)));
      return { ok: true };
    } catch (error) {
      const isNetworkError = error?.code === 'ERR_NETWORK' || (!error?.response && error?.request);
      return {
        ok: false,
        message: isNetworkError
          ? 'Cannot reach the NanoSpace API. Check that the backend is running.'
          : getApiErrorMessage(error, 'Could not verify code.'),
      };
    }
  };

  const logout = () => {
    removeDemoValue('nanospace_demo_user');
    removeDemoValue(API_TOKEN_KEY);
    dispatch(logoutAction());
  };
  return { user, ready, login, loginWithOtp, sendOtp, logout, updateProfile };
}

function normalizeUser(user) {
  return normalizeApiUser(user);
}
