import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Alert, Button, Form, FormGroup, Input, Label, Spinner } from 'reactstrap';
import { FiArrowRight, FiBriefcase, FiLock, FiMail, FiMapPin, FiPhone, FiShield, FiUser, FiZap } from 'react-icons/fi';
import { api, getApiCollection, getApiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ConnectedNetwork from '../components/layout/ConnectedNetwork';
import PasswordStrengthHint, { isPasswordWithinLimit } from '../components/auth/PasswordStrengthHint';

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
    if (!isPasswordWithinLimit(form.password)) {
      setError('Password must be no more than 72 UTF-8 bytes.');
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
      <main className="login-layout login-home-layout signup-layout">
        <div className="login-ambient-layer" aria-hidden="true">
          <ConnectedNetwork className="auth-network-art auth-network-art-top" />
          <ConnectedNetwork className="auth-network-art auth-network-art-bottom" />
        </div>
        <section className="login-brand-panel">
          <div className="login-brand-top">
            <div className="brand-logo-wrap logo-orbit-wrap">
              <span className="logo-orbit logo-orbit-one" aria-hidden="true" />
              <span className="logo-orbit logo-orbit-two" aria-hidden="true" />
              <Image src="/nanospace-logo.png" alt="NanoSpace" width={300} height={85} priority />
            </div>
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
        </section>

        <section className="login-form-panel signup-form-panel">
          <div className="login-form-wrap signup-form-wrap">
            <div className="mobile-login-logo">
              <div className="logo-orbit-wrap mobile-logo-orbit-wrap">
                <span className="logo-orbit logo-orbit-one" aria-hidden="true" />
                <span className="logo-orbit logo-orbit-two" aria-hidden="true" />
                <Image src="/nanospace-logo.png" alt="NanoSpace" width={235} height={60} className="mobile-logo-img" />
              </div>
            </div>
            <div className="login-card-header">
              <div className="login-eyebrow"><FiUser size={12} className="eyebrow-icon" /> CLIENT REGISTRATION</div>
              <h2>Create your account</h2>
              <p className="login-subtitle">Choose your preferred branch and enter your details to get started.</p>
            </div>

            {error && <Alert color="danger" className="login-error-alert">{error}</Alert>}
            {success ? (
              <div>
                <Alert color="success" className="login-error-alert login-success-alert">{success}</Alert>
                <Link href="/" className="btn btn-primary login-submit-btn d-flex align-items-center justify-content-center text-decoration-none">
                  Go to sign in <FiArrowRight className="ms-2" />
                </Link>
              </div>
            ) : (
              <Form onSubmit={submitSignup} className="signup-fields-grid">
                <FormGroup className="signup-field-name">
                  <Label for="signup-name" className="input-label">Full name</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiUser /></span>
                    <Input id="signup-name" name="fullName" value={form.fullName} onChange={updateField} required maxLength={160} autoComplete="name" placeholder="Your full name" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup className="signup-field-email">
                  <Label for="signup-email" className="input-label">Email address</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiMail /></span>
                    <Input id="signup-email" name="email" type="email" value={form.email} onChange={updateField} required maxLength={255} autoComplete="email" placeholder="Enter your email" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup className="signup-field-phone">
                  <Label for="signup-phone" className="input-label">Phone number</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiPhone /></span>
                    <Input id="signup-phone" name="phone" type="tel" value={form.phone} onChange={updateField} required maxLength={40} autoComplete="tel" placeholder="+91 98765 43210" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup className="signup-field-company">
                  <Label for="signup-company" className="input-label">Company <span className="text-muted">(optional)</span></Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiBriefcase /></span>
                    <Input id="signup-company" name="companyName" value={form.companyName} onChange={updateField} maxLength={180} autoComplete="organization" placeholder="Company name" className="custom-login-input" />
                  </div>
                </FormGroup>
                <FormGroup className="signup-field-branch">
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
                <FormGroup className="signup-field-password">
                  <Label for="signup-password" className="input-label">Password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input id="signup-password" name="password" type="password" value={form.password} onChange={updateField} required maxLength={72} autoComplete="new-password" placeholder="Enter a password" className="custom-login-input" />
                  </div>
                  <PasswordStrengthHint password={form.password} />
                </FormGroup>
                <FormGroup className="signup-field-confirm-password">
                  <Label for="signup-confirm-password" className="input-label">Confirm password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input id="signup-confirm-password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={updateField} required maxLength={72} autoComplete="new-password" placeholder="Enter your password again" className="custom-login-input" />
                  </div>
                </FormGroup>
                <div className="signup-form-actions">
                  <Button type="submit" color="primary" className="login-submit-btn" disabled={busy || branchesLoading || !branches.length}>
                    {busy ? <><Spinner size="sm" className="me-2" />Creating account...</> : <><span>Create account</span><FiArrowRight size={17} className="btn-arrow" /></>}
                  </Button>
                  <div className="login-help">Already have an account? <Link href="/">Sign in</Link></div>
                </div>
              </Form>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
