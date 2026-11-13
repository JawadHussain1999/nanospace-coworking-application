import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Spinner, Table } from 'reactstrap';
import { FiDownload, FiRefreshCw } from 'react-icons/fi';
import { api, getApiCollection, getApiErrorMessage, isApiEnabled } from '../../services/api';

function formatCreatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function formatArchiveSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadZip(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export default function BackupsManagement() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(isApiEnabled);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');

  const loadBackups = useCallback(async () => {
    if (!isApiEnabled) return;
    try {
      const response = await api.backups.list();
      setError('');
      setBackups(getApiCollection(response));
    } catch (loadError) {
      console.error('Could not load database backups:', loadError);
      setError(getApiErrorMessage(loadError, 'Backup history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    api.backups.list()
      .then((response) => {
        if (!active) return;
        setError('');
        setBackups(getApiCollection(response));
      })
      .catch((loadError) => {
        if (!active) return;
        console.error('Could not load database backups:', loadError);
        setError(getApiErrorMessage(loadError, 'Backup history could not be loaded.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const createAndDownloadBackup = async () => {
    setCreating(true);
    setError('');
    try {
      const blob = await api.backups.create();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadZip(blob, `nanospace-backup-manual-${timestamp}.zip`);
      await loadBackups();
    } catch (createError) {
      console.error('Could not create database backup:', createError);
      setError(getApiErrorMessage(createError, 'The full database backup could not be created.'));
    } finally {
      setCreating(false);
    }
  };

  const downloadExistingBackup = async (backup) => {
    setDownloadingId(backup.id);
    setError('');
    try {
      const blob = await api.backups.download(backup.id);
      downloadZip(blob, backup.file_name || `nanospace-backup-${backup.id}.zip`);
    } catch (downloadError) {
      console.error(`Could not download backup ${backup.id}:`, downloadError);
      setError(getApiErrorMessage(downloadError, 'The selected backup could not be downloaded.'));
    } finally {
      setDownloadingId('');
    }
  };

  if (!isApiEnabled) return null;

  return (
    <section className="mt-4">
      <div className="page-heading-row mb-4">
        <div>
          <div className="eyebrow">NANOSPACE / DATA PROTECTION</div>
          <h2>Database backups</h2>
          <p>Daily full-record ZIP backups run automatically at midnight India time.</p>
        </div>
        <div className="d-flex gap-2">
          <Button color="light" onClick={loadBackups} disabled={loading || creating}>
            <FiRefreshCw className="me-2" />Refresh
          </Button>
          <Button color="primary" className="btn-primary-custom" onClick={createAndDownloadBackup} disabled={creating || loading}>
            {creating ? <Spinner size="sm" className="me-2" /> : <FiDownload className="me-2" />}
            {creating ? 'Creating full backup…' : 'Create & download now'}
          </Button>
        </div>
      </div>

      {error && <Alert color="danger">{error}</Alert>}
      <Alert color="warning">
        Backup archives contain confidential records, including customer documents and account data. Keep downloaded ZIP files secure, and do not open the raw CSV files directly in spreadsheet software. The latest 30 days of automatic and manual archives are retained in the database.
      </Alert>

      <Card className="panel-card border-0">
        <CardBody>
          <h3 className="mb-3">Available archives</h3>
          {loading ? (
            <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading backup history…</div>
          ) : backups.length === 0 ? (
            <p className="text-secondary mb-0">No backup archives are available yet. The first daily backup is created automatically.</p>
          ) : (
            <div className="table-responsive">
              <Table hover responsive className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Type</th>
                    <th>Records</th>
                    <th>Archive size</th>
                    <th aria-label="Download" />
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => {
                    const recordCount = Object.values(backup.record_counts || {})
                      .reduce((total, count) => total + Number(count || 0), 0);
                    return (
                      <tr key={backup.id}>
                        <td>{formatCreatedAt(backup.created_at)}</td>
                        <td><Badge color={backup.backup_type === 'DAILY' ? 'info' : 'secondary'}>{backup.backup_type === 'DAILY' ? 'Daily' : 'Manual'}</Badge></td>
                        <td>{recordCount.toLocaleString('en-IN')}</td>
                        <td>{formatArchiveSize(backup.archive_size)}</td>
                        <td className="text-end">
                          <Button
                            color="light"
                            size="sm"
                            onClick={() => downloadExistingBackup(backup)}
                            disabled={Boolean(downloadingId) || creating}
                          >
                            {downloadingId === backup.id ? <Spinner size="sm" /> : <><FiDownload className="me-1" />Download ZIP</>}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
