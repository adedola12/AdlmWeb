// client/src/lib/geo.js
// Best-effort location detection for the storefront. Primary signal is our own
// same-origin `GET /geo` (server does the IP lookup — not blocked by CSP). If
// that is unavailable it falls back to the device timezone, which cleanly
// separates Nigeria (Africa/Lagos) from everywhere else without any network
// call. The result is only ever used to *nudge* checkout (route foreign buyers
// to bank transfer, default their currency to USD) — never to hard-block a
// payment — so an "unknown" answer is perfectly safe.
import React from "react";
import { api } from "../http.js";

const CACHE_KEY = "adlm_geo_v1";

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(v) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(v));
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

function fromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    // Africa/Lagos is Nigeria's IANA zone. Treat it as a positive NG signal;
    // any other resolved zone is a weak "not Nigeria" hint (source: "tz").
    if (tz === "Africa/Lagos") {
      return { country: "NG", callingCode: "234", source: "tz" };
    }
    if (tz) return { country: null, callingCode: "", source: "tz", tz };
  } catch {
    // Intl unavailable — fall through
  }
  return null;
}

export async function detectCountry() {
  const cached = readCache();
  if (cached) return cached;

  let result = null;
  try {
    const j = await api("/geo");
    if (j && j.country) {
      result = {
        country: String(j.country).toUpperCase(),
        callingCode: j.callingCode || "",
        source: j.source || "ip",
      };
    }
  } catch {
    // network / non-2xx — fall back to timezone below
  }

  if (!result) {
    result = fromTimezone() || { country: null, callingCode: "", source: "unknown" };
  }

  writeCache(result);
  return result;
}

// React hook: returns null while detecting, then { country, callingCode, source }.
export function useCountry() {
  const [geo, setGeo] = React.useState(() => readCache());

  React.useEffect(() => {
    if (geo) return; // already resolved (cache hit)
    let alive = true;
    detectCountry().then((g) => {
      if (alive) setGeo(g);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return geo;
}

// Is this buyer confidently outside Nigeria? Combines the geo lookup with an
// optional account phone/whatsapp number. Returns false whenever we are unsure,
// so Nigerian buyers on a flaky lookup are never blocked from paying by card.
export function isForeignBuyer(geo, phone) {
  const p = String(phone || "").replace(/[\s\-()]/g, "");
  // Explicit international number that isn't Nigerian → foreign.
  if (/^\+/.test(p) && !p.startsWith("+234")) return true;
  // A +234 or local (0-leading) number is a positive Nigeria signal.
  if (p.startsWith("+234") || p.startsWith("234") || /^0\d{7,}/.test(p)) {
    return false;
  }
  if (geo?.country && geo.country !== "NG") return true;
  return false;
}
