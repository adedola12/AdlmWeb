// server/services/takeoffBaseline.js
//
// Which rate table estimates a new takeoff session, and how it gets there.
//
// The active TakeoffBaseline is read on every batch the plugins post, so it is
// cached for a minute; creating or activating a version invalidates the cache.
// If no version exists at all (fresh database) the shipped defaults are
// written as the first version and activated, so the feature works before an
// admin has ever opened the Time saved page.
import {
  DEFAULT_BASELINE_NOTES,
  DEFAULT_BASELINE_RATES,
  DEFAULT_BASELINE_VERSION,
  RATE_KEYS,
} from "../config/takeoffBaselineDefaults.js";
import { TakeoffBaseline } from "../models/TakeoffBaseline.js";

const CACHE_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

export function invalidateBaselineCache() {
  cached = null;
  cachedAt = 0;
}

/** Only the known rate keys, each a finite non-negative number. */
export function sanitizeRates(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const k of RATE_KEYS) {
    const n = Number(src[k]);
    if (!Number.isFinite(n) || n < 0) return { error: `rates.${k} must be a non-negative number` };
    out[k] = n;
  }
  return { rates: out };
}

export async function ensureTakeoffBaselineSeeded() {
  const any = await TakeoffBaseline.findOne({}).select("_id").lean();
  if (any) return null;
  const doc = await TakeoffBaseline.create({
    version: DEFAULT_BASELINE_VERSION,
    rates: { ...DEFAULT_BASELINE_RATES },
    notes: DEFAULT_BASELINE_NOTES,
    active: true,
    activatedAt: new Date(),
  });
  invalidateBaselineCache();
  return doc;
}

/**
 * The active rate table as a plain object { version, rates, notes,
 * activatedAt }. Falls back to the in-code defaults if the DB somehow has
 * versions but none active, so a session is never stored without a version.
 */
export async function getActiveBaseline() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  let doc = await TakeoffBaseline.findOne({ active: true }).lean();
  if (!doc) {
    const seeded = await ensureTakeoffBaselineSeeded();
    doc = seeded ? seeded.toObject() : await TakeoffBaseline.findOne({ active: true }).lean();
  }
  const out = doc
    ? {
        version: doc.version,
        rates: { ...DEFAULT_BASELINE_RATES, ...(doc.rates || {}) },
        notes: doc.notes || "",
        activatedAt: doc.activatedAt || null,
      }
    : {
        version: DEFAULT_BASELINE_VERSION,
        rates: { ...DEFAULT_BASELINE_RATES },
        notes: DEFAULT_BASELINE_NOTES,
        activatedAt: null,
      };
  cached = out;
  cachedAt = Date.now();
  return out;
}
