// Set or change the account password via POST /me/password.
//
// Accounts created through social login (Google) start without a password;
// for them this page is "Set a password" (no current-password field). The
// ADLM desktop plugins sign in with email+password only, so social users
// need to set one before they can use the plugins.
import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";
import { clearSetPasswordPrompt } from "../components/SetPasswordPrompt.jsx";

export default function ChangePassword() {
  const { accessToken } = useAuth();
  const [hasPassword, setHasPassword] = React.useState(null); // null = loading
  const [currentPassword, setCurrent] = React.useState("");
  const [newPassword, setNew] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const res = await apiAuthed("/me/profile", { token: accessToken });
        setHasPassword(!!res?.hasPassword);
      } catch {
        // Assume a password exists so we never skip the current-password
        // check in the UI; the server enforces it regardless.
        setHasPassword(true);
      }
    })();
  }, [accessToken]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg("");
    setErr("");

    if (newPassword !== confirm) {
      setErr("New passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await apiAuthed("/me/password", {
        token: accessToken,
        method: "POST",
        body: JSON.stringify(
          hasPassword ? { currentPassword, newPassword } : { newPassword },
        ),
      });
      clearSetPasswordPrompt();
      setMsg(
        hasPassword
          ? "Password changed. Other devices have been signed out."
          : "Password set. You can now sign into the ADLM desktop apps with your email and this password.",
      );
      setHasPassword(true);
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (e2) {
      setErr(e2?.message || "Couldn't update the password.");
    } finally {
      setBusy(false);
    }
  }

  const settingFirst = hasPassword === false;

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-1">
        {settingFirst ? "Set a password" : "Change password"}
      </h1>
      {settingFirst && (
        <p className="text-sm text-slate-500 mb-4">
          You signed up with Google, so your account has no password yet. Set
          one to also sign into the ADLM desktop apps (QUIV, Heron, MEP…),
          which use email + password.
        </p>
      )}

      <form onSubmit={submit} className="space-y-3">
        {hasPassword !== false && (
          <input
            className="input"
            placeholder="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        )}
        <input
          className="input"
          placeholder="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <input
          className="input"
          placeholder="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-slate-500">
          At least 8 characters, with at least one letter and one number.
        </p>
        {msg && <div className="text-green-700 text-sm">{msg}</div>}
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn w-full" disabled={busy || !accessToken}>
          {busy ? "Saving…" : settingFirst ? "Set password" : "Update password"}
        </button>
      </form>
    </div>
  );
}
