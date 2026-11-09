import { Provider } from 'react-redux';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Head from 'next/head';
import { makeStore } from '../store';
import { hydrateInventory } from '../store/slices/inventorySlice';
import { hydrateAttendance } from '../store/slices/attendanceSlice';
import { hydrateUserAccounts } from '../store/slices/userAccountsSlice';
import { hydrateWorkspace } from '../store/slices/workspaceSlice';
import { setDemoDataLoaded } from '../store/slices/appSlice';
import { readDemoJson, writeDemoJson } from '../services/demoStorage';
import { isApiEnabled } from '../services/api';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';
import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import { ToastContainer } from 'react-toastify';

export default function App({ Component, pageProps }) {
  const [store] = useState(makeStore);
  return (
    <Provider store={store}>
      <AuthProvider>
        <Head>
          <link rel="icon" type="image/png" sizes="192x192" href="/favicon.png" />
          <link rel="apple-touch-icon" href="/favicon.png" />
        </Head>
        <AppContent Component={Component} pageProps={pageProps} />
        <ToastContainer
          position="top-right"
          autoClose={3500}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </AuthProvider>
    </Provider>
  );
}

function AppContent({ Component, pageProps }) {
  const dispatch = useDispatch();
  const inventory = useSelector((state) => state.inventory);
  const attendance = useSelector((state) => state.attendance);
  const userAccounts = useSelector((state) => state.userAccounts);
  const workspace = useSelector((state) => state.workspace);
  const demoDataLoaded = useSelector((state) => state.app.demoDataLoaded);

  useEffect(() => {
    if (isApiEnabled) {
      dispatch(setDemoDataLoaded());
      return;
    }
    const loadArray = (key, isValid, hydrate) => {
      try {
        const savedValue = readDemoJson(key);
        if (savedValue === null) return;
        if (!Array.isArray(savedValue) || !savedValue.every((item) => item && isValid(item))) {
          throw new Error('Saved demo data has an invalid format.');
        }
        dispatch(hydrate(savedValue));
      } catch (error) {
        console.error(`Could not load ${key}:`, error);
      }
    };
    loadArray(
      'nanospace-inventory',
      (item) => typeof item.id === 'string' && typeof item.name === 'string' &&
        Number.isFinite(Number(item.rate)) && typeof item.unit === 'string',
      hydrateInventory,
    );
    loadArray(
      'nanospace-attendance',
      (item) => typeof item.id === 'string' && typeof item.email === 'string' &&
        typeof item.date === 'string' && typeof item.clockIn === 'string',
      hydrateAttendance,
    );
    loadArray(
      'nanospace-user-accounts',
      (item) => typeof item.email === 'string' && typeof item.name === 'string' &&
        ['super_admin', 'branch_admin', 'reception_admin', 'employee', 'customer'].includes(item.role) &&
        ['Active', 'Inactive'].includes(item.status),
      hydrateUserAccounts,
    );
    let savedWorkspace;
    try {
      savedWorkspace = readDemoJson('nanospace-workspace');
    } catch (error) {
      console.error('Could not read nanospace-workspace:', error);
    }
    if (savedWorkspace !== null) {
      try {
        if (!savedWorkspace || !Array.isArray(savedWorkspace.bookings) || !Array.isArray(savedWorkspace.quotations)) {
          throw new Error('Saved workspace data has an invalid format.');
        }
        dispatch(hydrateWorkspace(savedWorkspace));
      } catch (error) {
        console.error('Could not load nanospace-workspace:', error);
      }
    }
    dispatch(setDemoDataLoaded());
  }, [dispatch]);

  useEffect(() => {
    if (!demoDataLoaded || isApiEnabled) return;
    const values = [
      ['nanospace-inventory', inventory],
      ['nanospace-attendance', attendance],
      ['nanospace-user-accounts', userAccounts],
      ['nanospace-workspace', workspace],
    ];
    values.forEach(([key, value]) => {
      try {
        writeDemoJson(key, value);
      } catch (error) {
        console.error(`Could not save ${key}:`, error);
      }
    });
  }, [attendance, demoDataLoaded, inventory, userAccounts, workspace]);

  return <Component {...pageProps} />;
}
