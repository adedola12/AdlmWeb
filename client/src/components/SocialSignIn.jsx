// "Continue with Google / Microsoft / Autodesk".
//
// One component for signing in, creating an account, and connecting a provider
// to an account that already exists — to the providers those are the same
// journey, and three copies would be three chances to drift.
//
// The buttons are ours, carrying each company's real mark, so the three read
// as one set. See lib/socialAuth.js for why there is no vendor SDK behind
// them.
//
// Only providers the server says are configured are drawn. A button that fails
// on click because no client id is set is worse than no button.

import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { startSocialAuth } from "../lib/socialAuth.js";
import { AFTER_SIGN_IN } from "../lib/afterSignIn.js";

// The official marks, as SVG so they stay sharp and need no network request.
const LOGOS = {
  google: (
    <svg viewBox="0 0 18 18" className="w-[18px] h-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.65 3.58 9 3.58z"
      />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 21 21" className="w-[18px] h-[18px]" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  ),
  // Autodesk's mark is a single-colour wordmark rather than a coloured glyph,
  // so it takes currentColor and reads correctly in both themes.
  autodesk: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
      <path fill="currentColor" d="M3.6 17.4 14.1 6.6h6.3v10.8H3.6zm11.7-8.7-7.1 7.3h11V8.7h-3.9z" />
    </svg>
  ),
};

const LABEL = {
  google: "Google",
  microsoft: "Microsoft",
  autodesk: "Autodesk",
};

const ORDER = ["google", "microsoft", "autodesk"];

/**
 * @param {object} props
 * @param {string} [props.next]      where to go once signed in
 * @param {boolean} [props.connect]  connect to the signed-in account instead
 * @param {(msg: string) => void} [props.onError]
 * @param {string[]} [props.only]    restrict to these providers
 * @param {boolean} [props.divider]  draw the "or" rule above the buttons
 */
export default function SocialSignIn({
  next = AFTER_SIGN_IN,
  connect = false,
  onError,
  only = null,
  divider = true,
}) {
  const [providers, setProviders] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  useNavigate(); // the redirect leaves the SPA; kept so the hook order is stable

  // Ask the server which providers are configured, and retry once if it does
  // not answer.
  //
  // A single failed call used to remove every social button for the rest of
  // that page load, silently — which is exactly what happened while the API
  // was restarting: the page looked like a build with no social sign-in at
  // all, rather than one that could not reach its own server for a moment.
  React.useEffect(() => {
    let alive = true;
    let timer = null;

    const ask = (attempt = 0) =>
      api("/auth/providers")
        .then((p) => alive && setProviders(p))
        .catch(() => {
          if (!alive) return;
          if (attempt === 0) {
            timer = setTimeout(() => ask(1), 1500);
            return;
          }
          // Twice is enough to distinguish a restart from a real absence.
          setProviders({ endpoints: {} });
        });

    ask();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const go = async (provider) => {
    setBusy(provider);
    try {
      await startSocialAuth(provider, providers.endpoints[provider], { next, connect });
    } catch (e) {
      setBusy("");
      if (onError) onError(e.message || "That sign-in could not be started.");
    }
  };

  const shown = ORDER.filter(
    (p) => providers?.[p] && providers.endpoints?.[p] && (!only || only.includes(p)),
  );
  if (!providers || !shown.length) return null;

  return (
    <div className="mt-6">
      {divider && (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          or
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
      )}

      <div className={`${divider ? "mt-4" : ""} space-y-2`}>
        {shown.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            disabled={!!busy}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-md border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
          >
            {LOGOS[p]}
            {busy === p
              ? "Redirecting…"
              : `${connect ? "Connect" : "Continue with"} ${LABEL[p]}`}
          </button>
        ))}
      </div>
    </div>
  );
}
