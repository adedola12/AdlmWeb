// Dismissible prompt shown after a social (Google) sign-in for an account
// that has no password yet. ADLM desktop plugins (QUIV, Heron, MEP, …) sign
// in with email+password only, so social-created accounts can't use them
// until a password is set from the profile / change-password page.
//
// Login/Signup set the localStorage flag when /auth/google returns
// hasPassword:false; ChangePassword clears it once a password is saved.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";

export const SET_PASSWORD_PROMPT_KEY = "adlm.setPasswordPrompt";

export function requestSetPasswordPrompt() {
  try {
    localStorage.setItem(SET_PASSWORD_PROMPT_KEY, "1");
  } catch {
    // Ignore storage errors in restricted browser environments.
  }
}

export function clearSetPasswordPrompt() {
  try {
    localStorage.removeItem(SET_PASSWORD_PROMPT_KEY);
  } catch {
    // Ignore storage errors in restricted browser environments.
  }
}

export default function SetPasswordPrompt() {
  const { user, accessToken } = useAuth();
  const location = useLocation();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      setVisible(
        !!accessToken && localStorage.getItem(SET_PASSWORD_PROMPT_KEY) === "1",
      );
    } catch {
      setVisible(false);
    }
  }, [accessToken, location.pathname]);

  // Not signed in, nothing requested, or already on the set-password page.
  if (!visible || !user || location.pathname === "/change-password") {
    return null;
  }

  function dismiss() {
    clearSetPasswordPrompt();
    setVisible(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-adlm-dark-card shadow-depth p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm">
            Set a password for ADLM desktop apps
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            You signed in with Google. The ADLM desktop plugins (QUIV, Heron,
            MEP…) sign in with email + password, so set one to use them.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Link to="/change-password" className="btn btn-sm" onClick={() => setVisible(false)}>
              Set password
            </Link>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={dismiss}
            >
              Maybe later
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-slate-400 hover:text-slate-600"
          onClick={dismiss}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
