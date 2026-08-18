/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { API_BASE } from "./config";
import { useHydrated } from "./lib/useHydrated.js";
import { setAnalyticsUser } from "./ga";

const AuthCtx = React.createContext({
  user: null,
  accessToken: null,
  licenseToken: null,
  setAuth: () => {},
  clear: () => {},
});

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function syncLegacyTokenKeys(_accessToken) {
  // Legacy token keys removed — tokens should not be duplicated across
  // multiple localStorage keys as each copy increases XSS exposure surface.
  // The auth object in "auth" key is the single source of truth.
  try {
    ["accessToken", "adlm_accessToken", "token", "access_token"].forEach((k) =>
      localStorage.removeItem(k),
    );
  } catch {
    // Ignore storage errors in restricted browser environments.
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = React.useState(() => {
    try {
      const raw = localStorage.getItem("auth");
      return raw
        ? safeJsonParse(raw, {
            user: null,
            accessToken: null,
            licenseToken: null,
          })
        : { user: null, accessToken: null, licenseToken: null };
    } catch {
      return { user: null, accessToken: null, licenseToken: null };
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem("auth", JSON.stringify(auth));
      syncLegacyTokenKeys(auth?.accessToken);
    } catch {
      // Ignore storage errors in restricted browser environments.
    }
  }, [auth]);

  React.useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (auth.accessToken) return;
      try {
        if (!API_BASE) return;
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAuth((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Ignore refresh failures and leave auth empty.
      }
    }

    hydrate();

    const onRefreshed = (e) => setAuth((prev) => ({ ...prev, ...e.detail }));
    window.addEventListener("auth:refreshed", onRefreshed);

    return () => {
      cancelled = true;
      window.removeEventListener("auth:refreshed", onRefreshed);
    };
  }, [auth.accessToken]);

  React.useEffect(() => {
    const id = setInterval(async () => {
      try {
        if (!API_BASE) return;
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAuth((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Ignore background refresh failures and keep current session state.
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(id);
  }, []);

  const clear = React.useCallback(() => {
    const empty = { user: null, accessToken: null, licenseToken: null };
    setAuth(empty);
    try {
      localStorage.setItem("auth", JSON.stringify(empty));
      syncLegacyTokenKeys("");
    } catch {
      // Ignore storage errors in restricted browser environments.
    }
  }, []);

  // The server renders every page signed out — it has no localStorage and no
  // session. The browser reads localStorage during its first render, so on a
  // server-rendered page a signed-in visitor produces different markup than the
  // HTML being hydrated. React responds by discarding the server-rendered
  // subtree and rebuilding it, which is a visible flash and, on the nav, throws
  // away the internal links a crawler was meant to follow.
  //
  // Withholding `user` for one frame makes the first client render agree with
  // the HTML. Gated here rather than in each consumer because Nav, Home and
  // Products all branch on it and the next one to do so should not have to know
  // any of this. `accessToken` is deliberately NOT withheld: nothing renders
  // from it directly, and effects that authenticate a fetch need it on mount.
  const hydrated = useHydrated();

  // Tell GA4 who this is, so a subscriber on a laptop and the same subscriber
  // on a phone stop counting as two separate users. Keyed on the account id
  // only; no email or name is sent, because Google's terms forbid PII in
  // Analytics. Runs in an effect so it never fires during a server render.
  React.useEffect(() => {
    setAnalyticsUser(auth?.user?._id || auth?.user?.id || null);
  }, [auth?.user?._id, auth?.user?.id]);

  const value = { ...auth, user: hydrated ? auth.user : null, setAuth, clear };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => React.useContext(AuthCtx);
