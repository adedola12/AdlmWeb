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

/**
 * Fetch live rate (USD base) and convert to NGN->USD.
 * open.er-api.com returns rates where 1 USD = rates.NGN (NGN per USD).
 * We need NGN->USD, so fx = 1 / rates.NGN.
 */
async function fetchLiveFx() {
  const res = await fetch(SOURCE, { timeout: 10_000 });
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const json = await res.json();
  const ngnPerUsd = json?.rates?.NGN;
  if (!ngnPerUsd || typeof ngnPerUsd !== "number" || ngnPerUsd <= 0) {
    throw new Error("FX response missing NGN rate");
  }
  const fxRateNGNUSD = 1 / ngnPerUsd; // USD per NGN
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
