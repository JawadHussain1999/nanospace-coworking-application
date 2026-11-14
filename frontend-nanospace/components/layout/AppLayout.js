import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/router';
import { Spinner } from 'reactstrap';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
const THEME_STORAGE_KEY = 'nanospace-theme';
let currentTheme = false;

const subscribeToTheme = (onChange) => {
  const syncFromStorage = () => {
    try {
      currentTheme = window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch (error) {
      console.error('Could not load saved theme preference:', error);
    }
    onChange();
  };
  window.addEventListener('storage', syncFromStorage);
  window.addEventListener('nanospace-theme-change', syncFromStorage);
  syncFromStorage();
  return () => {
    window.removeEventListener('storage', syncFromStorage);
    window.removeEventListener('nanospace-theme-change', syncFromStorage);
  };
};
const getThemeSnapshot = () => currentTheme;
const getServerThemeSnapshot = () => false;

export default function AppLayout({ children }) {
 const { user, logout, updateProfile, ready } = useAuth(); const router = useRouter(); const [mobileOpen, setMobileOpen] = useState(false);
 const darkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
 useEffect(() => { if (ready && !user) router.replace('/'); }, [ready, user, router]);
 const toggleTheme = () => {
   const nextDarkMode = !darkMode;
   currentTheme = nextDarkMode;
   try {
     window.localStorage.setItem(THEME_STORAGE_KEY, nextDarkMode ? 'dark' : 'light');
   } catch (error) {
     console.error('Could not save theme preference:', error);
   }
   window.dispatchEvent(new Event('nanospace-theme-change'));
 };
 if (!ready || !user) return <div className="loading-screen"><Spinner color="primary"/><span>Loading NanoSpace...</span></div>;
  return (
    <div className={`app-shell${darkMode ? ' theme-dark' : ''}`}>
     <Sidebar user={user} open={mobileOpen} onClose={() => setMobileOpen(false)} />
     <main className="main-area">
       <Topbar
         user={user}
         darkMode={darkMode}
         onToggleTheme={toggleTheme}
         onMenu={() => setMobileOpen(true)}
         onLogout={() => { logout(); router.replace('/'); }}
         onSaveProfile={updateProfile}
       />
       <div className="page-content">{children}</div>
        <footer className="app-footer">
          <span className="app-footer-copy">© 2026 NanoSpace Co-working · Version 1.0</span>
          <span className="app-footer-credit">
            <span className="footer-tagline">Made for better workdays</span>
          </span>
        </footer>
      </main>
    </div>
  );
}
