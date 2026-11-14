import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Alert } from 'reactstrap';
import AppLayout from '../components/layout/AppLayout';
import PageContent from '../components/records/PageContent';
import { useAuth } from '../context/AuthContext';
import BookingExperience from '../components/bookings/BookingExperience';
import QuotationBuilder from '../components/quotations/QuotationBuilder';
import QuotationHistory from '../components/quotations/QuotationHistory';
import WorkspaceManagement from '../components/workspace/WorkspaceManagement';
import InventoryManagement from '../components/inventory/InventoryManagement';
import AttendanceManagement from '../components/attendance/AttendanceManagement';
import UserAccountsManagement from '../components/users/UserAccountsManagement';
import KycDocumentsManagement from '../components/customers/KycDocumentsManagement';
import BackupsManagement from '../components/settings/BackupsManagement';
import BulkImportManagement from '../components/settings/BulkImportManagement';
import { getMenuForRole } from '../utils/permissions';

export default function DynamicPage() {
  const [quotationRefresh, setQuotationRefresh] = useState(0);
  const router = useRouter();
  const { user, ready } = useAuth();
  const path = `/${Array.isArray(router.query.slug) ? router.query.slug.join('/') : ''}`;
  const menu = user ? getMenuForRole(user.role) : [];
  const isAllowedRoute = menu.some((group) => group.items.some((item) => item.path === path)) ||
    (['/new-booking', '/in-person-booking', '/book-workspace'].includes(path) && ['super_admin', 'branch_admin', 'reception_admin', 'customer'].includes(user?.role));

  useEffect(() => {
    if (ready && user && router.isReady && !isAllowedRoute) router.replace('/dashboard');
  }, [isAllowedRoute, ready, router, user]);

  if (!ready || !user || !router.isReady || !isAllowedRoute) return null;

  if (['branch_admin', 'reception_admin'].includes(user.role) && !user.branch) {
    return <AppLayout><Alert color="warning">Your account has no branch assigned. Contact a Super Admin to configure your branch access.</Alert></AppLayout>;
  }

  const title = path.split('/')[1]?.replace(/-/g, ' ') || 'NanoSpace';
  let content;
  if (path === '/in-person-booking' || path === '/new-booking' || path === '/book-workspace') content = <BookingExperience user={user} />;
  else if (path === '/quotations' && !['customer', 'employee'].includes(user.role)) content = <><QuotationBuilder user={user} onSaved={() => setQuotationRefresh((current) => current + 1)} /><QuotationHistory user={user} refreshToken={quotationRefresh} /></>;
  else if (path === '/workspace') content = <WorkspaceManagement user={user} />;
  else if (path === '/documents') content = <KycDocumentsManagement user={user} />;
  else if (path === '/inventory') content = <InventoryManagement user={user} />;
  else if (path === '/attendance') content = <AttendanceManagement user={user} />;
  else if (path === '/settings') content = <UserAccountsManagement user={user} />;
  else if (path === '/backups' && user.role === 'super_admin') content = <BackupsManagement />;
  else if (path === '/bulk-import') content = <BulkImportManagement user={user} />;
  else content = <PageContent key={path} path={path} user={user} />;

  return (
    <AppLayout>
      <Head><title>{title} | NanoSpace</title></Head>
      {content}
    </AppLayout>
  );
}
