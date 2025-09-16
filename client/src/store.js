import { create } from "zustand";

export const useAuth = create((set, get) => ({
  accessToken: null,
  licenseToken: null,
  user: null,
  setAuth: (payload) => set(payload),
  clear: () => set({ accessToken: null, licenseToken: null, user: null }),

  // call /auth/refresh to renew access + license
  refresh: async () => {
    const res = await fetch("http://localhost:4000/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      set({ accessToken: data.accessToken, licenseToken: data.licenseToken });
      return true;
    } else {
      set({ accessToken: null, licenseToken: null });
      return false;
    }
  },
}));
