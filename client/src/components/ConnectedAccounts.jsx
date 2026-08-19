// "Connected accounts" — Google, Microsoft and Autodesk, on the profile.
//
// Two things this is for. Someone who signed up with a password can attach a
// provider so the button works next time instead of offering to make them a
// second account. And someone who signed in with one provider can add the
// others, which matters here because a QS with an Autodesk account and a
// Microsoft work account is the normal case, not an edge one.
//
// Disconnecting the last way into an account is refused by the server rather
// than warned about, because no confirmation copy makes locking somebody out
// of their own account in one click reasonable.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import SocialSignIn from "./SocialSignIn.jsx";

const LABEL = { google: "Google", microsoft: "Microsoft", autodesk: "Autodesk" };
const ORDER = ["google", "microsoft", "autodesk"];

export default function ConnectedAccounts() {
  const { accessToken } = useAuth();
  const [state, setState] = React.useState(null);
  const [msg, setMsg] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    if (!accessToken) return;
    apiAuthed("/me/social", { token: accessToken })
      .then(setState)
      .catch(() => setState(null));
  }, [accessToken]);

  React.useEffect(load, [load]);

  // Landing back here after a connect carries ?connected=<provider>.
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("connected");
    if (p && LABEL[p]) {
      setMsg({ kind: "ok", text: `Your ${LABEL[p]} account is connected.` });
    }
  }, []);

  const disconnect = async (provider) => {
    setBusy(provider);
    setMsg(null);
    try {
      const res = await apiAuthed(`/me/social/${provider}`, {
        token: accessToken,
        method: "DELETE",
      });
      setMsg({ kind: "ok", text: res.message });
      load();
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "That did not work." });
    } finally {
      setBusy("");
    }
  };

  if (!state) return null;

  const anyAvailable = ORDER.some((p) => state.available?.[p]);
  const connected = ORDER.filter((p) => state.connected?.[p]);
  const connectable = ORDER.filter((p) => state.available?.[p] && !state.connected?.[p]);

  if (!anyAvailable) return null;

  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 p-4">
      <h2 className="font-semibold">Connected accounts</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
        Sign in to ADLM with any of these instead of your password. Connecting one does not
        change how you sign in today; it adds another way.
      </p>

      {connected.length > 0 && (
        <ul className="mt-4 space-y-2">
          {connected.map((p) => (
            <li
              key={p}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2"
            >
              <span className="text-sm">
                <b>{LABEL[p]}</b>
                <span className="text-slate-500"> · connected</span>
              </span>
              <button
                type="button"
                disabled={busy === p}
                onClick={() => disconnect(p)}
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-rose-700 disabled:opacity-60"
              >
                {busy === p ? "Removing…" : "Disconnect"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <p
          className={
            msg.kind === "err"
              ? "mt-3 text-sm rounded-md bg-rose-50 text-rose-800 px-3 py-2"
              : "mt-3 text-sm rounded-md bg-emerald-50 text-emerald-800 px-3 py-2"
          }
          role="status"
        >
          {msg.text}
        </p>
      )}

      {connectable.length > 0 && (
        <SocialSignIn
          connect
          only={connectable}
          divider={false}
          next="/profile"
          onError={(text) => text && setMsg({ kind: "err", text })}
        />
      )}

      {!state.hasPassword && connected.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          This account has no password, so the last connected provider cannot be removed. Set one
          above and it becomes possible.
        </p>
      )}
    </div>
  );
}
