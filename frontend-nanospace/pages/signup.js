import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Alert, Button, Form, FormGroup, Input, Label, Spinner } from 'reactstrap';
import { FiArrowRight, FiBriefcase, FiLock, FiMail, FiMapPin, FiPhone, FiShield, FiUser, FiZap } from 'react-icons/fi';
import { api, getApiCollection, getApiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const { user, ready } = useAuth();
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    branchId: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.auth.signupBranches()
      .then((response) => {
        if (active) setBranches(getApiCollection(response));
      })
      .catch((requestError) => {
        console.error('Could not load signup branches:', requestError);
        if (active) setError(getApiErrorMessage(requestError, 'Branches could not be loaded. Please try again.'));
      })
      .finally(() => {
        if (active) setBranchesLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (ready && user) window.location.replace('/dashboard');
  }, [ready, user]);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submitSignup = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const response = await api.auth.signup({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        companyName: form.companyName,
        branchId: form.branchId,
        password: form.password,
      });
      const emailStatus = response?.welcomeEmail || response?.data?.welcomeEmail;
      const emailNotice = !emailStatus
        ? ''
        : emailStatus.sent
          ? ' A welcome email with your user ID has been sent.'
          : emailStatus.simulated
            ? ' Email delivery is simulated in this environment; contact NanoSpace if you do not receive a welcome email.'
            : ' Your account was created, but the welcome email could not be delivered. Contact NanoSpace support.';
      setSuccess(`${response?.data?.message || response?.message || 'Your account is ready. You can now sign in.'}${emailNotice}`);
      setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
    } catch (requestError) {
      console.error('Could not create customer account:', requestError);
      setError(getApiErrorMessage(requestError, 'Your account could not be created. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Client registration | NanoSpace</title>
        <meta name="description" content="Register for a NanoSpace client account." />
      </Head>
      <main className="login-layout signup-layout">
        <section className="login-brand-panel">
          <div className="brand-orb orb-one" />
          <div className="brand-orb orb-two" />
          <div className="brand-orb orb-three" />
          <div className="brand-grid-overlay" />
          <div className="login-brand-top">
            <div className="brand-logo-wrap"><Image src="/nanospace-logo.png" alt="NanoSpace" width={300} height={85} priority /></div>
          </div>
          <div className="brand-copy">
            <div className="brand-chip"><FiZap className="chip-icon" /><span>NANOSPACE CLIENT PORTAL</span></div>
            <h1>Find your place<br /><span className="gradient-text">to do great work.</span></h1>
            <p className="brand-subtext">Register as a NanoSpace client to book workspace, manage reservations and stay connected with your branch.</p>
            <div className="brand-feature-list">
              <div className="feature-item"><span className="feature-icon"><FiBriefcase /></span><div className="feature-text"><strong>Book your workspace</strong><small>Explore flexible coworking spaces and plans</small></div></div>
              <div className="feature-item"><span className="feature-icon"><FiShield /></span><div className="feature-text"><strong>Your account, your bookings</strong><small>Keep your workspace details in one place</small></div></div>
            </div>
          </div>
          <div className="brand-panel-footer"><span>© 2026 NanoSpace Co-working</span></div>
        </section>

        <section className="login-form-panel signup-form-panel">
          <div className="form-panel-glow" />
          <div className="login-form-wrap signup-form-wrap">
            <div className="mobile-login-logo"><Image src="/nanospace-logo.png" alt="NanoSpace" width={235} height={60} className="mobile-logo-img" /></div>
            <div className="login-card-header">
              <div className="login-eyebrow"><FiUser size={12} className="eyebrow-icon" /> CLIENT REGISTRATION</div>
              <h2>Create your account</h2>
              <p className="login-subtitle">Choose your preferred branch and enter your details to get started.</p>
            </div>

            {error && <Alert color="danger" className="login-error-alert">{error}</Alert>}
            {success ? (
              <div>
                <Alert color="success" className="login-error-alert">{success}</Alert>
                <Link href="/" className="btn btn-primary login-submit-btn d-flex align-items-center justify-content-center text-decoration-none">
                  Go to sign in <FiArrowRight className="ms-2" />
                </Link>
              </div>
            ) : (
              <Form onSubmit={submitSignup}>
                <FormGroup>
                  <Label for="signup-name" className="input-label">Full name</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiUser /></span>
                    <Input id="signup-name" name="fullName" value={form.fullName} onChange={updateField} required maxLength={160} autoComplete="name" placeholder="Your full name" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup>
                  <Label for="signup-email" className="input-label">Email address</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiMail /></span>
                    <Input id="signup-email" name="email" type="email" value={form.email} onChange={updateField} required maxLength={255} autoComplete="email" placeholder="name@company.com" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup>
                  <Label for="signup-phone" className="input-label">Phone number</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiPhone /></span>
                    <Input id="signup-phone" name="phone" type="tel" value={form.phone} onChange={updateField} required maxLength={40} autoComplete="tel" placeholder="+91 98765 43210" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup>
                  <Label for="signup-company" className="input-label">Company <span className="text-muted">(optional)</span></Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiBriefcase /></span>
                    <Input id="signup-company" name="companyName" value={form.companyName} onChange={updateField} maxLength={180} autoComplete="organization" placeholder="Company name" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup>
                  <Label for="signup-branch" className="input-label">Preferred branch</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiMapPin /></span>
                    <Input id="signup-branch" name="branchId" type="select" value={form.branchId} onChange={updateField} required disabled={branchesLoading || !branches.length} className="custom-login-input signup-select">
                      <option value="">{branchesLoading ? 'Loading branches...' : 'Select a branch'}</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </Input>
                  </div>
                  {!branchesLoading && !branches.length && <small className="field-error-text">No active branches are currently available for registration.</small>}
                </FormGroup>
                <FormGroup>
                  <Label for="signup-password" className="input-label">Password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input id="signup-password" name="password" type="password" value={form.password} onChange={updateField} required minLength={12} maxLength={72} autoComplete="new-password" placeholder="At least 12 characters" className="custom-login-input" />
                  </div>
                  <small className="text-muted">Use at least 12 characters.</small>
                </FormGroup>
                <FormGroup>
                  <Label for="signup-confirm-password" className="input-label">Confirm password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input id="signup-confirm-password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={updateField} required minLength={12} maxLength={72} autoComplete="new-password" placeholder="Enter your password again" className="custom-login-input" />
                  </div>
                </FormGroup>
                <Button type="submit" color="primary" className="login-submit-btn" disabled={busy || branchesLoading || !branches.length}>
                  {busy ? <><Spinner size="sm" className="me-2" />Creating account...</> : <><span>Create account</span><FiArrowRight size={17} className="btn-arrow" /></>}
                </Button>
                <div className="login-help">Already have an account? <Link href="/">Sign in</Link></div>
              </Form>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
