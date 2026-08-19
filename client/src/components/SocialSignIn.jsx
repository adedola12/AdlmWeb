// "Continue with Google" and "Continue with Microsoft".
//
// One component for both the sign-in and the create-account pages, because to
// the providers there is no difference: the same button either finds the
// account or makes it, and having two copies would mean two chances for them
// to drift.
//
// The provider SDKs are loaded on demand, not in index.html. They are third
// party scripts on the critical path of a page most visitors never open, and
// a visitor who signs in with a password should not be paying for Google's
// script to load, nor be identified to Google in order to read the form.
//
// Buttons are only drawn for providers the server says are configured — a
// "Continue with Microsoft" that fails on click because no client id is set is
// worse than no button at all.

import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";
import { trackEvent } from "../ga";

const GOOGLE_SRC = "https://accounts.google.com/gsi/client";
const MS_SRC = "https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js";

/** Load a script once, and hand every later caller the same promise. */
const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("That sign-in service could not be reached."));
        document.head.appendChild(s);
      }),
    );
  }
  return loaded.get(src);
}

/**
 * @param {object} props
 * @param {string} [props.next]   where to go once signed in
 * @param {(msg: string) => void} [props.onError]
 */
export default function SocialSignIn({ next = "/dashboard", onError }) {
  const { setAuth } = useAuth();
  const nav = useNavigate();

  const [providers, setProviders] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const googleBtn = React.useRef(null);

  const fail = React.useCallback(
    (msg) => {
      setBusy("");
      if (onError) onError(msg);
    },
    [onError],
  );

  React.useEffect(() => {
    let alive = true;
    api("/auth/providers")
      .then((p) => alive && setProviders(p))
      .catch(() => alive && setProviders({ google: false, microsoft: false }));
    return () => {
      alive = false;
    };
  }, []);

  // Hand the verified token to our server and take the session it returns.
  const complete = React.useCallback(
    async (provider, credential) => {
      setBusy(provider);
      try {
        const res = await api("/auth/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, credential }),
        });
        setAuth({ user: res.user, accessToken: res.accessToken, licenseToken: null });
        trackEvent("login", { method: provider });

        // A social account has no password, and every Windows plugin signs in
        // with one. Send them somewhere that says so rather than leaving them
        // to discover it when QUIV rejects them.
        nav(res.needsPassword ? "/profile?setPassword=1" : next, { replace: true });
      } catch (e) {
        fail(e.message || "That sign-in did not complete.");
      }
    },
    [setAuth, nav, next, fail],
  );

  // ── Google ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!providers?.google || !googleBtn.current) return;
    let alive = true;

    (async () => {
      try {
        await loadScript(GOOGLE_SRC);
        if (!alive || !window.google?.accounts?.id) return;

        // The client id is public by design: it identifies the application,
        // it authorises nothing, and Google's own button embeds it in the
        // page. The token it produces is verified server-side.
        const clientId = providers.googleClientId;
        if (!clientId || !alive) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => complete("google", credential),
        });
        window.google.accounts.id.renderButton(googleBtn.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
        });
      } catch (e) {
        fail(e.message);
      }
    })();

    return () => {
      alive = false;
    };
  }, [providers, complete, fail]);

  // ── Microsoft ────────────────────────────────────────────────────────────
  const microsoft = async () => {
    setBusy("microsoft");
    try {
      await loadScript(MS_SRC);
      if (!window.msal) throw new Error("The Microsoft sign-in library did not load.");

      const app = new window.msal.PublicClientApplication({
        auth: {
          clientId: providers.microsoftClientId,
          authority: `https://login.microsoftonline.com/${providers.microsoftTenant || "common"}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: "sessionStorage" },
      });
      if (app.initialize) await app.initialize();

      // openid + profile + email is all we ask for. Anything wider would be a
      // consent screen listing permissions we have no use for, on a button
      // whose only job is to establish who somebody is.
      const result = await app.loginPopup({ scopes: ["openid", "profile", "email"] });
      const idToken = result?.idToken;
      if (!idToken) throw new Error("Microsoft returned no sign-in token.");
      await complete("microsoft", idToken);
    } catch (e) {
      // Closing the popup is a choice, not a failure worth shouting about.
      const cancelled = /user_cancelled|popup_window_error|closed/i.test(e?.message || "");
      fail(cancelled ? "" : e.message || "That sign-in did not complete.");
    }
  };

  if (!providers || (!providers.google && !providers.microsoft)) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <div className="mt-4 space-y-2">
        {providers.google && <div ref={googleBtn} className="flex justify-center" />}

        {providers.microsoft && (
          <button
            type="button"
            onClick={microsoft}
            disabled={!!busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
          >
            <svg viewBox="0 0 21 21" className="w-4 h-4" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {busy === "microsoft" ? "One moment…" : "Continue with Microsoft"}
          </button>
        )}
      </div>
    </div>
  );
}
