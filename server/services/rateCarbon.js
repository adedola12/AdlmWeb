// server/services/rateCarbon.js
//
// Upfront carbon (A1-A5) of every rate in one user's own RateGen library, in
// ADLM Cloud. The same rates the user prices with: master rates, their own
// overrides of them, and their custom rates (mergeRatesWithUserData), each
// worked out from its own build-up against the master material library for the
// state they price in (util/carbonRates.js, a port of the desktop engine).
//
// The desktop syncs every build-up it prices into the user's library, so a rate
// the cloud master holds without a build-up still has one here once the user
// has synced. A rate with no build-up anywhere has no carbon, and says so.

import { RateGenRate } from "../models/RateGenRate.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { fetchMasterLabour, fetchMasterMaterials } from "../util/rategenMaster.js";
import { mergeRatesWithUserData } from "../util/rategenUserRates.js";
import { buildCarbonRates, prepareMaterialLibrary } from "../util/carbonRates.js";
import { carbonMethod, carbonSources } from "../util/carbonEngine.js";

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map(); // `${userId}|${state}|${zone}` -> { at, value }
const _libs = new Map(); // `${state}|${zone}` -> { at, lib, labour }

/** A rate the desktop's carbon screen wrote: its lines end in "Upfront carbon, A1-A5". */
export const isCarbonCopy = (rate) =>
  (rate?.breakdown || []).some((b) => /^(carbon of the build-up above|upfront carbon, a1-a5)/i.test(String(b?.componentName || "").trim()));

/** The key a bill line and a rate share: description and unit, case and spacing folded. */
export function rateCarbonKey(description, unit) {
  const fold = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${fold(description)}|${fold(unit)}`;
}

async function masterLibrary(state, zone) {
  const k = `${state || ""}|${zone || ""}`;
  const hit = _libs.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const [mats, labs] = await Promise.all([fetchMasterMaterials(zone, state), fetchMasterLabour(zone, state)]);
  const entry = {
    at: Date.now(),
    lib: prepareMaterialLibrary(mats.map((m) => ({ name: m.description, category: m.category, unit: m.unit, price: m.price }))),
    labour: labs.map((l) => l.description),
  };
  _libs.set(k, entry);
  return entry;
}

/**
 * Carbon for every rate in the user's library.
 * Returns { method, sources, rates: [...], byKey: Map(rateCarbonKey -> rate), byRateId: Map }
 * where each rate is { rateId, customRateId, source, sectionKey, description, unit, netCost, carbon | null }
 * and carbon is { total, low, a13, a4, a5, coverage, hasAssumedMass } in kgCO2e per unit of the rate.
 */
export async function carbonForUser(userId, { state = null, zone = null } = {}) {
  const ck = `${userId}|${state || ""}|${zone || ""}`;
  const hit = _cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const [masterRates, userLib, { lib, labour }] = await Promise.all([
    RateGenRate.find({}).lean(),
    userId ? RateGenLibrary.findOne({ userId }).lean() : null,
    masterLibrary(state, zone),
  ]);
  // The desktop syncs its own carbon list ("Carbon and Others") back into the
  // library: copies of rates already here, with the carbon summary as lines. They
  // are output, not rates, and would count every rate twice.
  const merged = mergeRatesWithUserData(
    masterRates,
    Array.isArray(userLib?.rateOverrides) ? userLib.rateOverrides : [],
    Array.isArray(userLib?.customRates) ? userLib.customRates : [],
  ).filter((r) => !isCarbonCopy(r));
  const results = buildCarbonRates(merged, lib, labour);

  const rates = merged.map((r, i) => {
    const c = results[i];
    return {
      rateId: r.rateId || null,
      customRateId: r.customRateId || null,
      source: r.source,
      sectionKey: r.sectionKey,
      description: r.description,
      unit: r.unit,
      netCost: r.netCost,
      carbon: c
        ? { total: c.total, low: c.low, a13: c.a13, a4: c.a4, a5: c.a5, coverage: c.coverage, hasAssumedMass: c.hasAssumedMass }
        : null,
    };
  });

  const byKey = new Map();
  const byRateId = new Map();
  for (const r of rates) {
    if (!r.carbon) continue;
    const k = rateCarbonKey(r.description, r.unit);
    // a user's own version of a rate wins over the master's
    if (!byKey.has(k) || r.source !== "master") byKey.set(k, r);
    if (r.rateId) byRateId.set(String(r.rateId), r);
    if (r.customRateId) byRateId.set(String(r.customRateId), r);
  }

  const value = { method: carbonMethod(), sources: carbonSources(), rates, byKey, byRateId };
  _cache.set(ck, { at: Date.now(), value });
  return value;
}
