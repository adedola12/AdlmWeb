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
import { normalizeZone, ZONES } from "../util/zones.js";
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

router.get("/master", async (req, res) => {
  try {
    await ensureDb(); // ⬅️ safe guard

    const qZone = normalizeZone(req.query.zone);
    const zone = qZone || req.user.zone || null;

    const [materials, labour] = await Promise.all([
      fetchMasterMaterials(zone),
      fetchMasterLabour(zone),
    ]);

    res.json({ materials, labour, source: "mongo-master", zone });
  } catch (e) {
    console.error("[/rategen/master] error:", e);
    res
      .status(500)
      .json({ error: e?.message || "Failed to load master prices" });
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
