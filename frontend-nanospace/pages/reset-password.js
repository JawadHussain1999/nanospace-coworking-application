import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { Alert, Button, Form, FormGroup, Input, Label, Spinner } from "reactstrap";
import { FiArrowRight, FiCheckCircle, FiEye, FiEyeOff, FiLock, FiShield } from "react-icons/fi";
import { api, getApiErrorMessage } from "../services/api";
import PasswordStrengthHint, { isPasswordWithinLimit } from "../components/auth/PasswordStrengthHint";
import ConnectedNetwork from "../components/layout/ConnectedNetwork";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
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
    if (!isPasswordWithinLimit(password)) {
      setError("Password must be no more than 72 UTF-8 bytes.");
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
      <main className="login-layout login-home-layout">
        <div className="login-ambient-layer" aria-hidden="true">
          <div className="login-cursor-glow" />
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
            <div className="brand-chip"><FiShield className="chip-icon" /><span>ACCOUNT SECURITY</span></div>
            <h1>Secure your<br /><span className="gradient-text">workspace.</span></h1>
            <p className="brand-subtext">Create a strong, unique password to keep your NanoSpace account protected.</p>
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-wrap">
            <div className="mobile-login-logo">
              <div className="logo-orbit-wrap mobile-logo-orbit-wrap">
                <span className="logo-orbit logo-orbit-one" aria-hidden="true" />
                <span className="logo-orbit logo-orbit-two" aria-hidden="true" />
                <Image src="/nanospace-logo.png" alt="NanoSpace" width={235} height={60} className="mobile-logo-img" priority />
              </div>
            </div>
            <div className="login-card-header">
              <div className="login-eyebrow"><FiLock size={12} className="eyebrow-icon" /> ACCOUNT RECOVERY</div>
              <h2>Reset your password</h2>
              <p className="login-subtitle">Choose a unique password. The strength indicator will help you make it stronger.</p>
            </div>

            {error && <Alert color="danger" role="alert" className="login-error-alert">{error}</Alert>}
            {router.isReady && !token && (
              <Alert color="danger" role="alert" className="login-error-alert">
                This password reset link is invalid or has expired. <Link href="/forgot-password">Request a new link</Link>.
              </Alert>
            )}
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
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter a password"
                      autoComplete="new-password"
                      className="custom-login-input has-toggle"
                      maxLength={72}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  <PasswordStrengthHint password={password} />
                </FormGroup>
                <FormGroup className="mb-3">
                  <Label for="confirm-password" className="input-label">Confirm new password</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiLock /></span>
                    <Input
                      id="confirm-password"
                      type={showConfirmation ? "text" : "password"}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder="Enter your new password again"
                      autoComplete="new-password"
                      className="custom-login-input has-toggle"
                      maxLength={72}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"}
                      aria-pressed={showConfirmation}
                      onClick={() => setShowConfirmation((visible) => !visible)}
                    >
                      {showConfirmation ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </FormGroup>
                <Button type="submit" color="primary" className="login-submit-btn" disabled={busy || !token}>
                  {busy ? <><Spinner size="sm" className="me-2" />Updating password...</> : <><span>Reset password</span><FiArrowRight size={17} className="btn-arrow" /></>}
                </Button>
              </Form>
            )}

            {!success && (
              <div className="login-help mt-3">
                <Link href="/" className="text-link">Back to sign in</Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
