import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Alert, Card, Input, Spinner } from 'reactstrap';
import { FiFilter } from 'react-icons/fi';
import DataTable, { StatusBadge } from '../shared/DataTable';
import { api, getApiCollection, getApiErrorMessage, isApiEnabled } from '../../services/api';
import { BRANCHES } from '../../data/mockData';

const money = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(amount) || 0);

export default function QuotationHistory({ user, refreshToken = 0 }) {
  const isSuperAdmin = String(user?.role || '').toLowerCase() === 'super_admin';
  const isAllBranches = (b) => !b || String(b).trim().toLowerCase() === 'all branches';
  const [branch, setBranch] = useState('All branches');
  const localQuotations = useSelector((state) => state.workspace.quotations);
  const [apiQuotations, setApiQuotations] = useState([]);
  const [loading, setLoading] = useState(isApiEnabled);
  const [notice, setNotice] = useState('');
  const quotations = isApiEnabled
    ? apiQuotations
    : localQuotations.map((quotation) => ({
      ...quotation,
      quotationId: quotation.quotation_number || quotation.id,
    }));
  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    const isAll = isAllBranches(branch);
    const params = isSuperAdmin
      ? (!isAll ? { branch } : undefined)
      : (user.branch && !isAllBranches(user.branch) ? { branch: user.branch } : undefined);
    api.quotations.list(params)
      .then((response) => {
        if (active) setApiQuotations(getApiCollection(response).map((quotation) => ({
          ...quotation,
          id: quotation.id || quotation._id,
          quotationId: quotation.quotation_number || quotation.id || quotation._id,
        })));
      })
      .catch((error) => {
        console.error('Could not load quotations:', error);
        if (active) setNotice(getApiErrorMessage(error, 'Quotations could not be loaded.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken, branch, user.branch, user.role, isSuperAdmin]);
  const isAll = isAllBranches(branch);
  const records = quotations.filter((quotation) => {
    if (isSuperAdmin) {
      return isAll || String(quotation.branch || '').trim().toLowerCase() === String(branch).trim().toLowerCase();
    }
    return !user.branch || isAllBranches(user.branch) || String(quotation.branch || '').trim().toLowerCase() === String(user.branch).trim().toLowerCase();
  });
  const columns = [
    { key: 'quotationId', label: 'Quotation ID', render: (id) => <span className="text-nowrap" style={{ fontSize: '0.9rem' }}>{id}</span> },
    { key: 'customer', label: 'Customer' },
    { key: 'branch', label: 'Branch' },
    { key: 'date', label: 'Created', render: (date) => new Date(date).toLocaleDateString('en-IN') },
    { key: 'amount', label: 'Amount', render: (amount) => money(amount) },
    { key: 'status', label: 'Status', render: (status) => <StatusBadge status={status} /> },
  ];

  return (
    <Card className="panel-card border-0 mt-4">
      <div className="panel-toolbar">
        <div>
          <h3>Saved quotations</h3>
          <p>{records.length} quotations</p>
        </div>
        {isSuperAdmin && (
          <div className="table-tools">
            <div className="filter-select">
              <FiFilter size={15} />
              <Input
                type="select"
                bsSize="sm"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                aria-label="Filter quotations by branch"
              >
                <option>All branches</option>
                {BRANCHES.map((item) => <option key={item}>{item}</option>)}
              </Input>
            </div>
          </div>
        )}
      </div>
      {notice && <Alert color="danger" className="m-3 mb-0">{notice}</Alert>}
      {loading ? (
        <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading quotations...</div>
      ) : (
        <DataTable columns={columns} rows={records} rowKey="id" pageSize={10} emptyMessage="Save a quotation draft to see it listed here." itemLabel="quotations" />
      )}
    </Card>
  );
}
