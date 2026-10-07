// server/services/sampleCarbon.js
//
// The carbon footprint a sample project's card shows: upfront carbon (A1-A5) of
// its bill, worked out exactly as the ICMS 3 export does (util/icmsLines.js).
//
// From the VIEWER's RateGen library, the same rates "Price with my RateGen rates"
// uses: a sample has no owner, and RateGen's master rates alone hold build-ups for
// only a third of the rates, which left the footprint on about 30% of the cost. A
// viewer with no library of their own gets the master's. The card says how much of
// the cost the figure covers.
//
// Cached per sample and viewer for five minutes (the viewer's rates can change),
// and per sample change: the list is fetched on every visit to a projects page.

import { carbonForUser } from "./rateCarbon.js";
import { icmsLines, icmsSummary } from "../util/icmsLines.js";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // `${viewer}|${id}|${updatedAt}` -> { at, value }

/** { carbonKg, carbonLowKg, carbonShare } for one sample (a lean doc with its items) as `viewerId` sees it, or null. */
export async function sampleCarbon(sample, viewerId = null, viewer = {}) {
  if (!sample?._id) return null;
  const key = `${viewerId || ""}|${sample._id}|${new Date(sample.updatedAt || 0).getTime()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const { rates } = await carbonForUser(viewerId, { state: viewer.state || null, zone: viewer.zone || null });
    const s = icmsSummary(icmsLines(sample.items || [], { productKey: sample.productKey, carbonRates: rates }));
    const value = { carbonKg: Math.round(s.carbonKg), carbonLowKg: Math.round(s.carbonLowKg), carbonShare: Math.round(s.carbonShare * 100) / 100 };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn(`[sample carbon] ${sample._id}:`, err?.message || err);
    return null; // the card simply shows no carbon
  }
}
