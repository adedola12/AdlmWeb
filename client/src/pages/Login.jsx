// client/src/pages/Login.jsx
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

export default function Login() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const next = qs.get("next") || "/";
  const { setAuth } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

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
        <input
          className="input"
          placeholder="Password"
          type="password"
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
            className="text-sm text-blue-600 hover:underline"
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
              <input
                className="input"
                placeholder="New password"
                type="password"
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
                className="text-sm text-blue-600 hover:underline"
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
