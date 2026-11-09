import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Form, FormGroup, Input, Label, Spinner } from 'reactstrap';
import { FiCheck, FiDownload, FiFileText, FiUpload, FiX, FiTrash2 } from 'react-icons/fi';
import DataTable from '../shared/DataTable';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import { customers as sampleCustomers } from '../../data/mockData';
import { demoCustomers } from '../../data/inventory';
import { useAppSelector } from '../../store/hooks';
import { deleteKycDocument, getKycDocuments, saveKycDocument, updateKycDocumentStatus } from '../../services/kycDocuments';
import { api, getApiCollection, getApiErrorMessage, isApiEnabled, normalizeApiCustomer } from '../../services/api';
import { showSuccess, showError } from '../../utils/toast';

const allowedFiles = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
const maxFileSize = 10 * 1024 * 1024;
const documentTypes = ['Aadhaar Card', 'PAN Card', 'Passport', 'Driving Licence', 'Voter ID', 'Company PAN', 'Other'];
const reviewRoles = ['super_admin', 'branch_admin', 'reception_admin'];
const formatFileSize = (bytes) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(date));

export default function KycDocumentsManagement({ user }) {
  const userAccounts = useAppSelector((state) => state.userAccounts);
  const canReview = reviewRoles.includes(user.role);
  const isCustomer = user.role === 'customer';
  const isEmployee = user.role === 'employee';
  const isSelfService = isCustomer || isEmployee;
  const [documents, setDocuments] = useState([]);
  const [apiCustomers, setApiCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [file, setFile] = useState(null);
  const [notice, setNotice] = useState(null);
  const [docToDelete, setDocToDelete] = useState(null);
  const fileInputRef = useRef(null);

  const customerOptions = useMemo(() => {
    const candidates = isApiEnabled ? apiCustomers : [
      ...demoCustomers,
      ...sampleCustomers.map((customer) => ({ ...customer, id: customer.email })),
      ...userAccounts.filter((account) => account.role === 'customer' && account.status === 'Active'),
    ];
    const uniqueCustomers = new Map();
    candidates.forEach((customer) => {
      const email = customer.email?.trim().toLowerCase();
      if (email && (user.role === 'super_admin' || (user.branch && customer.branch === user.branch))) {
        const name = customer.name?.trim();
        const branch = customer.branch || user.branch || 'Nanakramguda';
        const customerKey = `${name?.toLowerCase()}|${branch.toLowerCase()}`;
        uniqueCustomers.set(customerKey, {
          id: customer.id || customer._id || email,
          email,
          name,
          branch,
        });
      }
    });
    return [...uniqueCustomers.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [apiCustomers, user.branch, user.role, userAccounts]);

  const currentCustomer = isSelfService
    ? { id: user.id || user.email, email: user.email.trim().toLowerCase(), name: user.name, branch: user.branch || '' }
    : customerOptions.find((customer) => customer.email === selectedCustomer);

  const visibleDocuments = useMemo(() => documents.filter((document) => {
    if (isCustomer) return document.customerEmail === user.email.trim().toLowerCase();
    if (isEmployee) return document.employeeEmail === user.email.trim().toLowerCase();
    return user.role === 'super_admin' || Boolean(user.branch && document.branch === user.branch);
  }), [documents, isCustomer, isEmployee, user.branch, user.email, user.role]);

  const refreshDocuments = async () => {
    try {
      const response = isCustomer
        ? await api.documents.customer(currentCustomer?.id || user.email)
        : isEmployee ? await api.documents.employee(user.id || user.email) : await api.documents.list(user.role === 'super_admin' ? undefined : { branch: user.branch });
      setDocuments(normalizeDocuments(getApiCollection(response), user));
    } catch (err) {
      console.error('Could not refresh documents:', err);
    }
  };

  useEffect(() => {
    let active = true;
    const loadDocuments = async () => {
      let docRecords = [];
      let custRecords = [];
      try {
        const docRes = isCustomer
          ? await api.documents.customer(user.id || user.email)
          : isEmployee ? await api.documents.employee(user.id || user.email) : await api.documents.list();
        docRecords = normalizeDocuments(getApiCollection(docRes), user);
      } catch (e) {
        console.error('Could not load documents from API:', e);
      }
      if (canReview) {
        try {
          const cRes = await api.customers.list(user.role === 'super_admin' ? undefined : { branch: user.branch });
          custRecords = getApiCollection(cRes).map(normalizeApiCustomer);
        } catch (_) {}
      }
      return { documents: docRecords, customers: custRecords };
    };
    loadDocuments()
      .then(({ documents: loadedDocuments, customers: loadedCustomers }) => {
        if (active) {
          setDocuments(loadedDocuments);
          if (loadedCustomers.length) setApiCustomers(loadedCustomers);
        }
      })
      .catch((error) => {
        console.error('Could not load KYC documents:', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [canReview, isCustomer, isEmployee, user, user.email, user.id]);

  const uploadDocument = async (event) => {
    event.preventDefault();
    if (!currentCustomer && !isSelfService) {
      setNotice({ color: 'warning', text: 'Choose the customer before uploading a document.' });
      return;
    }
    if (!file) {
      setNotice({ color: 'warning', text: 'Choose a PDF, PNG or JPEG file to upload.' });
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    const expectedType = allowedFiles[extension];
    if (!expectedType || (file.type && file.type !== expectedType)) {
      setNotice({ color: 'warning', text: 'Only PDF, PNG and JPEG documents are accepted.' });
      return;
    }
    if (file.size === 0 || file.size > maxFileSize) {
      setNotice({ color: 'warning', text: 'Choose a non-empty document smaller than 10 MB.' });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      await api.documents.upload(file, {
        ...(isEmployee
          ? { employeeId: user.id || user.email, employeeEmail: user.email }
          : { customerId: currentCustomer.id || currentCustomer.email }),
        documentType,
        branch: currentCustomer?.branch || user.branch,
      });
      await refreshDocuments();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNotice({ color: 'success', text: 'KYC document uploaded and submitted for review.' }); showSuccess('KYC document uploaded successfully.');
    } catch (error) {
      console.error('Could not upload KYC document:', error);
      const _upErr = getApiErrorMessage(error, 'The document could not be saved. Please try again.'); setNotice({ color: 'danger', text: _upErr }); showError(_upErr);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (document, status) => {
    setBusy(true);
    setNotice(null);
    try {
      await api.documents.updateStatus(document.id, status);
      await refreshDocuments();
      setNotice({ color: 'success', text: `Document ${status.toLowerCase()}.` }); showSuccess(`Document ${status.toLowerCase()} successfully.`);
    } catch (error) {
      console.error('Could not update KYC document status:', error);
      const _stErr = getApiErrorMessage(error, 'Document status could not be updated. Please try again.'); setNotice({ color: 'danger', text: _stErr }); showError(_stErr);
    } finally {
      setBusy(false);
    }
  };

  const downloadDocument = async (document) => {
    let blob = document.fileBlob;
    try {
      blob = await api.documents.download(document.id);
    } catch (error) {
      console.error('Download error:', error);
    }
    if (!blob) {
      setNotice({ color: 'danger', text: 'The document file is unavailable.' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = document.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const promptDeleteDocument = (doc) => {
    setDocToDelete(doc);
  };

  const confirmDeleteDocument = async () => {
    if (!docToDelete) return;
    const document = docToDelete;
    setBusy(true);
    setNotice(null);
    try {
      await api.documents.remove(document.id);
      await refreshDocuments();
      setNotice({ color: 'success', text: 'Document deleted.' }); showSuccess('Document deleted successfully.');
      setDocToDelete(null);
    } catch (error) {
      console.error('Could not delete KYC document:', error);
      const _docDelErr = getApiErrorMessage(error, 'Could not delete document.'); setNotice({ color: 'danger', text: _docDelErr }); showError(_docDelErr);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    ...(!isSelfService ? [{
      key: 'customerName',
      label: 'Customer',
      render: (_, doc) => (
        <>
          <strong>{doc.customerName}</strong>
          <small className="d-block text-secondary">{doc.branch}</small>
        </>
      ),
    }] : []),
    {
      key: 'documentType',
      label: 'Document',
      render: (v) => <><FiFileText className="me-2 text-primary" />{v}</>,
    },
    {
      key: 'fileName',
      label: 'File',
      render: (_, doc) => (
        <>
          {doc.fileName}
          <small className="d-block text-secondary">{formatFileSize(doc.size)}</small>
        </>
      ),
    },
    {
      key: 'uploadedAt',
      label: 'Uploaded',
      render: (v) => formatDate(v),
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => (
        <Badge color={v === 'Approved' ? 'success' : v === 'Rejected' ? 'danger' : 'warning'}>{v}</Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, doc) => (
        <div className="d-flex gap-2">
          <Button color="light" size="sm" onClick={() => downloadDocument(doc)} aria-label={`Download ${doc.fileName}`}><FiDownload /></Button>
          <Button color="light" size="sm" disabled={busy} onClick={() => promptDeleteDocument(doc)} aria-label={`Delete ${doc.fileName}`}><FiTrash2 /></Button>
          {canReview && !isApiEnabled && doc.status === 'Pending' && (
            <>
              <Button color="success" size="sm" disabled={busy} onClick={() => changeStatus(doc, 'Approved')} aria-label={`Approve ${doc.fileName}`}><FiCheck /></Button>
              <Button color="danger" size="sm" disabled={busy} onClick={() => changeStatus(doc, 'Rejected')} aria-label={`Reject ${doc.fileName}`}><FiX /></Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="kyc-documents-management">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">NANOSPACE / CUSTOMER VERIFICATION</div>
          <h2>{isSelfService ? 'My Documents & KYC' : 'Documents & KYC'}</h2>
          <p>{isSelfService ? 'Upload your identity documents and track their verification status.' : 'Receive customer KYC files, download them and record the verification decision.'}</p>
        </div>
        <Badge color="light" className="text-dark">PDF, PNG, JPEG · 10 MB max</Badge>
      </div>

      {notice && <Alert color={notice.color} toggle={() => setNotice(null)}>{notice.text}</Alert>}
      {isApiEnabled && canReview && <Alert color="warning">Document approval and rejection are unavailable until the backend adds a document status endpoint.</Alert>}

      <Card className="panel-card border-0 mb-4">
        <CardBody>
          <div className="panel-heading">
            <div><h3>Upload KYC document</h3><p>Upload and manage customer identity documents.</p></div>
            <FiUpload className="text-primary" />
          </div>
          <Form onSubmit={uploadDocument}>
            {!isSelfService && <FormGroup>
              <Label for="kyc-customer">Customer</Label>
              <Input id="kyc-customer" type="select" required value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
                <option value="">Choose a customer</option>
                {customerOptions.map((customer) => <option key={customer.email} value={customer.email}>{customer.name} · {customer.branch}</option>)}
              </Input>
            </FormGroup>}
            <div className="row g-3">
              <div className="col-md-5">
                <FormGroup>
                  <Label for="kyc-document-type">Document type</Label>
                  <Input id="kyc-document-type" type="select" value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
                    {documentTypes.map((type) => <option key={type}>{type}</option>)}
                  </Input>
                </FormGroup>
              </div>
              <div className="col-md-7">
                <FormGroup>
                  <Label for="kyc-file">Document file</Label>
                  <Input id="kyc-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required innerRef={fileInputRef} onChange={(event) => setFile(event.target.files?.[0] || null)} />
                  <small className="text-secondary">Upload a PDF, PNG or JPEG file, up to 10 MB.</small>
                </FormGroup>
              </div>
            </div>
            <Button color="primary" className="btn-primary-custom" type="submit" disabled={busy || loading}>
              {busy ? <Spinner size="sm" className="me-2" /> : <FiUpload className="me-2" />}
              Upload document
            </Button>
          </Form>
        </CardBody>
      </Card>

      <Card className="panel-card border-0">
        <div className="panel-toolbar"><div><h3>Submitted documents</h3><p>{visibleDocuments.length} documents · Verification status</p></div></div>
        {loading ? (
          <div className="text-center py-5"><Spinner color="primary" /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={visibleDocuments}
            rowKey="id"
            pageSize={10}
            emptyMessage="No KYC documents have been submitted yet."
            itemLabel="documents"
          />
        )}
      </Card>

      <Alert color="light" className="small mt-3">Demo mode stores documents in this browser only. KYC files are sensitive: connect secure, access-controlled backend storage before production use.</Alert>
      <DeleteConfirmModal
        isOpen={Boolean(docToDelete)}
        toggle={() => setDocToDelete(null)}
        onConfirm={confirmDeleteDocument}
        title="Are you sure you want to delete this document?"
        message={`Do you really want to delete "${docToDelete?.fileName || 'this file'}"? This action cannot be undone.`}
        confirmText="OK, Delete"
        cancelText="Cancel"
        busy={busy}
      />
    </div>
  );
}

function normalizeDocuments(documents, user) {
  return documents.map((document) => ({
    ...document,
    id: document.id || document._id,
    customerEmail: document.customerEmail || document.customer_email || document.email || (user.role === 'customer' ? user.email : null),
    employeeEmail: document.employeeEmail || document.employee_email || (user.role === 'employee' ? user.email : null),
    customerName: document.customerName || document.customer?.name || document.customer?.full_name || (user.role === 'customer' || user.role === 'employee' ? user.name : ''),
    branch: document.branch?.name || document.branch,
    fileName: document.fileName || document.originalName || document.name,
    uploadedAt: document.uploadedAt || document.createdAt,
    size: document.size || document.fileSize || 0,
  }));
}
