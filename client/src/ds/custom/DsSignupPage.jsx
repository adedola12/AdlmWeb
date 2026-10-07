// Create an account — his design, our sign-up.
//
// Same split as DsLoginPage, for the same reason: ds/pages/DsSignup.jsx is
// generated from his signup.html and cannot create an account. Its form posts
// nowhere, so the page looks finished and produces no customer.
//
// WHAT HAD TO SURVIVE, AND WHY IT IS NOT JUST THE FIELDS
//
// His form collects the right five things — first, last, email, phone,
// password — and that is the easy half. The half a re-skin loses is everything
// that is not a field:
//
//   SIGN-UP PROTECTION. lib/signupTicket.js gives a form ticket and a hidden
//   honeypot (2026-09-22, after an adversarial review). The honeypot is read
//   off the FORM ELEMENT rather than from React state, deliberately: a bot that
//   sets the value directly never fires React's change events, so state would
//   stay empty and the trap would never spring. Dropping either reopens the
//   door that review closed.
//
//   REFERRAL ATTRIBUTION. readRef()/clearRef() carry who sent them, held since
//   they landed. Lose it and a referrer stops being credited, silently.
//
//   THE EMAIL GATE. The server answers emailVerified:false and the account can
//   do nothing until a code is entered, so sign-up goes to /verify-email rather
//   than to the overview. Sending them to the overview instead strands them on
//   a screen that refuses every action.
//
//   WHEN THE EVENT FIRES. trackEvent("sign_up") runs after the account exists,
//   not on submit — counting attempts would inflate the only number anyone
//   checks on this page.
//
// His generated file stays untouched, so re-running port-ds-html.mjs still
// picks up his design changes.

import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../store.jsx";
import { trackEvent } from "../../ga.js";
import SocialSignIn from "../../components/SocialSignIn.jsx";
import { AFTER_SIGN_IN } from "../../lib/afterSignIn.js";

// His auth.css, code-split: only these two screens and the admin gate want it,
// so the marketing pages do not pay for it (see ds/DsAuthStyles.jsx).
const DsAuthStyles = React.lazy(() => import("../DsAuthStyles.jsx"));
import { HONEYPOT_FIELD, useSignupTicket } from "../../lib/signupTicket.js";
import { clearRef, readRef } from "../../lib/referralRef.js";

/** Strip spaces and dashes; keep + and digits. Same rule as pages/Signup.jsx. */
function normalizeWhatsApp(v) {
  return (v || "").replace(/[^\d+]/g, "");
}

export default function DsSignupPage() {
  const nav = useNavigate();
  const { setAuth } = useAuth();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const getTicket = useSignupTicket();

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    // Read off the form element, not from state: a bot that sets the value
    // directly never fires React's change events.
    const trap = String(e.currentTarget.elements?.[HONEYPOT_FIELD]?.value || "");
    setErr("");
    setBusy(true);
    try {
      const ticket = await getTicket();
      const res = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          ticket,
          [HONEYPOT_FIELD]: trap,
          email,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          whatsapp: normalizeWhatsApp(whatsapp),
          ref: readRef(),
        }),
      });
      clearRef();
      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        licenseToken: res.licenseToken,
      });
      trackEvent("sign_up", { method: "password" });
      nav(
        res?.user?.emailVerified === false
          ? `/verify-email?next=${encodeURIComponent(AFTER_SIGN_IN)}`
          : AFTER_SIGN_IN,
      );
    } catch (e2) {
      setErr(e2.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ds">
      <React.Suspense fallback={null}>
        <DsAuthStyles />
      </React.Suspense>
      <section className="auth2">
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
            <li>Start free — no card, no call</li>
            <li>The rate library belongs to the practice, not to a machine</li>
            <li>Add a seat when somebody joins, drop it when they leave</li>
          </ul>
        </div>
      </div>

      <div className="auth2-form">
        <div className="auth2-card">
          <h1>Create your ADLM account</h1>
          <p className="ds-sub">
            Already have one? <Link to="/login">Sign in</Link>
          </p>

          <form id="su-form" onSubmit={submit} noValidate>
            <div className="ds-field">
              <label htmlFor="fn">First name</label>
              <input
                id="fn"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="ds-field">
              <label htmlFor="ln">Last name</label>
              <input
                id="ln"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
            <div className="ds-field">
              <label htmlFor="em">Email</label>
              <input
                id="em"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@practice.ng"
              />
            </div>
            <div className="ds-field">
              <label htmlFor="wa">WhatsApp number</label>
              <input
                id="wa"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                autoComplete="tel"
                placeholder="+234 810 650 3524"
              />
            </div>
            <div className="ds-field">
              <label htmlFor="pw">Password</label>
              <input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {/* The trap. Off-screen rather than display:none, which some bots
                skip, and never announced to a screen reader. */}
            <input
              type="text"
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />

            {err ? (
              <p className="auth2-err" role="alert">
                {err}
              </p>
            ) : null}

            <button type="submit" className="ds-btn btn-p btn-full" disabled={busy}>
              {busy ? "Creating your account…" : "Create account"}
            </button>
          </form>

          <SocialSignIn next={AFTER_SIGN_IN} />

          <p className="authfoot">
            By creating an account you agree to our <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
      </section>
    </div>
  );
}
