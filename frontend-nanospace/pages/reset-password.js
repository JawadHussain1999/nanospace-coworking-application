import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Alert, Button, Form, FormGroup, Input, Label, Spinner } from "reactstrap";
import { FiArrowRight, FiCheckCircle, FiLock, FiShield } from "react-icons/fi";
import { api, getApiErrorMessage } from "../services/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const submitReset = async (event) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This password reset link is invalid or has expired. Request a new one.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await api.auth.resetPassword({ token, password });
      setSuccess(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not reset your password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Reset password | NanoSpace Workspace</title>
        <meta name="description" content="Choose a new password for your NanoSpace account." />
      </Head>
      <div className="login-layout">
        <section className="login-brand-panel">
          <div className="brand-orb orb-one" />
          <div className="brand-orb orb-two" />
          <div className="brand-grid-overlay" />
          <div className="login-brand-top">
            <div className="brand-logo-wrap"><img src="/nanospace-logo.png" alt="NanoSpace" /></div>
          </div>
          <div className="brand-copy">
            <div className="brand-chip"><FiShield className="chip-icon" /><span>ACCOUNT SECURITY</span></div>
            <h1>Choose a new<br /><span className="gradient-text">password.</span></h1>
            <p className="brand-subtext">Use a strong password that you don’t use for another account.</p>
          </div>
          <footer className="brand-panel-footer"><span>© 2026 NanoSpace Co-working</span></footer>
        </section>

        <section className="login-form-panel">
          <div className="form-panel-glow" />
          <div className="login-form-wrap">
            <div className="mobile-login-logo">
              <img src="/nanospace-logo.png" alt="NanoSpace" className="mobile-logo-img" />
            </div>
            <div className="login-card-header">
              <div className="login-eyebrow"><FiLock size={12} className="eyebrow-icon" /> ACCOUNT RECOVERY</div>
              <h2>Reset your password</h2>
              <p className="login-subtitle">Choose a new password with at least 12 characters.</p>
            </div>

            {error && <Alert color="danger" role="alert" className="login-error-alert">{error}</Alert>}
            {success ? (
              <div>
                <Alert color="success" role="status" className="login-error-alert">
                  <FiCheckCircle className="me-2" />Your password has been reset. You can now sign in.
                </Alert>
                <Link href="/" className="login-submit-btn btn btn-primary">
                  <span>Go to sign in</span><FiArrowRight size={17} className="btn-arrow" />
                </Link>
              </div>
            ) : (
              <Form onSubmit={submitReset}>
                <FormGroup className="mb-3">
                  <Label for="new-password" className="input-label">New password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 12 characters"
                      autoComplete="new-password"
                      className="custom-login-input"
                      minLength={12}
                      maxLength={72}
                      required
                    />
                  </div>
                </FormGroup>
                <FormGroup className="mb-3">
                  <Label for="confirm-password" className="input-label">Confirm new password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder="Enter your new password again"
                      autoComplete="new-password"
                      className="custom-login-input"
                      minLength={12}
                      maxLength={72}
                      required
                    />
                  </div>
                </FormGroup>
                <Button type="submit" color="primary" className="login-submit-btn" disabled={busy || !token}>
                  {busy ? <><Spinner size="sm" className="me-2" />Updating password...</> : <><span>Reset password</span><FiArrowRight size={17} className="btn-arrow" /></>}
                </Button>
              </Form>
            )}

            {!success && (
              <div className="login-help mt-3">
                <Link href="/forgot-password" className="text-link">Request a new reset link</Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
