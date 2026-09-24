// The admin sign-in — his screen, on our authentication.
//
// His note is the specification, and it is the reason this is a separate
// screen at all rather than a flag on /login: "an admin session is not a
// customer session with a flag on it." So the address is checked before
// anything is sent, in his words, and an account that turns out not to hold
// admin is signed straight back out rather than left half-in.
//
// WHAT HIS BUILD COULD NOT DO, AND THIS HAS TO
//
// His had no server, so it validated and then simply navigated. Ours meets a
// real /auth/login, and that endpoint has a second step his screen never saw:
// the break-glass God account (admin@adlmstudio.net) answers `otpRequired`
// instead of a token, and wants a six-digit emailed code AND the password
// again before it will issue one. That is deliberate — a support account that
// can sign in to any machine with any product should not be one password away
// — so the screen grew a second step rather than the account losing its gate.
// The second step is his card with its two fields swapped; every class is his.
//
// THE DOMAIN RULE
//
// He refuses anything that is not @adlmstudio.net. Kept, as asked, and it is
// worth being clear that it is a courtesy rather than the security boundary:
// the real authority is the role on the account, checked below against what
// the server returns. A customer who typed an ADLM address would still be
// turned away, because the server would hand back an account with no admin
// role and this signs that session out again.
//
// His markup: .adm-gate / .adm-gate-art / .adm-gate-card / .adm-gate-mark /
// .adm-gate-sub / .adm-gate-pw / .adm-gate-eye / .adm-gate-err /
// .adm-gate-foot, with .ds-btn.btn-p on the submit.

import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";
import { isStaff } from "../utils/roles.js";
import "../styles/ds-admin.css";

const ADLM = /@adlmstudio\.net$/i;
const EMAILISH = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function DsAdminLogin() {
  const { setAuth, clear } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/admin";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [shown, setShown] = React.useState(false);
  // Arriving here from a screen that turned the current session away. Said
  // once, on the form, rather than as a silent redirect that looks like the
  // page went missing.
  const [err, setErr] = React.useState(
    params.get("denied")
      ? "You are signed in, but not as an admin. Sign in with the account ADLM granted admin rights to."
      : "",
  );
  const [busy, setBusy] = React.useState(false);

  // The God account's second step. Held here rather than on its own route so a
  // half-finished sign-in cannot be linked to or reloaded into.
  const [challenge, setChallenge] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [code, setCode] = React.useState("");
  const [again, setAgain] = React.useState("");

  const emailRef = React.useRef(null);
  const pwRef = React.useRef(null);
  const codeRef = React.useRef(null);

  const fail = (msg, ref) => {
    setErr(msg);
    ref?.current?.focus();
    return false;
  };

  /** Signed in as somebody who holds no admin area at all. */
  const rejectNonAdmin = () => {
    clear();
    setChallenge("");
    setCode("");
    setAgain("");
    setPassword("");
    return fail(
      "That account signed in, but it holds no admin rights. Ask ADLM to grant them, or sign in at /login as a customer.",
      emailRef,
    );
  };

  const finish = (res) => {
    if (!isStaff(res?.user)) return rejectNonAdmin();
    setAuth({
      user: res.user,
      accessToken: res.accessToken,
      licenseToken: res.licenseToken,
    });
    nav(next, { replace: true });
    return true;
  };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");

    const a = email.trim();
    // His checks, his words, in his order.
    if (!a) return fail("Enter the email address ADLM granted admin rights to.", emailRef);
    if (!EMAILISH.test(a)) return fail("That does not look like an email address.", emailRef);
    if (!ADLM.test(a)) {
      return fail("Admin is for ADLM addresses. Customers sign in at /login.", emailRef);
    }
    if (!password) return fail("Enter your password.", pwRef);
    if (password.length < 8) return fail("That password is too short to be one of ours.", pwRef);

    setBusy(true);
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: a, password }),
      });

      // The break-glass account. No token yet — a code is in the post.
      if (res?.otpRequired) {
        setChallenge(res.challenge || "");
        setHint(res.hint || "");
        setCode("");
        setAgain("");
        return;
      }

      finish(res);
    } catch (e2) {
      setErr(e2?.message || "That sign-in did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (!code.trim()) return fail("Enter the six-digit code we emailed you.", codeRef);
    if (!again) return fail("Enter your password again to confirm it is you.", pwRef);

    setBusy(true);
    try {
      const res = await api("/auth/login/otp", {
        method: "POST",
        body: JSON.stringify({ challenge, code: code.trim(), password: again }),
      });
      finish(res);
    } catch (e2) {
      // An expired or spent challenge cannot be retried — the code is gone and
      // a new one has to be sent, so this goes back to the first step rather
      // than letting somebody type into a dead form.
      const c = e2?.data?.code;
      if (c === "CHALLENGE_EXPIRED" || c === "OTP_LOCKED") {
        setChallenge("");
        setErr(
          c === "OTP_LOCKED"
            ? "Too many wrong codes. Start again, and a fresh one will be sent."
            : "That code has expired. Sign in again and we will send a new one.",
        );
      } else {
        setErr(e2?.message || "That code did not work.");
      }
    } finally {
      setBusy(false);
    }
  }

  const otp = Boolean(challenge);

  return (
    <div className="ds">
      <div className="adm-gate">
        <div className="adm-gate-art" aria-hidden="true" />
        <form className="adm-gate-card" id="adm-login" noValidate onSubmit={otp ? submitOtp : submit}>
          <Link className="adm-gate-mark" to="/" aria-label="ADLM Studio">
            <img className="logo-l" src="/ds/logo-light.svg" alt="ADLM Studio" />
            <img className="logo-d" src="/ds/logo-dark.svg" alt="ADLM Studio" />
            <span className="tag">Admin</span>
          </Link>

          <h1>{otp ? "One more step" : "Sign in to admin"}</h1>
          <p className="adm-gate-sub">
            {otp
              ? `This account can sign in to any machine with any ADLM product, so a password alone is not enough. We emailed a six-digit code to ${hint || "your address"}.`
              : "Not the account you use as a customer. Admin rights are granted by ADLM, and two people hold them."}
          </p>

          {otp ? (
            <>
              <label>
                Six-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  ref={codeRef}
                  value={code}
                  onChange={(ev) => {
                    setCode(ev.target.value);
                    setErr("");
                  }}
                  required
                />
              </label>
              <label>
                Password, again
                <span className="adm-gate-pw">
                  <input
                    type={shown ? "text" : "password"}
                    autoComplete="current-password"
                    ref={pwRef}
                    value={again}
                    onChange={(ev) => {
                      setAgain(ev.target.value);
                      setErr("");
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="adm-gate-eye"
                    onClick={() => setShown((v) => !v)}
                    aria-label={shown ? "Hide password" : "Show password"}
                  >
                    {shown ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
            </>
          ) : (
            <>
              <label>
                Work email
                <input
                  type="email"
                  id="adm-email"
                  name="email"
                  autoComplete="username"
                  placeholder="you@adlmstudio.net"
                  ref={emailRef}
                  value={email}
                  onChange={(ev) => {
                    setEmail(ev.target.value);
                    setErr("");
                  }}
                  required
                />
              </label>
              <label>
                Password
                <span className="adm-gate-pw">
                  <input
                    type={shown ? "text" : "password"}
                    id="adm-pw"
                    name="pw"
                    autoComplete="current-password"
                    ref={pwRef}
                    value={password}
                    onChange={(ev) => {
                      setPassword(ev.target.value);
                      setErr("");
                    }}
                    required
                  />
                  {/* His: a password typed wrong twice is the commonest way
                      into a lockout, and nobody can proof-read dots. */}
                  <button
                    type="button"
                    className="adm-gate-eye"
                    data-adm-eye=""
                    onClick={() => setShown((v) => !v)}
                    aria-label={shown ? "Hide password" : "Show password"}
                  >
                    {shown ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
            </>
          )}

          <p className="adm-gate-err" id="adm-err" role="alert" hidden={!err}>
            {err}
          </p>

          <button className="ds-btn btn-p" type="submit" id="adm-go" disabled={busy}>
            {busy ? "Checking…" : otp ? "Confirm and sign in" : "Sign in"}
          </button>

          <p className="adm-gate-foot">
            Everything done from here is written against your name, who did it, to what, and what
            it looked like before. Viewing a customer account as they see it is a separate action,
            and it is announced on their timeline.
          </p>
        </form>
      </div>
    </div>
  );
}
