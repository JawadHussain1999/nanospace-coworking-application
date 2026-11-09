import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Alert,
  Button,
  Form,
  FormGroup,
  Input,
  Label,
  Spinner,
} from "reactstrap";
import {
  FiArrowRight,
  FiEye,
  FiEyeOff,
  FiShield,
  FiUsers,
  FiTrendingUp,
  FiMail,
  FiLock,
  FiActivity,
  FiZap,
  FiKey,
  FiClock,
  FiCheckCircle,
  FiSend,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { showSuccess, showError } from "../utils/toast";

export default function LoginPage() {
  const { user, login, loginWithOtp, sendOtp, ready } = useAuth();
  const router = useRouter();

  // Authentication mode: 'password' | 'otp'
  const [authMode, setAuthMode] = useState("password");
  const [otpStep, setOtpStep] = useState("request"); // 'request' | 'verify'
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [devOtp, setDevOtp] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onTouched",
  });

  const emailRegistration = register("email", {
    required: "Work email is required.",
    pattern: {
      value: /^[^\s@]+@[^\s@]+$/,
      message: "Enter a valid email address.",
    },
  });
  const { ref: emailRef, ...emailInputProps } = emailRegistration;

  const passwordRegistration = register("password", {
    required: "Password is required.",
    minLength: {
      value: 6,
      message: "Password must be at least 6 characters.",
    },
  });
  const { ref: passwordRef, ...passwordInputProps } = passwordRegistration;

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // Redirect if already authenticated
  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  // 1. Password Login Submission
  const submitPassword = async (values) => {
    setError("");
    setInfoMsg("");
    setBusy(true);
    try {
      const result = await login(values.email, values.password);
      if (!result.ok) {
        setError(result.message);
        showError(result.message);
      } else {
        showSuccess('Signed in successfully!');
        router.push("/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  // 2. Request OTP Code
  const handleRequestOtp = async (targetEmail) => {
    const emailToUse = (targetEmail || otpEmail || getValues("email") || "").trim().toLowerCase();
    if (!emailToUse || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
      setError("Please enter a valid work email address.");
      return;
    }
    setError("");
    setInfoMsg("");
    setBusy(true);
    try {
      const res = await sendOtp(emailToUse);
      if (!res.ok) {
        setError(res.message); showError(res.message);
      } else {
        showSuccess(res.data?.message || `Verification code sent to ${emailToUse}`);
        setOtpEmail(emailToUse);
        setOtpStep("verify");
        setCountdown(60);
        setInfoMsg(res.data?.message || `Verification code sent to ${emailToUse}`);
        if (res.data?.devOtp) {
          setDevOtp(res.data.devOtp);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // 3. Verify OTP & Sign In
  const handleVerifyOtp = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanCode = (otpCode || "").trim();
    if (cleanCode.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }
    setError("");
    setInfoMsg("");
    setBusy(true);
    try {
      const res = await loginWithOtp(otpEmail, cleanCode);
      if (!res.ok) {
        setError(res.message); showError(res.message);
      } else {
        showSuccess('Signed in successfully!');
        router.push("/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign in | NanoSpace Workspace</title>
        <meta
          name="description"
          content="Sign in to NanoSpace intelligent coworking management platform"
        />
      </Head>
      <div className="login-layout">
        {/* Left Hero Brand Panel */}
        <section className="login-brand-panel">
          {/* Dynamic Ambient Background Elements */}
          <div className="brand-orb orb-one" />
          <div className="brand-orb orb-two" />
          <div className="brand-orb orb-three" />
          <div className="brand-grid-overlay" />

          {/* Top Brand Logo */}
          <div className="login-brand-top">
            <div className="brand-logo-wrap">
              <img src="/nanospace-logo.png" alt="NanoSpace" />
            </div>
          </div>

          {/* Center Brand Hero Copy */}
          <div className="brand-copy">
            <div className="brand-chip">
              <FiZap className="chip-icon" />
              <span>SMART CO-WORKING PLATFORM</span>
            </div>
            <h1>
              Make space for
              <br />
              <span className="gradient-text">great work.</span>
            </h1>
            <p className="brand-subtext">
              One unified platform for branch operations, smart billing,
              real-time desk bookings and team collaboration across every workspace.
            </p>

            {/* Feature Highlights */}
            <div className="brand-feature-list">
              <div className="feature-item">
                <span className="feature-icon">
                  <FiTrendingUp />
                </span>
                <div className="feature-text">
                  <strong>Unified Analytics & Billing</strong>
                  <small>Automated invoicing and live revenue intelligence</small>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon">
                  <FiUsers />
                </span>
                <div className="feature-text">
                  <strong>Seamless Member Hub</strong>
                  <small>Effortless visitor check-ins and member passes</small>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon">
                  <FiShield />
                </span>
                <div className="feature-text">
                  <strong>Role-Based Access</strong>
                  <small>Tailored workspace permissions for staff and admins</small>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Brand Panel Footer Credit */}
          <div className="brand-panel-footer">
            <span>© 2026 NanoSpace Co-working</span>
            <span className="credit-author">
              Crafted by <strong>Jawad Hussain</strong> with{" "}
              <span className="footer-heart">♥</span>
            </span>
          </div>
        </section>

        {/* Right Form Panel */}
        <section className="login-form-panel">
          {/* Subtle Ambient Background Light */}
          <div className="form-panel-glow" />

          <div className="login-form-wrap">
            {/* Mobile Logo without Border Box */}
            <div className="mobile-login-logo">
              <img
                src="/nanospace-logo.png"
                alt="NanoSpace"
                className="mobile-logo-img"
              />
            </div>

            <div className="login-card-header">
              <div className="login-eyebrow">
                <FiActivity size={12} className="eyebrow-icon" />
                SECURE PORTAL ACCESS
              </div>
              <h2>Welcome back</h2>
              <p className="login-subtitle">
                Choose your preferred sign-in method to access your workspace.
              </p>
            </div>

            {/* Dual Auth Mode Segmented Control Tabs */}
            <div className="auth-mode-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "password"}
                className={`auth-tab-btn ${authMode === "password" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("password");
                  setError("");
                  setInfoMsg("");
                  if (otpEmail && !getValues("email")) {
                    setValue("email", otpEmail);
                  }
                }}
              >
                <FiLock className="auth-tab-icon" />
                <span>Password</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "otp"}
                className={`auth-tab-btn ${authMode === "otp" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("otp");
                  setError("");
                  setInfoMsg("");
                  const typedEmail = getValues("email");
                  if (typedEmail && !otpEmail) {
                    setOtpEmail(typedEmail);
                  }
                }}
              >
                <FiKey className="auth-tab-icon" />
                <span>Email OTP</span>
              </button>
            </div>

            {/* Global Error Banner */}
            {error && (
              <Alert color="danger" className="login-error-alert">
                {error}
              </Alert>
            )}

            {/* Global Success / Info Banner */}
            {infoMsg && (
              <Alert
                color="success"
                className="login-error-alert"
                style={{
                  background: "#f0fdf4",
                  color: "#166534",
                  borderColor: "#bbf7d0",
                }}
              >
                <FiCheckCircle className="me-2" />
                {infoMsg}
              </Alert>
            )}

            {/* ===================================================
                MODE 1: STANDARD PASSWORD LOGIN
               =================================================== */}
            {authMode === "password" && (
              <Form onSubmit={handleSubmit(submitPassword)} noValidate>
                <FormGroup className="mb-3">
                  <Label for="email" className="input-label">
                    Work email
                  </Label>
                  <div className={`input-field-wrapper ${errors.email ? "has-error" : ""}`}>
                    <span className="input-icon">
                      <FiMail />
                    </span>
                    <Input
                      id="email"
                      type="email"
                      invalid={Boolean(errors.email)}
                      {...emailInputProps}
                      innerRef={emailRef}
                      placeholder="name@company.com"
                      autoComplete="username"
                      aria-invalid={Boolean(errors.email)}
                      className="custom-login-input"
                    />
                  </div>
                  {errors.email && (
                    <small className="field-error-text">{errors.email.message}</small>
                  )}
                </FormGroup>

                <FormGroup className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <Label for="password" className="input-label mb-0">
                      Password
                    </Label>
                    <Link
                      href={{
                        pathname: "/forgot-password",
                        ...(getValues("email") ? { query: { email: getValues("email") } } : {}),
                      }}
                      className="text-link forgot-btn"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className={`input-field-wrapper ${errors.password ? "has-error" : ""}`}>
                    <span className="input-icon">
                      <FiLock />
                    </span>
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      invalid={Boolean(errors.password)}
                      {...passwordInputProps}
                      innerRef={passwordRef}
                      autoComplete="current-password"
                      aria-invalid={Boolean(errors.password)}
                      placeholder="Enter your password"
                      className="custom-login-input has-toggle"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  {errors.password && (
                    <small className="field-error-text">
                      {errors.password.message}
                    </small>
                  )}
                </FormGroup>

                <div className="remember-row">
                  <label className="remember-checkbox-label">
                    <input type="checkbox" defaultChecked className="custom-checkbox" />{" "}
                    <span>Keep me signed in</span>
                  </label>
                  <span className="secure-badge">
                    <FiShield size={12} /> 256-bit SSL
                  </span>
                </div>

                <Button
                  type="submit"
                  color="primary"
                  className="login-submit-btn"
                  disabled={busy || !ready}
                >
                  {busy ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <span>Sign In with Password</span>
                      <FiArrowRight size={17} className="btn-arrow" />
                    </>
                  )}
                </Button>
              </Form>
            )}

            {/* ===================================================
                MODE 2: EMAIL OTP LOGIN
               =================================================== */}
            {authMode === "otp" && (
              <div>
                {/* Step 2A: Enter Email to Request OTP */}
                {otpStep === "request" && (
                  <Form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRequestOtp();
                    }}
                  >
                    <FormGroup className="mb-3">
                      <Label for="otp-email" className="input-label">
                        Registered work email
                      </Label>
                      <div className="input-field-wrapper">
                        <span className="input-icon">
                          <FiMail />
                        </span>
                        <Input
                          id="otp-email"
                          type="email"
                          value={otpEmail}
                          onChange={(e) => setOtpEmail(e.target.value)}
                          placeholder="name@company.com"
                          autoComplete="email"
                          className="custom-login-input"
                          autoFocus
                          required
                        />
                      </div>
                      <small className="text-muted mt-1 d-block" style={{ fontSize: "11px" }}>
                        We will send a 6-digit verification code to this address.
                      </small>
                    </FormGroup>

                    <Button
                      type="submit"
                      color="primary"
                      className="login-submit-btn mt-2"
                      disabled={busy || !ready || !otpEmail.trim()}
                    >
                      {busy ? (
                        <>
                          <Spinner size="sm" className="me-2" />
                          Sending Code...
                        </>
                      ) : (
                        <>
                          <span>Send Verification Code</span>
                          <FiSend size={15} className="btn-arrow ms-1" />
                        </>
                      )}
                    </Button>
                  </Form>
                )}

                {/* Step 2B: Enter 6-digit OTP to Authenticate */}
                {otpStep === "verify" && (
                  <Form onSubmit={handleVerifyOtp}>
                    {/* Sent Email Banner */}
                    <div className="otp-sent-banner">
                      <div className="otp-sent-info">
                        <div className="otp-sent-icon">
                          <FiMail />
                        </div>
                        <div className="otp-sent-text text-truncate">
                          <span>Code dispatched to</span>
                          <strong className="text-truncate">{otpEmail}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="otp-change-email-btn"
                        onClick={() => {
                          setOtpStep("request");
                          setOtpCode("");
                          setError("");
                          setInfoMsg("");
                        }}
                      >
                        Change
                      </button>
                    </div>

                    {/* Development Mode Quick-Fill Pill */}
                    {devOtp && (
                      <div className="otp-dev-hint">
                        <span>
                          Test code: <strong>{devOtp}</strong>
                        </span>
                        <button
                          type="button"
                          className="otp-dev-fill-btn"
                          onClick={() => setOtpCode(devOtp)}
                        >
                          Fill Code
                        </button>
                      </div>
                    )}

                    <FormGroup className="mb-2">
                      <Label for="otp-code" className="input-label text-center d-block">
                        Enter 6-digit verification code
                      </Label>
                      <Input
                        id="otp-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength="6"
                        placeholder="••••••"
                        value={otpCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                          setOtpCode(val);
                        }}
                        className="custom-login-input otp-code-input"
                        autoFocus
                      />
                    </FormGroup>

                    {/* Resend OTP Row */}
                    <div className="otp-resend-row">
                      <span className="otp-resend-timer">
                        <FiClock size={12} />
                        {countdown > 0 ? (
                          <span>Resend in {countdown}s</span>
                        ) : (
                          <span>Code expired?</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="otp-resend-btn"
                        disabled={countdown > 0 || busy}
                        onClick={() => handleRequestOtp(otpEmail)}
                      >
                        Resend OTP
                      </button>
                    </div>

                    <Button
                      type="submit"
                      color="primary"
                      className="login-submit-btn"
                      disabled={busy || !ready || otpCode.length !== 6}
                    >
                      {busy ? (
                        <>
                          <Spinner size="sm" className="me-2" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <span>Verify & Sign In</span>
                          <FiArrowRight size={17} className="btn-arrow" />
                        </>
                      )}
                    </Button>
                  </Form>
                )}
              </div>
            )}

            <div className="login-card-footer-info">
              <div className="login-trust-row">
                <span>Enterprise Security</span>
                <span className="dot-sep">•</span>
                <span>Multi-branch Sync</span>
                <span className="dot-sep">•</span>
                <span>SOC-2 Ready</span>
              </div>
              <div className="login-help">
                New to NanoSpace? <Link href="/signup">Create a customer account</Link>
              </div>
            </div>
          </div>

          {/* Responsive Mobile / Tablet Footer Credit */}
          <footer className="login-page-footer">
            <span>© 2026 NanoSpace Co-working</span>
            <span className="footer-sep">•</span>
            <span className="credit-author">
              Crafted by <strong>Jawad Hussain</strong> with{" "}
              <span className="footer-heart">♥</span>
            </span>
          </footer>
        </section>
      </div>
    </>
  );
}
