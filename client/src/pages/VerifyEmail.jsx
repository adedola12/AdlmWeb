// Confirm your email (2026-09-18).
//
// Sign-up has sent a six-digit code since 1 Sep, but there was nowhere on the
// site to type it: of 109 sign-ups, one was confirmed. This is that screen.
// An account that has not confirmed its address is sent here and can do
// nothing else until it does (server/util/emailGate.js); from here it can
// enter the code, ask for a new one, or fix a mistyped address.

import React from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

export default function VerifyEmail() {
  const { user, accessToken, setAuth, clear } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [code, setCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [changing, setChanging] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent("/verify-email")}`} replace />;
  // Already confirmed: nothing to do here.
  if (user.emailVerified !== false) return <Navigate to={next} replace />;

  // The access token still says "unconfirmed" until it is reissued.
  async function refreshSession() {
    const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setAuth((prev) => ({ ...prev, ...data }));
      return true;
    }
    return false;
  }

  async function confirm(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) {
      setErr("The code is six digits. Check the email we sent and type all six.");
      return;
    }
    setBusy("confirm");
    try {
      const res = await apiAuthed("/auth/verify-email", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const refreshed = await refreshSession();
      if (!refreshed && res?.user) setAuth((prev) => ({ ...prev, user: res.user }));
      nav(next, { replace: true });
    } catch (e2) {
      setErr(e2.message || "That code could not be checked. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function resend() {
    setErr("");
    setMsg("");
    const wanted = changing ? email.trim().toLowerCase() : "";
    if (changing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wanted)) {
      setErr("That email address does not look right.");
      return;
    }
    setBusy("resend");
    try {
      const res = await apiAuthed("/auth/resend-verification", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wanted ? { email: wanted } : {}),
      });
      if (res?.alreadyVerified) {
        await refreshSession();
        nav(next, { replace: true });
        return;
      }
      if (res?.email && res.email !== user.email) {
        setAuth((prev) => ({ ...prev, user: { ...prev.user, email: res.email } }));
      }
      setChanging(false);
      setMsg(`A new code is on its way to ${res?.email || user.email}. It works for 30 minutes.`);
    } catch (e2) {
      setErr(e2.message || "A new code could not be sent just now.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-2">Confirm your email</h1>
      <p className="text-sm text-slate-600 dark:text-adlm-dark-muted mb-4">
        We sent a six-digit code to <b>{user.email}</b>. Enter it here to start using your
        account. It can take a minute to arrive; check spam too.
      </p>

      <form onSubmit={confirm} className="space-y-3">
        <input
          className="input tracking-[0.4em] text-center text-lg"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Six-digit code"
          autoFocus
        />
        <button className="btn w-full" disabled={!!busy}>
          {busy === "confirm" ? "Checking…" : "Confirm"}
        </button>
      </form>

      {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">{msg}</p>}

      <div className="mt-5 border-t border-slate-200 dark:border-adlm-dark-border pt-4 space-y-3 text-sm">
        {changing ? (
          <div className="space-y-2">
            <input
              className="input"
              type="email"
              placeholder="The right email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Correct email address"
            />
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={resend} disabled={!!busy}>
                {busy === "resend" ? "Sending…" : "Send the code there"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setChanging(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <button type="button" className="underline" onClick={resend} disabled={!!busy}>
              {busy === "resend" ? "Sending…" : "Send a new code"}
            </button>
            <button type="button" className="underline" onClick={() => setChanging(true)}>
              Wrong address? Change it
            </button>
            <button
              type="button"
              className="underline text-slate-500"
              onClick={() => {
                clear();
                nav("/", { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
