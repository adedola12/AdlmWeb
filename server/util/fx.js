// server/util/fx.js
// Live FX (NGN -> USD) with caching & fallbacks.
// Uses open.er-api.com (free, no key). You can swap the source if you prefer.

import { Setting } from "../models/Setting.js";

// ---- Config ----
const CACHE_TTL_MS = Number(process.env.FX_TTL_MS || 10 * 60 * 1000); // default 10 min
const SOURCE = process.env.FX_SOURCE || "https://open.er-api.com/v6/latest/NGN";

// In-memory cache
let _cache = {
  fxRateNGNUSD: null, // number (USD per 1 NGN)
  fetchedAt: 0,
};

// A real NGN->USD rate is a small fraction — around 0.0007. Anything at or
// above this would mean the naira trading under ₦10 to the dollar, so it is a
// misread response rather than a market move. The check exists because the
// previous version of this function returned exactly 1.0 for months: it asked
// for rates with NGN as the base and then read `rates.NGN`, which is a
// currency against itself and therefore always 1. Every price with no explicit
// USD override was served at one dollar to the naira, and nothing said so.
const MAX_PLAUSIBLE_NGN_USD = 0.1;

/**
 * Fetch the live NGN->USD rate (USD per ₦1).
 *
 * Handles either base currency, because FX_SOURCE is configurable:
 *   base NGN -> rates.USD is already USD per naira
 *   base USD -> rates.NGN is naira per dollar, so invert it
 */
export async function fetchLiveFx() {
  const res = await fetch(SOURCE, { timeout: 10_000 });
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const json = await res.json();

  const base = String(json?.base_code || json?.base || "").toUpperCase();
  const rates = json?.rates || {};

  let fxRateNGNUSD;
  if (base === "NGN") {
    fxRateNGNUSD = Number(rates.USD);
  } else if (base === "USD") {
    const ngnPerUsd = Number(rates.NGN);
    if (!(ngnPerUsd > 0)) throw new Error("FX response missing NGN rate");
    fxRateNGNUSD = 1 / ngnPerUsd;
  } else {
    throw new Error(`FX response has unexpected base "${base || "?"}"`);
  }

  if (!Number.isFinite(fxRateNGNUSD) || fxRateNGNUSD <= 0) {
    throw new Error("FX response missing a usable rate");
  }
  // Fall through to the DB setting rather than publish a nonsense rate.
  if (fxRateNGNUSD >= MAX_PLAUSIBLE_NGN_USD) {
    throw new Error(`FX rate ${fxRateNGNUSD} is implausible for NGN->USD`);
  }

  // round to 6dp to avoid fp noise
  return Math.round(fxRateNGNUSD * 1e6) / 1e6;
}

/**
 * 1) Return cached value if fresh
 * 2) Try live internet
 * 3) Fallback to DB Setting (global.fxRateNGNUSD)
 * 4) Final fallback constant
 */
export async function getFxRate() {
  const now = Date.now();

  // 1. cache
  if (
    _cache.fxRateNGNUSD &&
    now - _cache.fetchedAt < CACHE_TTL_MS &&
    _cache.fxRateNGNUSD > 0
  ) {
    return _cache.fxRateNGNUSD;
  }

  // 2. live
  try {
    const fx = await fetchLiveFx();
    _cache = { fxRateNGNUSD: fx, fetchedAt: now };
    return fx;
  } catch (e) {
    // continue to fallback
    // console.warn("Live FX fetch failed:", e?.message || e);
  }

  // 3. DB setting fallback
  try {
    const s = await Setting.findOne({ key: "global" }).lean();
    const dbFx = Number(s?.fxRateNGNUSD || 0);
    if (dbFx > 0) {
      _cache = { fxRateNGNUSD: dbFx, fetchedAt: now };
      return dbFx;
    }
  } catch {}

  // 4. last-resort default (very conservative)
  const DEFAULT_FX = 0.001; // 1 NGN = $0.001
  _cache = { fxRateNGNUSD: DEFAULT_FX, fetchedAt: now };
  return DEFAULT_FX;
}

/** Convert NGN -> USD using fx unless an explicit USD override is provided. */
export function calcUSD(ngn, fxRate, override) {
  if (override !== undefined && override !== null && override !== "") {
    return Number(override) || 0;
  }
  const usd = Number(ngn || 0) * Number(fxRate || 0);
  // round to 2dp for UI
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

/** Attach computed USD fields to a single product object */
export async function attachUSDFields(product) {
  const fx = await getFxRate();
  const price = product.price || {};
  return {
    ...product,
    price: {
      ...price,
      monthlyUSD: calcUSD(price.monthlyNGN, fx, price.monthlyUSD),
      yearlyUSD: calcUSD(price.yearlyNGN, fx, price.yearlyUSD),
      installUSD: calcUSD(price.installNGN, fx, price.installUSD),
    },
    fxRateNGNUSD: fx,
  };
}

/** Attach computed USD fields to a list */
export async function attachUSDList(items) {
  const fx = await getFxRate();
  return items.map((p) => {
    const price = p.price || {};
    return {
      ...p,
      price: {
        ...price,
        monthlyUSD: calcUSD(price.monthlyNGN, fx, price.monthlyUSD),
        yearlyUSD: calcUSD(price.yearlyNGN, fx, price.yearlyUSD),
        installUSD: calcUSD(price.installNGN, fx, price.installUSD),
      },
      fxRateNGNUSD: fx,
    };
  });
}
