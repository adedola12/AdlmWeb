// server/middleware/adminKey.js
// DEPRECATED shim — re-exports the timing-safe implementation from
// requireAdminKey.js. Kept only so existing imports continue to work.
// New code should import from "./requireAdminKey.js" or use requireAdmin
// from "./auth.js" (JWT-based) instead.
export { requireAdminKey } from "./requireAdminKey.js";
