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

  // persist to localStorage
  React.useEffect(() => {
    localStorage.setItem("auth", JSON.stringify(auth));
  }, [auth]);

  // hydrate using refresh cookie on first load if no access token
  React.useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (auth.accessToken) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAuth((prev) => ({ ...prev, ...data }));
        }
      } catch {}
    }

    hydrate();

    const onRefreshed = (e) => setAuth((prev) => ({ ...prev, ...e.detail })); // see http.js
    window.addEventListener("auth:refreshed", onRefreshed);

    return () => {
      cancelled = true;
      window.removeEventListener("auth:refreshed", onRefreshed);
    };
  }, [auth.accessToken]);

  // background refresh every 10 minutes
  React.useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
          }
        );
        if (res.ok) {
          const data = await res.json();
          setAuth((prev) => ({ ...prev, ...data }));
        }
      } catch {}
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const clear = () =>
    setAuth({ user: null, accessToken: null, licenseToken: null });

  return (
    <AuthCtx.Provider value={{ ...auth, setAuth, clear }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => React.useContext(AuthCtx);
