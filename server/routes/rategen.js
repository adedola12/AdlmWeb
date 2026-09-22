// server/routes/rategen.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import {
  fetchMasterMaterials,
  fetchMasterLabour,
} from "../util/rategenMaster.js";
import {
  buildUserRateKey,
  getUserId,
  normalizeCustomRate,
  normalizeRateOverride,
  toUserRateDefinition,
} from "../util/rategenUserRates.js";
import {
  planBulkPriceChange,
  MAX_BULK_ROWS,
} from "../util/rategenBulkPrices.js";
import { normalizeZone, ZONES } from "../util/zones.js";
import { STATES, normalizeState, zoneForState } from "../util/states.js";
import { ensureDb } from "../db.js";

const router = express.Router();

router.use(requireAuth, requireEntitlement("rategen"));

function mapUserRateOverride(item) {
  return toUserRateDefinition(item, {
    id: item?.rateId || buildUserRateKey(item),
    rateId: item?.rateId || null,
    baseRateId: item?.rateId || null,
    source: "user-override",
  });
}

function mapUserCustomRate(item) {
  return toUserRateDefinition(item, {
    id: item?.customRateId || "",
    rateId: null,
    customRateId: item?.customRateId || null,
    source: "user-custom",
  });
}

function toLibraryResponse(lib) {
  const plain = lib?.toObject ? lib.toObject() : { ...(lib || {}) };
  return {
    ...plain,
    rateOverrides: (plain.rateOverrides || []).map(mapUserRateOverride),
    customRates: (plain.customRates || []).map(mapUserCustomRate),
    ratesVersion: plain.ratesVersion ?? 1,
    customRatesVersion: plain.customRatesVersion ?? 1,
    version: plain.version ?? 1,
  };
}

router.get("/zones", (_req, res) => res.json(ZONES));
router.get("/states", (_req, res) => res.json(STATES));

/**
 * Apply a user's own prices over the published ones.
 *
 * Done HERE rather than in each client, so the desktop app, QUIV and HERON all
 * see the same figure without three separate implementations that could drift.
 * A correction the user made on the website is not much use if it only holds in
 * the place they typed it.
 *
 * An override with no state applies anywhere. A state-specific one wins over it,
 * because it is the more precise statement about where the user is working.
 */
export function applyPriceOverrides(rows, overrides, kind, stateKey, nameKey) {
  if (!overrides?.length || !rows?.length) return rows;

  const rank = (o) => (o.state && o.state === stateKey ? 2 : !o.state ? 1 : 0);
  const best = new Map();
  for (const o of overrides) {
    if (o.kind !== kind) continue;
    const r = rank(o);
    if (r === 0) continue; // belongs to a different state
    const k = `${String(o.name).toLowerCase()}|${String(o.unit || "").toLowerCase()}`;
    const prev = best.get(k);
    if (!prev || r > prev.r) best.set(k, { r, price: o.price });
  }
  if (!best.size) return rows;

  let hits = 0;
  const out = rows.map((row) => {
    const k = `${String(row[nameKey] ?? row.description ?? "").toLowerCase()}|${String(row.unit || "").toLowerCase()}`;
    const hit = best.get(k);
    if (!hit) return row;
    hits++;
    return { ...row, price: hit.price, isUserPrice: true };
  });
  return hits ? out : rows;
}

router.get("/master", async (req, res) => {
  try {
    await ensureDb(); // ⬅️ safe guard

    // A state wins over a zone when both are supplied, and the user's saved
    // state or zone is the fallback. `zone` stays in the response so older
    // clients that only understand zones keep working unchanged.
    const qState = normalizeState(req.query.state) || normalizeState(req.user.state);
    const qZone = normalizeZone(req.query.zone);
    const zone = (qState ? zoneForState(qState) : null) || qZone || req.user.zone || null;

    const [rawMaterials, rawLabour, lib] = await Promise.all([
      fetchMasterMaterials(zone, qState),
      fetchMasterLabour(zone, qState),
      RateGenLibrary.findOne({ userId: getUserId(req) }, { priceOverrides: 1 }).lean(),
    ]);

    const ov = lib?.priceOverrides || [];
    const materials = applyPriceOverrides(rawMaterials, ov, "material", qState, "description");
    const labour = applyPriceOverrides(rawLabour, ov, "labour", qState, "description");

    // accountState is the state saved on the profile, as opposed to `state` which
    // echoes what was actually priced. The two only diverge for a caller that
    // passes ?state=, so the desktop never sees a difference: it deliberately
    // sends no state and lets the profile decide. The real consumer is the web
    // library, which falls back to accountState when a request priced by zone
    // alone leaves `state` null.
    res.json({
      materials,
      labour,
      source: "mongo-master",
      zone,
      state: qState,
      accountState: normalizeState(req.user.state) || null,
      priceOverrides: ov.length,
    });
  } catch (e) {
    console.error("[/rategen/master] error:", e);
    res
      .status(500)
      .json({ error: e?.message || "Failed to load master prices" });
  }
});

/* ── the user's own prices, per location ── */

router.get("/price-overrides", async (req, res) => {
  await ensureDb();
  const lib = await RateGenLibrary.findOne(
    { userId: getUserId(req) },
    { priceOverrides: 1, priceOverridesVersion: 1 },
  ).lean();
  res.json({
    items: lib?.priceOverrides || [],
    version: lib?.priceOverridesVersion || 1,
    state: normalizeState(req.user.state) || null,
    states: STATES,
  });
});

/**
 * Set or clear one price. A null or empty price clears the override and the
 * published figure comes back, which is the only way out of a correction the
 * user no longer wants. Deleting is done here rather than with a DELETE route
 * so the UI has a single call and cannot leave a half-applied state.
 */
router.put("/price-overrides", async (req, res) => {
  await ensureDb();

  const { kind, name, unit, price, note } = req.body || {};
  if (kind !== "material" && kind !== "labour")
    return res.status(400).json({ error: "kind must be material or labour" });
  if (!String(name || "").trim())
    return res.status(400).json({ error: "name is required" });

  // Scope to the state the user is actually set to. Taking this from the body
  // would let one user's correction be filed under a location they do not work
  // in, and there is no screen anywhere that would show the mistake.
  const stateKey = normalizeState(req.user.state) || null;

  const userId = getUserId(req);
  let lib = await RateGenLibrary.findOne({ userId });
  if (!lib) lib = await RateGenLibrary.create({ userId });

  const nm = String(name).trim();
  const un = String(unit || "").trim();
  const same = (o) =>
    o.kind === kind &&
    String(o.name).toLowerCase() === nm.toLowerCase() &&
    String(o.unit || "").toLowerCase() === un.toLowerCase() &&
    (o.state || null) === stateKey;

  lib.priceOverrides = (lib.priceOverrides || []).filter((o) => !same(o));

  const n = Number(price);
  const clearing = price === null || price === "" || price === undefined;
  if (!clearing) {
    if (!Number.isFinite(n) || n < 0)
      return res.status(400).json({ error: "price must be a number of zero or more" });
    lib.priceOverrides.push({
      kind, name: nm, unit: un, price: n, state: stateKey,
      note: String(note || "").trim(), updatedAt: new Date(),
    });
  }

  lib.priceOverridesVersion = (lib.priceOverridesVersion || 1) + 1;
  await lib.save();

  res.json({
    ok: true,
    cleared: clearing,
    items: lib.priceOverrides,
    version: lib.priceOverridesVersion,
    state: stateKey,
  });
});

/**
 * Move a whole category of the user's own prices by a percentage.
 *
 * CUSTOMER-LEVEL ONLY. This writes RateGenLibrary.priceOverrides for the state
 * on the caller's profile, exactly like the single-row PUT above. It never
 * touches the master catalogue: master prices are published from Rate Gen
 * desktop, and the website's master write routes answer 405 MASTER_READ_ONLY.
 *
 * It returns `changed` so the screen can report a true number, and the
 * overrides it replaced so the caller can offer an honest undo — a bulk
 * mistake is otherwise very hard to back out of by hand.
 */
router.put("/price-overrides/bulk", async (req, res) => {
  try {
    await ensureDb();

    const { kind, category, percent } = req.body || {};
    if (kind !== "material" && kind !== "labour")
      return res.status(400).json({ error: "kind must be material or labour" });

    const pc = Number(percent);
    if (!Number.isFinite(pc))
      return res.status(400).json({ error: "percent must be a number" });
    // A hundred per cent either way is already an extraordinary correction.
    // Beyond that it is far more likely to be a typo than an intention.
    if (pc < -100 || pc > 100)
      return res.status(400).json({ error: "percent must be between -100 and 100" });

    const stateKey = normalizeState(req.user.state) || null;
    const zone = (stateKey ? zoneForState(stateKey) : null) || req.user.zone || null;

    const userId = getUserId(req);
    let lib = await RateGenLibrary.findOne({ userId });
    if (!lib) lib = await RateGenLibrary.create({ userId });

    const rows =
      kind === "material"
        ? await fetchMasterMaterials(zone, stateKey)
        : await fetchMasterLabour(zone, stateKey);

    const before = (lib.priceOverrides || []).map((o) =>
      o?.toObject ? o.toObject() : { ...o },
    );

    const plan = planBulkPriceChange({
      rows,
      overrides: before,
      kind,
      category: category ?? null,
      percent: pc,
      stateKey,
      limit: MAX_BULK_ROWS,
    });

    if (!plan.changed) {
      return res.json({
        ok: true,
        changed: 0,
        matched: plan.matched,
        capped: plan.capped,
        version: lib.priceOverridesVersion || 1,
        state: stateKey,
      });
    }

    lib.priceOverrides = plan.overrides;
    lib.priceOverridesVersion = (lib.priceOverridesVersion || 1) + 1;
    await lib.save();

    res.json({
      ok: true,
      changed: plan.changed,
      matched: plan.matched,
      capped: plan.capped,
      // The whole previous array, so "Undo" is a restore rather than a guess
      // at which rows were replaced and which were created.
      previous: before,
      version: lib.priceOverridesVersion,
      state: stateKey,
    });
  } catch (e) {
    console.error("[/rategen/price-overrides/bulk] error:", e);
    res.status(500).json({ error: e?.message || "Failed to update prices" });
  }
});

/**
 * Put back exactly what was there before a bulk change. The client sends the
 * `previous` array it was given; the server normalises it through the schema
 * on save, so a hand-made payload cannot write a shape the model rejects.
 */
router.put("/price-overrides/restore", async (req, res) => {
  try {
    await ensureDb();
    const { items } = req.body || {};
    if (!Array.isArray(items))
      return res.status(400).json({ error: "items must be an array" });
    if (items.length > MAX_BULK_ROWS)
      return res.status(400).json({ error: "too many rows to restore" });

    const userId = getUserId(req);
    let lib = await RateGenLibrary.findOne({ userId });
    if (!lib) lib = await RateGenLibrary.create({ userId });

    lib.priceOverrides = items;
    lib.priceOverridesVersion = (lib.priceOverridesVersion || 1) + 1;
    await lib.save();

    res.json({ ok: true, items: lib.priceOverrides, version: lib.priceOverridesVersion });
  } catch (e) {
    console.error("[/rategen/price-overrides/restore] error:", e);
    res.status(500).json({ error: e?.message || "Failed to restore prices" });
  }
});

router.get("/library", async (req, res) => {
  await ensureDb();
  const userId = getUserId(req);
  let lib = await RateGenLibrary.findOne({ userId });
  if (!lib) lib = await RateGenLibrary.create({ userId });
  res.json(toLibraryResponse(lib));
});

router.put("/library", async (req, res) => {
  await ensureDb();
  const {
    materials,
    labour,
    baseVersion,
    rateOverrides,
    customRates,
    ratesBaseVersion,
    customRatesBaseVersion,
  } = req.body || {};

  const userId = getUserId(req);
  let lib = await RateGenLibrary.findOne({ userId });
  if (!lib) lib = await RateGenLibrary.create({ userId });

  if (
    Number.isFinite(baseVersion) &&
    baseVersion > 0 &&
    baseVersion !== lib.version
  ) {
    return res.status(409).json({
      error: "Library version conflict",
      version: lib.version,
      ratesVersion: lib.ratesVersion,
      customRatesVersion: lib.customRatesVersion,
    });
  }

  if (
    Number.isFinite(ratesBaseVersion) &&
    ratesBaseVersion > 0 &&
    ratesBaseVersion !== lib.ratesVersion
  ) {
    return res.status(409).json({
      error: "User rates version conflict",
      version: lib.version,
      ratesVersion: lib.ratesVersion,
      customRatesVersion: lib.customRatesVersion,
    });
  }

  if (
    Number.isFinite(customRatesBaseVersion) &&
    customRatesBaseVersion > 0 &&
    customRatesBaseVersion !== lib.customRatesVersion
  ) {
    return res.status(409).json({
      error: "Custom rates version conflict",
      version: lib.version,
      ratesVersion: lib.ratesVersion,
      customRatesVersion: lib.customRatesVersion,
    });
  }

  let touchedLibrary = false;

  if (Array.isArray(materials)) {
    lib.materials = materials;
    touchedLibrary = true;
  }
  if (Array.isArray(labour)) {
    lib.labour = labour;
    touchedLibrary = true;
  }
  if (Array.isArray(rateOverrides)) {
    lib.rateOverrides = rateOverrides.map((item) => normalizeRateOverride(item));
    lib.ratesVersion += 1;
  }
  if (Array.isArray(customRates)) {
    lib.customRates = customRates.map((item) => normalizeCustomRate(item));
    lib.customRatesVersion += 1;
  }

  if (touchedLibrary) lib.version += 1;
  await lib.save();
  res.json(toLibraryResponse(lib));
});

export default router;
