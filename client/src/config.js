// // src/config.js
// export const API_BASE =
//   (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "") ||
//   "http://localhost:4000";

// src/config.js
const raw = (import.meta.env.VITE_API_BASE ?? "").trim();

export const API_BASE = raw ? raw.replace(/\/$/, "") : "";

export const CLOUD_NAME = (
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? ""
).trim();
export const UPLOAD_PRESET = (
  import.meta.env.VITE_CLOUDINARY_UNSIGNED_PRESET ?? ""
).trim();

export const IS_PROD = import.meta.env.PROD;
