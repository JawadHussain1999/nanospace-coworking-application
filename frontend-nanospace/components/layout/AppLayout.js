import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Spinner } from 'reactstrap';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
export default function AppLayout({ children }) {
 const { user, logout, updateProfile, ready } = useAuth(); const router = useRouter(); const [mobileOpen, setMobileOpen] = useState(false);
 useEffect(() => { if (ready && !user) router.replace('/'); }, [ready, user, router]);
 if (!ready || !user) return <div className="loading-screen"><Spinner color="primary"/><span>Loading NanoSpace...</span></div>;
  return (
    <div className="app-shell">
      <Sidebar user={user} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-area">
        <Topbar
          user={user}
          onMenu={() => setMobileOpen(true)}
          onLogout={() => { logout(); router.replace('/'); }}
          onSaveProfile={updateProfile}
        />
        <div className="page-content">{children}</div>
        <footer className="app-footer">
          <span className="app-footer-copy">© 2026 NanoSpace Co-working · Version 1.0</span>
          <span className="app-footer-credit">
            <span className="footer-tagline">Made for better workdays</span>
            <span className="footer-sep">•</span>
            <span className="credit-author">
              Crafted by <strong>Jawad Hussain</strong> with <span className="footer-heart">♥</span>
            </span>
          </span>
        </footer>
      </main>
    </div>
  );
}
