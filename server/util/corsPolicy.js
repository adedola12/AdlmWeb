// server/util/corsPolicy.js
//
// Which browser origins may call this API. Built from the environment once, at
// startup, by index.js; a function of `env` so the tests can build the same
// policy the server runs.
//
// THE API'S OWN ORIGIN IS ON THE LIST
//
// Some pages are served by the API itself: the unsubscribe pages
// (routes/unsubscribe.js) show a button that POSTs a form back to
// api.adlmstudio.net. Browsers send an Origin header on a form POST even to the
// same host, so without the API's own origin here that button would get "Not
// allowed by CORS" (403) unless somebody had remembered to put the API host in
// the CORS_ORIGINS parameter. An opt-out that works only when an SSM value
// happens to be right is not an opt-out. The origin is taken from API_BASE_URL,
// the same setting the unsubscribe links are built from (util/campaigns.js),
// so the page and the check can never disagree. Allowing the API's own origin
// gives no other site anything: those pages are the API's own.

/** Exact, vetted production origins: no wildcards. */
export const PROD_ORIGINS = [
  "https://adlmstudio.net",
  "https://www.adlmstudio.net",
  "https://adlm-web.vercel.app",
  // Staff preview of the pending release (docs/RELEASE_GATE.md). The page
  // itself only opens for staff and the release approver once signed in.
  "https://preview.adlmstudio.net",
];

/** The origin of API_BASE_URL, e.g. "https://api.adlmstudio.net"; "" when unset or unreadable. */
export function apiOrigin(env = process.env) {
  const raw = String(env.API_BASE_URL || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? u.origin : "";
  } catch {
    return "";
  }
}

/** CORS_ORIGINS (comma separated), the production origins, and the API's own. */
export function corsWhitelist(env = process.env) {
  const fromEnv = String(env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...fromEnv, ...PROD_ORIGINS, apiOrigin(env)].filter(Boolean)));
}

/** The options index.js hands to cors(). */
export function buildCorsOptions(env = process.env) {
  const isProd = env.NODE_ENV === "production";
  const whitelist = corsWhitelist(env);
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (whitelist.includes(origin)) return cb(null, true);
      // Localhost only allowed in non-production for dev work
      if (!isProd && /^http:\/\/localhost:\d+$/.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-admin-key",
      "x-adlm-client",
      "x-adlm-fp-version",
      "X-Requested-With",
    ],
  };
}
