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
//
// EVERY REFUSAL LEAVES ONE LOG LINE
//
// A refused request never reaches morgan, which index.js registers after
// cors(), so on its own a refusal is invisible in CloudWatch and nobody can
// tell whether real users are being turned away. corsRejectionHandler answers
// the refusal exactly as index.js always has (403, "Not allowed by CORS:
// <origin>") and writes one structured line:
//
//   {"evt":"cors_rejected","origin":"https://x.example","method":"POST",
//    "path":"/auth/login","ua":"Mozilla/5.0 ...","ip":"203.0.113.9"}
//
// Those six fields (plus the "suppressed" count below) and nothing else: never
// cookies, the Authorization header, the query string or the body. A hostile
// page can make its visitors' browsers send its origin as often as it likes,
// so each origin gets at most one line a minute per container; the refusals
// held back are counted and reported as "suppressed" on that origin's next
// line.
//
// Only a refusal the origin check below raised is logged. Other errors can
// quote the same words: a JSON parse error quotes the body, and a route's
// CastError quotes the id in the URL. Matching the text alone would let anyone
// write a false refusal of the site's own origin into this log. Body-parser
// errors (a malformed or oversized body) carry a `type` and go on to
// index.js's 400 and 413 answers, as they always did.

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

// Every refusal the origin check has raised. Held by identity, so no request
// can put an error in here by what it sends.
const refusals = new WeakSet();

function refuse(origin) {
  const err = new Error(`Not allowed by CORS: ${origin}`);
  refusals.add(err);
  return err;
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
      return cb(refuse(origin));
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

/**
 * True for an error index.js answers 403 "Not allowed by CORS": matched by its
 * message, as index.js always has, but never a body-parser error. Those all
 * carry a `type`, and index.js answers them 400 or 413 even when the body they
 * quote says "Not allowed by CORS". The refusal the origin check raises has no
 * `type`.
 */
export function isCorsRejection(err) {
  return Boolean(err) && !err.type && /Not allowed by CORS/.test(err.message);
}

function clip(value, max) {
  const s = String(value ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * The fields of one "cors_rejected" line, and nothing else from the request.
 * The IP is the first x-forwarded-for hop, as the routes that record one read
 * it (routes/me.orgVideos.js), falling back to req.ip.
 */
export function corsRejectionFields(req) {
  const h = req.headers || {};
  const path = req.path ?? String(req.url || "").split("?")[0];
  const ip = String(h["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";
  return {
    evt: "cors_rejected",
    origin: clip(h.origin, 200),
    method: clip(req.method, 16),
    path: clip(path, 200),
    ua: clip(h["user-agent"], 120),
    ip: clip(ip, 64),
  };
}

/**
 * Returns log(req): writes a "cors_rejected" line for a refused request, at
 * most one per origin per `windowMs` in this process (one Lambda container).
 * Refusals inside the window are only counted; the origin's next line carries
 * the count as `suppressed`. At most `maxOrigins` origins are remembered, so a
 * client inventing a new Origin on every request cannot grow the map: when it
 * is full, origins whose window is over with nothing held back go first, then
 * the longest-unlogged. `now` and `write` are seams for the tests.
 */
export function createCorsRejectionLog({
  windowMs = 60_000,
  maxOrigins = 1000,
  now = Date.now,
  write = (line) => console.warn(line),
} = {}) {
  const seen = new Map(); // origin -> { since, suppressed }, oldest line first
  // At least one: with room for none, the trim below would never finish.
  const cap = Math.max(1, Math.floor(maxOrigins) || 1);

  return function logCorsRejection(req) {
    const fields = corsRejectionFields(req);
    const t = now();
    const entry = seen.get(fields.origin);
    if (entry && t - entry.since < windowMs) {
      entry.suppressed += 1;
      return false;
    }
    const suppressed = entry ? entry.suppressed : 0;
    if (entry) {
      seen.delete(fields.origin); // re-added below, as the newest
    } else if (seen.size >= cap) {
      for (const [origin, e] of seen) {
        if (t - e.since >= windowMs && e.suppressed === 0) seen.delete(origin);
      }
      while (seen.size >= cap) seen.delete(seen.keys().next().value);
    }
    seen.set(fields.origin, { since: t, suppressed: 0 });
    write(JSON.stringify(suppressed ? { ...fields, suppressed } : fields));
    return true;
  };
}

/**
 * The error middleware index.js mounts for a refused origin: answers 403
 * {"error": err.message}, the same answer as before the line existed, and logs
 * it (above) when the origin check itself raised it. An error that only quotes
 * the words keeps its old 403 but writes nothing. Body-parser errors and any
 * other error go on to the next handler.
 */
export function corsRejectionHandler(log = createCorsRejectionLog()) {
  return function handleCorsRejection(err, req, res, next) {
    if (!isCorsRejection(err)) return next(err);
    if (refusals.has(err)) {
      try {
        log(req);
      } catch {
        // Best effort: the answer never depends on the log line.
      }
    }
    return res.status(403).json({ error: err.message });
  };
}
