/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { API_BASE } from "./config";

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

  return <AuthCtx.Provider value={{ ...auth, setAuth, clear }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => React.useContext(AuthCtx);
