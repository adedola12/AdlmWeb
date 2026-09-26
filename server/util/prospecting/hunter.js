// server/util/prospecting/hunter.js
//
// Finds people at a prospect firm through Hunter.io's domain search, and
// picks the ones worth writing to.
//
// Only "personal" addresses are asked for: info@ and hello@ mailboxes are not
// a person, and a cold email to one reads as spam. Hunter's own sources (the
// public pages it found each address on) are kept on the contact, which is
// the NDPA answer to "where did you get my email?".
//
// PROSPECT_FINDER_MODE=sample reads fixtures/hunter.sample.json instead of
// calling Hunter, keyed by domain.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUNTER_URL = "https://api.hunter.io/v2/domain-search";
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "hunter.sample.json");

export const minConfidence = () => {
  const n = Number(process.env.PROSPECT_MIN_CONFIDENCE ?? 70);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 70;
};

/** Hunter's email record → our contact shape. */
export function toContact(e) {
  const name = [e?.first_name, e?.last_name].filter(Boolean).join(" ").trim();
  return {
    name,
    title: String(e?.position || "").trim(),
    email: String(e?.value || "").trim(),
    confidence: Math.max(0, Math.min(100, Number(e?.confidence) || 0)),
    type: e?.type || "",
    source: {
      provider: "hunter",
      urls: (Array.isArray(e?.sources) ? e.sources : []).map((s) => s?.uri).filter(Boolean).slice(0, 10),
      retrievedAt: new Date(),
    },
  };
}

const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * How well a job title matches the profile's target titles: 2 for every word
 * of a target title present, so "Managing Partner" beats "Partner", 0 when
 * nothing matches.
 */
export function titleScore(title, targets = []) {
  const have = new Set(words(title));
  let best = 0;
  for (const t of targets) {
    const want = words(t);
    if (!want.length) continue;
    const hit = want.filter((w) => have.has(w)).length;
    if (hit === want.length) best = Math.max(best, 2 * hit);
    else if (hit) best = Math.max(best, hit);
  }
  return best;
}

/**
 * The contacts to keep for one firm, best first: personal addresses only, at
 * or above the confidence floor, ranked by title match then confidence. The
 * first one is the primary, the person the emails are addressed to.
 *
 * Data minimisation (NDPA): only people whose title matches the profile are
 * kept. When nobody matches, the single most confident person is kept so the
 * firm is not lost, and nobody else.
 */
export function pickContacts(contacts, jobTitles = [], { floor = minConfidence(), max = 3 } = {}) {
  const ranked = contacts
    .filter((c) => c.email && c.type !== "generic" && c.confidence >= floor)
    .map((c) => ({ c, score: titleScore(c.title, jobTitles) }))
    .sort((a, b) => b.score - a.score || b.c.confidence - a.c.confidence);
  const matched = ranked.filter((r) => r.score > 0);
  return (matched.length ? matched.slice(0, max) : ranked.slice(0, 1)).map(({ c }) => c);
}

function loadSample(domain) {
  const all = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  return all.responses?.[domain] || { data: { emails: [] } };
}

/** Hunter domain search for one domain → our contact shape (unfiltered). */
export async function domainSearch(domain, { mode = process.env.PROSPECT_FINDER_MODE || "live", fetchImpl = fetch } = {}) {
  let body;
  if (mode === "sample") {
    body = loadSample(domain);
  } else {
    const key = String(process.env.HUNTER_API_KEY || "").trim();
    if (!key) throw new Error("HUNTER_API_KEY is not set; the prospect finder needs it for contacts.");
    const url = `${HUNTER_URL}?${new URLSearchParams({ domain, type: "personal", limit: "10" })}`;
    // The key goes in a header, not the query string, so it never lands in a
    // proxy or access log.
    const res = await fetchImpl(url, { headers: { "X-API-KEY": key, accept: "application/json" } });
    body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.errors?.[0]?.details || body?.errors?.[0]?.id || `Hunter ${res.status}`;
      throw new Error(`Hunter domain search failed for ${domain}: ${msg}`);
    }
  }
  return (body?.data?.emails || []).map(toContact);
}
