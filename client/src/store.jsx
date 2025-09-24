import React from "react";

const AuthCtx = React.createContext({
  user: null,
  accessToken: null,
  licenseToken: null,
  setAuth: () => {},
  clear: () => {},
});

export function AuthProvider({ children }) {
  const [auth, setAuth] = React.useState(() => {
    try {
      const raw = localStorage.getItem("auth");
      return raw
        ? JSON.parse(raw)
        : { user: null, accessToken: null, licenseToken: null };
    } catch {
      return { user: null, accessToken: null, licenseToken: null };
    }
  });

  React.useEffect(() => {
    localStorage.setItem("auth", JSON.stringify(auth));
  }, [auth]);

  React.useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (auth.accessToken) return; // already authed
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE}/auth/refresh`,
          { method: "POST", credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAuth((prev) => ({ ...prev, ...data }));
        }
      } catch {}
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
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE}/auth/refresh`,
          { method: "POST", credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setAuth((prev) => ({ ...prev, ...data }));
        }
      } catch {}
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const clear = React.useCallback(() => {
    // wipe memory and localStorage synchronously so UI updates immediately
    const empty = { user: null, accessToken: null, licenseToken: null };
    setAuth(empty);
    localStorage.setItem("auth", JSON.stringify(empty));
  }, []);

  return (
    <AuthCtx.Provider value={{ ...auth, setAuth, clear }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => React.useContext(AuthCtx);
