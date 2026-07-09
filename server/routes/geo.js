import express from "express";

// Lightweight IP → country lookup for the storefront. This runs server-side so
// it is NOT subject to the browser CSP connect-src allowlist, and the client
// only ever talks to our own origin (`GET /geo`). Used by the checkout to route
// foreign buyers to bank transfer instead of the NGN-only card wall.
const router = express.Router();

// Per-IP in-memory cache. Country rarely changes per IP within a session, and
// this keeps us well under the free geo provider's rate limits.
const cache = new Map();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

function clientIp(req) {
  // `trust proxy` is set in server/index.js, so req.ip is the real client IP.
  // Fall back to the first x-forwarded-for hop. Strip the IPv4-mapped IPv6
  // prefix so "::ffff:1.2.3.4" geolocates correctly.
  const raw =
    req.ip ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    "";
  return raw.replace(/^::ffff:/, "");
}

function isPrivate(ip) {
  if (!ip) return true;
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

async function lookup(ip) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    // ipwho.is: free, HTTPS, no API key. We only need the country + calling
    // code. If it ever changes shape or goes down, the client falls back to a
    // timezone heuristic, so a null here is non-fatal.
    const r = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,calling_code`,
      { signal: ctrl.signal },
    );
    const j = await r.json().catch(() => ({}));
    if (j && j.success && j.country_code) {
      return {
        country: String(j.country_code).toUpperCase(),
        callingCode: j.calling_code
          ? String(j.calling_code).replace(/^\+/, "")
          : "",
        source: "ip",
      };
    }
  } catch {
    // network/abort — fall through to null
  } finally {
    clearTimeout(timer);
  }
  return null;
}

router.get("/", async (req, res) => {
  try {
    const ip = clientIp(req);
    if (isPrivate(ip)) {
      return res.json({ country: null, callingCode: "", source: "private" });
    }

    const now = Date.now();
    const hit = cache.get(ip);
    if (hit && hit.expires > now) return res.json(hit.data);

    const data =
      (await lookup(ip)) || { country: null, callingCode: "", source: "unknown" };
    cache.set(ip, { data, expires: now + TTL_MS });

    // Bound the cache so a long-lived process can't grow it unbounded.
    if (cache.size > 5000) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }

    return res.json(data);
  } catch {
    // Never fail the storefront on a geo hiccup — the client degrades locally.
    return res.json({ country: null, callingCode: "", source: "error" });
  }
});

export default router;
