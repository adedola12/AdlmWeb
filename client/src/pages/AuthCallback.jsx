// Where Google, Microsoft and Autodesk send the browser back to.
//
// One route for all three, and for both jobs the flow serves: signing in, and
// connecting a provider to an account that is already signed in. Which of
// those it is was decided before the redirect and travels in sessionStorage,
// so a link to this page on its own does nothing.

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { trackEvent } from "../ga";
import { finishSocialAuth } from "../lib/socialAuth.js";

// Codes already handed to the server, kept OUTSIDE the component.
//
// An authorization code is single use. React's StrictMode remounts a component
// in development, and a remount creates a fresh ref — so a `useRef` guard does
// not survive it, and the second run redeems a code the first one already
// used. The provider answers "the code has expired", which is true and reads
// like a real failure sitting underneath the real one.
//
// Module scope survives the remount. Not a development-only nicety either: a
// double-submit or a fast refresh would do the same thing.
const seen = new Set();

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { setAuth, accessToken } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    // Keyed on the code itself, so two different sign-ins in one session are
    // both still allowed through.
    const thisCode = params.get("code");
    if (!thisCode || seen.has(thisCode)) return;
    seen.add(thisCode);

    (async () => {
      try {
        const { provider, code, codeVerifier, redirectUri, next, connect } =
          await finishSocialAuth(params);

        if (connect) {
          await apiAuthed("/me/social/connect", {
            token: accessToken,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, code, codeVerifier, redirectUri }),
          });
          nav(`${next}?connected=${provider}`, { replace: true });
          return;
        }

        const res = await api("/auth/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, code, codeVerifier, redirectUri }),
        });
        setAuth({ user: res.user, accessToken: res.accessToken, licenseToken: null });
        trackEvent("login", { method: provider });

        // A social account has no password, and every Windows plugin signs in
        // with one. Say so now rather than leaving them to find out when QUIV
        // rejects them.
        nav(res.needsPassword ? "/profile?setPassword=1" : next, { replace: true });
      } catch (e) {
        setErr(e.message || "That sign-in did not complete.");
      }
    })();
  }, [params, setAuth, nav, accessToken]);

  return (
    <div className="max-w-md mx-auto p-8 text-center">
      {err ? (
        <>
          <h1 className="text-lg font-semibold">That sign-in did not complete</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{err}</p>
          <button
            className="mt-5 px-4 py-2 rounded-md border text-sm"
            onClick={() => nav("/login", { replace: true })}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">Signing you in…</p>
      )}
    </div>
  );
}
