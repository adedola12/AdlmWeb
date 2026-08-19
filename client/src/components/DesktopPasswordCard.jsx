// "Set a password for the desktop software."
//
// The gap this closes is invisible from the website and total on Windows.
// QUIV, HERON, RateGen, the Revit MEP plugin, Time Pro and CIVIQ all sign in
// through POST /auth/login with an email and a password. Somebody who created
// their ADLM account with Google or Microsoft has no password at all, so every
// one of those plugins rejects them with "Invalid credentials" — on an account
// that is valid, and quite possibly paid up.
//
// Nothing on the website would tell them why, because on the website they are
// signed in perfectly well. So this says it plainly, at the point it matters.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

export default function DesktopPasswordCard({ autoFocus = false }) {
  const { accessToken } = useAuth();

  const [status, setStatus] = React.useState(null);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const load = React.useCallback(() => {
    if (!accessToken) return;
    apiAuthed("/me/password/status", { token: accessToken })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [accessToken]);

  React.useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (next !== confirm) {
      setMsg({ kind: "err", text: "Those two passwords are not the same." });
      return;
    }

    setBusy(true);
    try {
      const res = await apiAuthed("/me/password", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: next,
          ...(status?.hasPassword ? { currentPassword: current } : {}),
        }),
      });
      setMsg({ kind: "ok", text: res.message });
      setCurrent("");
      setNext("");
      setConfirm("");
      load();
    } catch (err) {
      setMsg({ kind: "err", text: err.message || "That did not work." });
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const social = status.providers?.google || status.providers?.microsoft;
  const providerName = status.providers?.google ? "Google" : "Microsoft";

  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 p-4">
      <h2 className="font-semibold">
        {status.hasPassword ? "Change your password" : "Set a password for the desktop software"}
      </h2>

      {!status.hasPassword && (
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          You signed in with {social ? providerName : "a social account"}, which works on this
          website but not in the Windows software. QUIV, HERON, RateGen, the Revit MEP plugin,
          Time Pro and CIVIQ all ask for an email and a password. Set one here and use it there
          — your {social ? providerName : "social"} sign-in keeps working on the website.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 space-y-3 max-w-sm">
        {status.hasPassword && (
          <label className="block">
            <span className="text-sm text-slate-600 dark:text-slate-400">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
        )}

        <label className="block">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {status.hasPassword ? "New password" : "Password"}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            autoFocus={autoFocus && !status.hasPassword}
            className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <span className="text-xs text-slate-500">
            At least 8 characters, with a letter and a number.
          </span>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600 dark:text-slate-400">Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>

        {msg && (
          <p
            className={
              msg.kind === "err"
                ? "text-sm rounded-md bg-rose-50 text-rose-800 px-3 py-2"
                : "text-sm rounded-md bg-emerald-50 text-emerald-800 px-3 py-2"
            }
            role="status"
          >
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-md bg-adlm-blue-700 text-white text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Saving…" : status.hasPassword ? "Change password" : "Set password"}
        </button>
      </form>
    </div>
  );
}
