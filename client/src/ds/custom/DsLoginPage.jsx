// Sign in — his design, our authentication.
//
// WHY THIS EXISTS AND ds/pages/DsLogin.jsx DOES NOT GET ROUTED
//
// DsLogin.jsx is generated from his login.html by scripts/port-ds-html.mjs. It
// is his layout exactly, and it cannot sign anybody in. Its form is
//
//     <form action="/manage" method="get">
//
// so pressing Sign in navigates to /manage with the email and password in the
// QUERY STRING, never calls /auth/login, and lands on a protected route that
// bounces straight back to /login. Three more faults ride with it: the "Keep me
// signed in" box is `checked={true}` with no handler, so React warns and the
// box cannot be unticked; "Forgot your password?" points at /contact rather
// than a reset; and there is no second step, so an OTP-gated account cannot get
// in at all.
//
// Routing /login at that file would have put a handsome page in front of every
// customer and locked all of them out. So this is his markup — the same
// classes, the same art panel, the same copy — with pages/Login.jsx's logic
// behind it.
//
// WHAT HAD TO SURVIVE THE PORT
//
//   1. Password sign-in -> POST /auth/login.
//   2. THE OTP STEP. /auth/login answers { otpRequired, challenge, hint } for a
//      break-glass account; the code and password then go to /auth/login/otp.
//      The super-admin door and the desktop plugins' two-step both depend on
//      it, and it is the one flow a re-skin is most likely to drop because it
//      is invisible until an OTP account signs in.
//   3. Forgot password, both halves: /auth/password/forgot then
//      /auth/password/reset with the emailed code.
//   4. Social sign-in. His own file already slots in <SocialSignIn/>, so that
//      much of the port was right; it is kept in the same place.
//   5. ?next=, falling back to AFTER_SIGN_IN — the constant, not a sixth copy
//      of the landing decision.
//
// His file stays generated and unrouted, so re-running the porter still picks
// up his design changes without touching this.

import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../store.jsx";
import SocialSignIn from "../../components/SocialSignIn.jsx";
import { AFTER_SIGN_IN } from "../../lib/afterSignIn.js";

// His auth.css, code-split: only these two screens and the admin gate want it,
// so the marketing pages do not pay for it (see ds/DsAuthStyles.jsx).
const DsAuthStyles = React.lazy(() => import("../DsAuthStyles.jsx"));
import { trackEvent } from "../../ga.js";

export default function DsLoginPage() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const next = qs.get("next") || AFTER_SIGN_IN;
  const { setAuth } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [keep, setKeep] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // The break-glass second step.
  const [otpStage, setOtpStage] = React.useState(false);
  const [challenge, setChallenge] = React.useState("");
  const [otpCode, setOtpCode] = React.useState("");
  const [otpPassword, setOtpPassword] = React.useState("");
  const [otpBusy, setOtpBusy] = React.useState(false);
  const [otpMsg, setOtpMsg] = React.useState("");

  // Forgot password, in two stages like the page it replaces.
  const [showForgot, setShowForgot] = React.useState(false);
  const [fpEmail, setFpEmail] = React.useState("");
  const [fpCode, setFpCode] = React.useState("");
  const [fpNewPass, setFpNewPass] = React.useState("");
  const [fpStage, setFpStage] = React.useState("request");
  const [fpMsg, setFpMsg] = React.useState("");
  const [fpBusy, setFpBusy] = React.useState(false);

  function land(res) {
    setAuth({ user: res.user, accessToken: res.accessToken, licenseToken: res.licenseToken });
    nav(next, { replace: true });
  }

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      if (res?.otpRequired) {
        setChallenge(res.challenge || "");
        setOtpCode("");
        setOtpPassword("");
        setOtpMsg(`We emailed a 6-digit code to ${res.hint || "your email"}.`);
        setOtpStage(true);
        return;
      }
      trackEvent("login", { method: "password" });
      land(res);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    if (otpBusy) return;
    setErr("");
    setOtpBusy(true);
    try {
      const res = await api("/auth/login/otp", {
        method: "POST",
        body: JSON.stringify({ challenge, code: otpCode.trim(), password: otpPassword }),
      });
      trackEvent("login", { method: "otp" });
      setOtpStage(false);
      land(res);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setOtpBusy(false);
    }
  }

  async function sendResetCode(e) {
    e.preventDefault();
    if (fpBusy) return;
    setFpMsg("");
    setErr("");
    setFpBusy(true);
    try {
      await api("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ identifier: fpEmail.trim() }),
      });
      setFpMsg("We’ve sent a 6-digit code to your email.");
      setFpStage("verify");
    } catch (e2) {
      setFpMsg("");
      setErr(e2.message);
    } finally {
      setFpBusy(false);
    }
  }

  async function confirmReset(e) {
    e.preventDefault();
    if (fpBusy) return;
    setFpMsg("");
    setErr("");
    setFpBusy(true);
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({
          identifier: fpEmail.trim(),
          code: fpCode.trim(),
          newPassword: fpNewPass,
        }),
      });
      setFpMsg("Password updated. You can now sign in.");
      setShowForgot(false);
      setFpStage("request");
      setEmail(fpEmail);
    } catch (e2) {
      setFpMsg("");
      setErr(e2.message);
    } finally {
      setFpBusy(false);
    }
  }

  return (
    <div className="ds">
      <React.Suspense fallback={null}>
        <DsAuthStyles />
      </React.Suspense>
      <section className="auth2">
      {/* His art panel, unchanged. */}
      <div className="auth2-art">
        <img className="bg" src="/ds/ls-city.jpg" alt="" />
        <div className="auth2-art-in">
          <Link className="lg" to="/" aria-label="ADLM Studio home">
            <img src="/ds/logo-dark.svg" alt="ADLM Studio" />
          </Link>
          <h2>
            One account. <span>Every product, every machine.</span>
          </h2>
          <p>
            Your licences, your rate library and every project measured against it: reachable from
            Revit, from the Installer Hub, from a browser and from your phone.
          </p>
          <ul className="auth2-pts">
            <li>Sign in on a new laptop and your seats follow you</li>
            <li>The rate library belongs to the practice, not to a machine</li>
            <li>Work extracted from a model stays reachable without the model</li>
          </ul>
        </div>
      </div>

      <div className="auth2-form">
        <div className="auth2-card">
          {otpStage ? (
            <>
              <h1>Enter your code</h1>
              <p className="ds-sub">{otpMsg}</p>
              <form onSubmit={submitOtp} noValidate>
                <div className="ds-field">
                  <label htmlFor="otp-code">6-digit code</label>
                  <input
                    id="otp-code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                  />
                </div>
                <div className="ds-field">
                  <label htmlFor="otp-pass">Password</label>
                  <input
                    id="otp-pass"
                    type="password"
                    value={otpPassword}
                    onChange={(e) => setOtpPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                {err ? <p className="auth2-err" role="alert">{err}</p> : null}
                <button type="submit" className="ds-btn btn-p btn-full" disabled={otpBusy}>
                  {otpBusy ? "Checking…" : "Sign in"}
                </button>
              </form>
              <p className="authfoot">
                <button
                  type="button"
                  className="auth2-linkbtn"
                  onClick={() => {
                    setOtpStage(false);
                    setErr("");
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </>
          ) : showForgot ? (
            <>
              <h1>Reset your password</h1>
              <p className="ds-sub">
                {fpStage === "request"
                  ? "Tell us the address on the account and we'll send a code."
                  : "Enter the code we emailed, and the new password."}
              </p>
              <form onSubmit={fpStage === "request" ? sendResetCode : confirmReset} noValidate>
                <div className="ds-field">
                  <label htmlFor="fp-email">Email</label>
                  <input
                    id="fp-email"
                    type="email"
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="you@practice.ng"
                  />
                </div>
                {fpStage === "verify" ? (
                  <>
                    <div className="ds-field">
                      <label htmlFor="fp-code">6-digit code</label>
                      <input
                        id="fp-code"
                        value={fpCode}
                        onChange={(e) => setFpCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                      />
                    </div>
                    <div className="ds-field">
                      <label htmlFor="fp-new">New password</label>
                      <input
                        id="fp-new"
                        type="password"
                        value={fpNewPass}
                        onChange={(e) => setFpNewPass(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </>
                ) : null}
                {fpMsg ? <p className="auth2-note">{fpMsg}</p> : null}
                {err ? <p className="auth2-err" role="alert">{err}</p> : null}
                <button type="submit" className="ds-btn btn-p btn-full" disabled={fpBusy}>
                  {fpBusy ? "Working…" : fpStage === "request" ? "Send the code" : "Set the password"}
                </button>
              </form>
              <p className="authfoot">
                <button
                  type="button"
                  className="auth2-linkbtn"
                  onClick={() => {
                    setShowForgot(false);
                    setErr("");
                    setFpMsg("");
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </>
          ) : (
            <>
              <h1>Sign in</h1>
              <p className="ds-sub">
                New here? <Link to="/signup">Create an ADLM account</Link>
              </p>
              <form onSubmit={submit} noValidate>
                <div className="ds-field">
                  <label htmlFor="le">Email or username</label>
                  <input
                    id="le"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="you@practice.ng"
                  />
                </div>
                <div className="ds-field">
                  <label htmlFor="lp">Password</label>
                  <input
                    id="lp"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="auth2-row">
                  <label className="auth2-check">
                    <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                    <span>Keep me signed in</span>
                  </label>
                  {/* His file pointed this at /contact, which is not a reset. */}
                  <button
                    type="button"
                    className="auth2-linkbtn"
                    onClick={() => {
                      setShowForgot(true);
                      setFpEmail(email);
                      setErr("");
                    }}
                  >
                    Forgot your password?
                  </button>
                </div>
                {err ? <p className="auth2-err" role="alert">{err}</p> : null}
                <button type="submit" className="ds-btn btn-p btn-full" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
              <SocialSignIn next={next} />
              <p className="authfoot">
                Trouble signing in? <Link to="/contact#support">Contact support</Link>
              </p>
            </>
          )}
        </div>
      </div>
      </section>
    </div>
  );
}
