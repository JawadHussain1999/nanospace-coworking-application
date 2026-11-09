import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, FormGroup, Input, Label, Spinner } from 'reactstrap';
import { showSuccess, showError } from '../../utils/toast';
import { api, getApiCollection, getApiErrorMessage, getApiPayload, isApiEnabled } from '../../services/api';

const formatJson = (value) => JSON.stringify(getApiPayload(value) ?? {}, null, 2);

const DEFAULT_ORG_SETTINGS = {
  organizationName: 'NanoSpace Coworking',
  currency: 'INR',
  taxRatePercent: 18,
  operatingHours: { open: '08:00', close: '22:00' },
  securityDepositMonths: 2,
  noticePeriodDays: 30,
  autoInvoicing: true,
  smsNotifications: true,
  emailNotifications: true,
};

const DEFAULT_BRANCH_SETTINGS = {
  operatingHours: '08:00 - 22:00',
  accessControl: 'Biometric + RFID',
  amenities: ['High-speed WiFi', 'Meeting Rooms', 'Cafeteria', 'Power Backup', 'Printing'],
  visitorRegistrationRequired: true,
};

export default function SystemSettingsManagement() {
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [globalJson, setGlobalJson] = useState('{}');
  const [branchSettings, setBranchSettings] = useState({});
  const [loading, setLoading] = useState(isApiEnabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;

    const loadSettings = async () => {
      try {
        const [settingsRes, branchResponse] = await Promise.allSettled([
          api.settings.get(),
          api.branches.list(),
        ]);

        if (!active) return;

        let branchList = [];
        if (branchResponse.status === 'fulfilled') {
          branchList = getApiCollection(branchResponse.value).map((branch) => ({
            id: branch.id || branch._id,
            name: branch.name || branch.branchName || branch.branch_name || String(branch.id || branch._id),
          })).filter((branch) => branch.id);
        }
        setBranches(branchList);
        if (branchList.length > 0) setSelectedBranchId(branchList[0].id);

        if (settingsRes.status === 'fulfilled') {
          setGlobalJson(formatJson(settingsRes.value));
        }
      } catch (error) {
        console.error('Could not load system settings from API:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSettings();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isApiEnabled || !selectedBranchId) return undefined;
    let active = true;

    api.settings.getBranch(selectedBranchId)
      .then((settings) => {
        if (active) setBranchSettings((current) => ({ ...current, [selectedBranchId]: formatJson(settings) }));
      })
      .catch((error) => {
        console.error('Could not load branch settings from API:', error);
      });
    return () => { active = false; };
  }, [selectedBranchId]);

  const saveSettings = async (branchId) => {
    setBusy(true);
    setNotice(null);
    try {
      const rawText = branchId ? branchSettings[branchId] || '{}' : globalJson;
      const body = JSON.parse(rawText);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Settings must be a JSON object.');
      }

      if (branchId) await api.settings.updateBranch(branchId, body);
      else await api.settings.update(body);

      setNotice({
        color: 'success',
        text: branchId ? 'Branch settings saved successfully.' : 'Organization settings saved successfully.',
      });
    } catch (error) {
      console.error('Could not save settings:', error);
      setNotice({
        color: 'danger',
        text: error instanceof SyntaxError ? 'Enter valid JSON before saving settings.' : (getApiErrorMessage(error, 'Settings could not be saved.')),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!isApiEnabled) return null;

  return (
    <section className="mt-4">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">NANOSPACE / CONFIGURATION</div>
          <h2>System settings</h2>
          <p>View and update the organization-wide and branch-specific settings returned by your API.</p>
        </div>
      </div>
      {notice && <Alert color={notice.color} toggle={() => setNotice(null)}>{notice.text}</Alert>}
      {loading ? <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading settings...</div> : (
        <>
          <Card className="panel-card border-0 mb-4">
            <CardBody>
              <h3>Organization settings</h3>
              <p className="text-secondary">Edit the JSON object returned by <code>GET /settings</code>.</p>
              <FormGroup><Label for="organization-settings">Settings JSON</Label><Input id="organization-settings" type="textarea" rows="10" value={globalJson} onChange={(event) => setGlobalJson(event.target.value)} spellCheck={false} /></FormGroup>
              <Button color="primary" className="btn-primary-custom" disabled={busy} onClick={() => saveSettings()}>{busy ? <Spinner size="sm" className="me-2" /> : null}Save organization settings</Button>
            </CardBody>
          </Card>
          <Card className="panel-card border-0">
            <CardBody>
              <h3>Branch settings</h3>
              <p className="text-secondary">Edit the settings for a branch using its API ID.</p>
              <FormGroup><Label for="settings-branch">Branch</Label><Input id="settings-branch" type="select" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} disabled={!branches.length}><option value="">No branches available</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Input></FormGroup>
              <FormGroup><Label for="branch-settings">Branch settings JSON</Label><Input id="branch-settings" type="textarea" rows="10" value={branchSettings[selectedBranchId] || ''} onChange={(event) => setBranchSettings((current) => ({ ...current, [selectedBranchId]: event.target.value }))} disabled={!selectedBranchId || branchSettings[selectedBranchId] === undefined} spellCheck={false} />{selectedBranchId && branchSettings[selectedBranchId] === undefined && <small className="text-secondary">Loading branch settings...</small>}</FormGroup>
              <Button color="primary" className="btn-primary-custom" disabled={busy || !selectedBranchId || branchSettings[selectedBranchId] === undefined} onClick={() => saveSettings(selectedBranchId)}>{busy ? <Spinner size="sm" className="me-2" /> : null}Save branch settings</Button>
            </CardBody>
          </Card>
        </>
      )}
    </section>
  );
}
