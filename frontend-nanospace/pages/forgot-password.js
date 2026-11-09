import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Alert, Button, Form, FormGroup, Input, Label, Spinner } from "reactstrap";
import { FiArrowRight, FiCheckCircle, FiLock, FiMail, FiShield } from "react-icons/fi";
import { api, getApiErrorMessage } from "../services/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devResetToken, setDevResetToken] = useState("");

  const queryEmail = typeof router.query.email === "string" ? router.query.email : "";
  const emailValue = email ?? queryEmail;

  const submitRequest = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await api.auth.forgotPassword({ email: emailValue.trim().toLowerCase() });
      setDevResetToken(response.devResetToken || "");
      setSubmitted(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not request a password reset."));
    } finally {
      setBusy(false);
    }
  };

  const continueToReset = () => {
    router.push({ pathname: "/reset-password", query: { token: devResetToken } });
  };

  return (
    <>
      <Head>
        <title>Forgot password | NanoSpace Workspace</title>
        <meta name="description" content="Request a secure NanoSpace password reset link." />
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
            <h1>Back to your<br /><span className="gradient-text">workspace.</span></h1>
            <p className="brand-subtext">Reset your password securely and get back to the work that matters.</p>
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
              <h2>Forgot password?</h2>
              <p className="login-subtitle">Enter your account email and we’ll send a secure reset link.</p>
            </div>

            {error && <Alert color="danger" role="alert" className="login-error-alert">{error}</Alert>}
            {submitted ? (
              <div>
                <Alert color="success" role="status" className="login-error-alert">
                  <FiCheckCircle className="me-2" />
                  If an active account exists for that email, password reset instructions will be sent.
                </Alert>
                {devResetToken && (
                  <Button type="button" color="primary" className="login-submit-btn" onClick={continueToReset}>
                    <span>Continue to choose a new password</span>
                    <FiArrowRight size={17} className="btn-arrow" />
                  </Button>
                )}
              </div>
            ) : (
              <Form onSubmit={submitRequest}>
                <FormGroup className="mb-3">
                  <Label for="reset-email" className="input-label">Work email</Label>
                  <div className="input-field-wrapper">
                    <span className="input-icon"><FiMail /></span>
                    <Input
                      id="reset-email"
                      type="email"
                      value={emailValue}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      className="custom-login-input"
                      required
                      autoFocus
                    />
                  </div>
                </FormGroup>
                <Button type="submit" color="primary" className="login-submit-btn" disabled={busy || !emailValue.trim()}>
                  {busy ? <><Spinner size="sm" className="me-2" />Sending link...</> : <><span>Send reset link</span><FiArrowRight size={17} className="btn-arrow" /></>}
                </Button>
              </Form>
            )}

            <div className="login-help mt-3">
              <Link href="/" className="text-link">Back to sign in</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
