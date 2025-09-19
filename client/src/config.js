// always export a clean base URL, with no trailing slash
export const API_BASE =
  (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "") ||
  "http://localhost:4000";
