// Assembles everything the (pure) Material & Labour engine needs from the
// database: the firm's constants, the per-type Services Constants, and the
// prices to rate the derived materials with.
//
// Kept apart from mlSchedule.js so the engine itself stays pure and unit
// testable — this module is the only place that touches Mongo.

import { MaterialConstantProfile } from "../models/MaterialConstantProfile.js";
import { User } from "../models/User.js";
import { resolveConstants } from "./materialConstants.js";
import { getMergedConstants, buildRateMaps, buildPriceIndexes, norm } from "./serviceResolve.js";
import { matchPrice } from "./serviceMatch.js";
import { fetchMasterMaterials, fetchMasterLabour } from "./rategenMaster.js";
import { convertedPrice } from "./priceConversion.js";

// The master price list is ~130 priced rows and identical for everyone in a
// zone, so one import does not deserve a round trip per material. Short TTL:
// long enough to cover a bill's worth of lookups, short enough that a price
// edit shows up on the next import.
const PRICE_TTL_MS = 5 * 60 * 1000;
const priceCache = new Map(); // `${zone}|${state}` → { at, material, labour }

function toMap(rows, map = new Map()) {
  for (const r of rows || []) {
    const k = norm(r?.description);
    const p = Number(r?.price);
    if (k && p > 0 && !map.has(k)) map.set(k, { price: p, unit: String(r?.unit || "") });
  }
  return map;
}

// Unit conversion lives in util/priceConversion.js (convertedPrice).

async function masterPrices(zone, state) {
  const key = `${zone || ""}|${state || ""}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit;

  // A price list that fails to load must not fail the import — the schedule is
  // still correct, just unpriced, and the QS can rate it on the Budget tab.
  let material = new Map();
  let labour = new Map();
  try {
    const [mats, labs] = await Promise.all([
      fetchMasterMaterials(zone, state),
      fetchMasterLabour(zone, state),
    ]);
    material = toMap(mats);
    labour = toMap(labs);
  } catch (e) {
    console.warn("mlScheduleContext: master price list unavailable —", e?.message || e);
  }
  const entry = { at: Date.now(), material, labour };
  priceCache.set(key, entry);
  return entry;
}

/** Drop the cached price lists (used by tests and after a price import). */
export function clearPriceCache() {
  priceCache.clear();
}

/**
 * Build the context for generateMlSchedule().
 *
 * @param {string|object} userId
 * @param {object} [opts]
 * @param {string} [opts.zone]   pricing zone override (else the user's own)
 * @param {string} [opts.state]  pricing state override (else the user's own)
 * @returns {Promise<{K:object, priceFor:Function, serviceConstants:object,
 *                    serviceRateFor:object, zone:string|null, state:string|null}>}
 */
export async function buildMlScheduleContext(userId, opts = {}) {
  const [profile, user, services, libMaps] = await Promise.all([
    userId ? MaterialConstantProfile.findOne({ userId }).lean() : null,
    userId && (opts.zone === undefined || opts.state === undefined)
      ? User.findById(userId, { zone: 1, state: 1 }).lean()
      : null,
    getMergedConstants(userId).catch(() => ({ types: {} })),
    buildRateMaps(userId).catch(() => ({ material: new Map(), labour: new Map() })),
  ]);

  const zone = opts.zone ?? user?.zone ?? null;
  const state = opts.state ?? user?.state ?? null;
  const [master, strict] = await Promise.all([
    masterPrices(zone, state),
    // services lines are matched strictly (util/serviceMatch.js): the master
    // holds ~600 named items, and "first name containing the other" would price
    // a connector as a pan connector
    buildPriceIndexes(userId, { zone, state }).catch(() => null),
  ]);

  // The user's own RateGen library beats the master list — a firm that has
  // negotiated its cement price should see that price in its schedule.
  // buildRateMaps returns bare numbers (no unit), so those are unit-agnostic.
  const material = new Map(master.material);
  for (const [k, v] of libMaps.material) material.set(k, { price: v, unit: "" });
  const labour = new Map(master.labour);
  for (const [k, v] of libMaps.labour) labour.set(k, { price: v, unit: "" });

  // Look a name up and return a price expressed in the unit the caller asked
  // for. When the library quotes a unit that cannot be converted to it — a per
  // m³ price against a quantity in tons — return 0. An unpriced row is a
  // visible gap the QS fills; a wrongly-scaled one silently corrupts the
  // budget, and "Reinforcement steel" is quoted per tonne while bills measure
  // it in both tonnes and kg.
  //
  // Since 7 Oct 2026 the conversion is util/priceConversion.js: it tries every
  // item the name could be (exact, the price list's own wording, then partial
  // matches) and takes the first whose unit converts: ton <-> kg, a pack size
  // written in the list (25 kg roll, 4 L tin, 3,600 mm length), and tons <-> m³
  // for loose sand / granite / laterite / hardcore by density. Anything else
  // still returns 0.
  const K = resolveConstants(profile?.values);
  const priceIn = (map, name, wantUnit) => convertedPrice(map, name, wantUnit, K);

  return {
    K,
    zone,
    state,
    serviceConstants: services?.types || {},
    serviceRateFor: {
      material: (name, unit) => matchPrice(strict?.material, name, { unit })?.price || 0,
      labour: (name, unit) => matchPrice(strict?.labour, name, { unit })?.price || 0,
      allIn: (name, unit) => Boolean(matchPrice(strict?.material, name, { unit })?.allIn),
    },
    // Derived materials are named by the engine ("Cement", "Sharp sand",
    // "Granite") — the short names the RateGen master deliberately uses so a
    // bare lookup hits. A miss returns 0, which reads as "unpriced", not free.
    priceFor: (name, unit) => priceIn(material, name, unit),
  };
}
