// src/config.js
export const API_BASE =
  (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "") ||
  "http://localhost:4000";
