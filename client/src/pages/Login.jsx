// client/src/pages/Login.jsx
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

// Password field with a show/hide eye toggle. The toggle is a type="button"
// (so it never submits the form) and is kept out of the tab order, so Enter
// still submits the surrounding form as before.
function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
  autoComplete = "current-password",
  required = false,
  minLength,
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input
        className="input pr-10"
        placeholder={placeholder}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
      >
        {show ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Login() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const next = qs.get("next") || "/";
  const { setAuth } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // --- break-glass / God account OTP step ---
  // For OTP-gated accounts, /auth/login returns { otpRequired, challenge, hint }
  // instead of tokens. The user then enters the emailed code AND re-enters the
  // password, which /auth/login/otp verifies before issuing tokens.
  const [otpStage, setOtpStage] = React.useState(false);
  const [challenge, setChallenge] = React.useState("");
  const [otpHint, setOtpHint] = React.useState("");
  const [otpCode, setOtpCode] = React.useState("");
  const [otpPassword, setOtpPassword] = React.useState("");
  const [otpBusy, setOtpBusy] = React.useState(false);
  const [otpMsg, setOtpMsg] = React.useState("");

  // --- forgot password state ---
  const [showForgot, setShowForgot] = React.useState(false);
  const [fpEmail, setFpEmail] = React.useState("");
  const [fpCode, setFpCode] = React.useState("");
  const [fpNewPass, setFpNewPass] = React.useState("");
  const [fpStage, setFpStage] = React.useState("request"); // "request" | "verify"
  const [fpMsg, setFpMsg] = React.useState("");
  const [fpBusy, setFpBusy] = React.useState(false);

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

      // OTP-gated (break-glass) account → move to the code + password step.
      if (res?.otpRequired) {
        setChallenge(res.challenge || "");
        setOtpHint(res.hint || "");
        setOtpCode("");
        setOtpPassword("");
        setOtpMsg(`We emailed a 6-digit code to ${res.hint || "your email"}.`);
        setOtpStage(true);
        return;
      }

      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        licenseToken: res.licenseToken,
      });
      nav(next, { replace: true });
    } catch (e) {
      setErr(e.message);
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
        body: JSON.stringify({
          challenge,
          code: otpCode.trim(),
          password: otpPassword,
        }),
      });
      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        licenseToken: res.licenseToken,
      });
      setOtpStage(false);
      nav(next, { replace: true });
    } catch (e) {
      // Expired challenge → bounce back to the password step to start over.
      if (e?.data?.code === "CHALLENGE_EXPIRED" || e?.data?.code === "OTP_LOCKED") {
        setOtpStage(false);
        setErr(e.message);
      } else {
        setErr(e.message);
      }
    } finally {
      setOtpBusy(false);
    }
  }

  async function resendOtp() {
    if (otpBusy) return;
    setErr("");
    setOtpMsg("");
    setOtpBusy(true);
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      if (res?.otpRequired) {
        setChallenge(res.challenge || "");
        setOtpHint(res.hint || "");
        setOtpMsg(`A new code was sent to ${res.hint || "your email"}.`);
      }
    } catch (e) {
      setErr(e.message);
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
    } catch (e) {
      setFpMsg("");
      setErr(e.message);
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
      setEmail(fpEmail);
      setPassword("");
      setFpStage("request");
      setFpCode("");
      setFpNewPass("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setFpBusy(false);
    }
  }

  if (otpStage) {
    return (
      <div className="max-w-md mx-auto card">
        <h1 className="text-xl font-semibold mb-1">Secure sign-in</h1>
        <p className="text-sm text-slate-500 mb-4">
          This account requires an extra step. Enter the code we emailed
          {otpHint ? ` to ${otpHint}` : ""} and re-enter your password to finish.
        </p>

        <form onSubmit={submitOtp} className="space-y-3">
          <input
            className="input"
            placeholder="Enter 6-digit code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            required
            inputMode="numeric"
            maxLength={6}
            autoFocus
          />
          <PasswordInput
            placeholder="Re-enter password"
            value={otpPassword}
            onChange={(e) => setOtpPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {otpMsg && <div className="text-green-700 text-sm">{otpMsg}</div>}
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button className="btn w-full" disabled={otpBusy}>
            {otpBusy ? "Verifying…" : "Verify & sign in"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-adlm-blue-700 hover:underline"
            onClick={resendOtp}
            disabled={otpBusy}
          >
            Resend code
          </button>
          <button
            type="button"
            className="text-slate-500 hover:underline"
            onClick={() => {
              setOtpStage(false);
              setErr("");
              setOtpMsg("");
            }}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>

      {/* normal sign-in */}
      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Email or username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
        <PasswordInput
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="text-right">
          <button
            type="button"
            className="text-sm text-adlm-blue-700 hover:underline"
            onClick={() => {
              setShowForgot(true);
              setFpEmail(email);
            }}
          >
            Forgot password?
          </button>
        </div>
      </form>

      {/* forgot password panel */}
      {showForgot && (
        <div className="mt-6 p-4 rounded-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Reset password</h2>
            <button className="text-sm" onClick={() => setShowForgot(false)}>
              ✕
            </button>
          </div>

          {fpStage === "request" && (
            <form onSubmit={sendResetCode} className="space-y-3">
              <input
                className="input"
                placeholder="Email or username"
                value={fpEmail}
                onChange={(e) => setFpEmail(e.target.value)}
                required
              />
              {fpMsg && <div className="text-green-700 text-sm">{fpMsg}</div>}
              {err && <div className="text-red-600 text-sm">{err}</div>}
              <button className="btn w-full" disabled={fpBusy}>
                {fpBusy ? "Sending…" : "Send code"}
              </button>
            </form>
          )}

          {fpStage === "verify" && (
            <form onSubmit={confirmReset} className="space-y-3">
              <input
                className="input"
                placeholder="Enter 6-digit code"
                value={fpCode}
                onChange={(e) => setFpCode(e.target.value)}
                required
                inputMode="numeric"
                maxLength={6}
              />
              <PasswordInput
                placeholder="New password"
                value={fpNewPass}
                onChange={(e) => setFpNewPass(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              {fpMsg && <div className="text-green-700 text-sm">{fpMsg}</div>}
              {err && <div className="text-red-600 text-sm">{err}</div>}
              <button className="btn w-full" disabled={fpBusy}>
                {fpBusy ? "Updating…" : "Set new password"}
              </button>
              <button
                type="button"
                className="text-sm text-adlm-blue-700 hover:underline"
                onClick={() => setFpStage("request")}
              >
                Didn’t get a code? Resend
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
