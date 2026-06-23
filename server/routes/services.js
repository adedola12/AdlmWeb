// server/routes/services.js
// MEP services pricing: per-type constants + the shared build-up compute.
// Mounted at /rategen-v2 → /rategen-v2/services/*. Both the web MEP Budget view
// and (later) the MEP plugin call /services/compute so the math is identical.
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { ensureDb } from "../db.js";
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { ServiceConstant } from "../models/ServiceConstant.js";
import {
  computeServiceBuildup,
  SERVICE_TYPE_DEFAULTS,
} from "../util/serviceCompute.js";

const router = express.Router();

// Auth scoped to /services/* (mirrors rategen.library.js scoping its own auth).
router.use("/services", requireAuth);

function uid(req) {
  return req.user?._id || req.user?.id || req.user?.sub || null;
}
function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function round2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// Merge a user's saved per-type constants over the system defaults.
async function getMergedConstants(userId) {
  const doc = userId ? await ServiceConstant.findOne({ userId }).lean() : null;
  const saved = new Map((doc?.types || []).map((t) => [String(t.type), t]));
  const out = {};
  for (const [type, def] of Object.entries(SERVICE_TYPE_DEFAULTS)) {
    const s = saved.get(type) || {};
    out[type] = {
      type,
      measure: s.measure || def.measure,
      unit: s.unit || def.unit,
      standardLength: s.standardLength ?? def.standardLength,
      connectorRule: s.connectorRule || def.connectorRule,
      connectorsPerJoint: s.connectorsPerJoint ?? 1,
      fittingUpliftPercent: s.fittingUpliftPercent ?? 0,
    };
  }
  // Any user-defined custom types not present in the defaults.
  for (const t of doc?.types || []) {
    if (out[t.type]) continue;
    out[t.type] = {
      type: t.type,
      measure: t.measure || "length",
      unit: t.unit || "m",
      standardLength: t.standardLength || 0,
      connectorRule: t.connectorRule || "perBreak",
      connectorsPerJoint: t.connectorsPerJoint || 1,
      fittingUpliftPercent: t.fittingUpliftPercent || 0,
    };
  }
  return { unitSystem: doc?.unitSystem || "metric", types: out };
}

// Build normalized name→price maps from the RateGen master + the user's library
// (user overrides win). One load per request, not per item.
async function buildRateMaps(userId) {
  const [mats, labs, lib] = await Promise.all([
    RateGenMaterial.find({ enabled: true }).select("name defaultUnitPrice").lean(),
    RateGenLabour.find({ enabled: true }).select("name defaultUnitPrice").lean(),
    userId
      ? RateGenLibrary.findOne({ userId }).select("materials labour").lean()
      : null,
  ]);
  const material = new Map();
  const labour = new Map();
  for (const m of mats || []) {
    const k = norm(m?.name);
    const p = Number(m?.defaultUnitPrice);
    if (k && p > 0) material.set(k, p);
  }
  for (const l of labs || []) {
    const k = norm(l?.name);
    const p = Number(l?.defaultUnitPrice);
    if (k && p > 0) labour.set(k, p);
  }
  for (const m of lib?.materials || []) {
    const k = norm(m?.description || m?.name);
    const p = Number(m?.price);
    if (k && p > 0) material.set(k, p); // user override wins
  }
  for (const l of lib?.labour || []) {
    const k = norm(l?.description || l?.name);
    const p = Number(l?.price);
    if (k && p > 0) labour.set(k, p);
  }
  return { material, labour };
}

function lookup(map, name) {
  const k = norm(name);
  if (!k) return 0;
  if (map.has(k)) return map.get(k);
  for (const [key, val] of map) {
    if (key.includes(k) || k.includes(key)) return val; // loose contains match
  }
  return 0;
}

// GET /services/constants — merged-with-defaults constants for the Constants view.
router.get("/services/constants", async (req, res) => {
  try {
    await ensureDb();
    const merged = await getMergedConstants(uid(req));
    res.json({ ok: true, ...merged });
  } catch (e) {
    console.error("services/constants GET error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /services/constants — upsert the user's per-type overrides.
router.put("/services/constants", async (req, res) => {
  try {
    await ensureDb();
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id in token" });
    const body = req.body || {};
    const types = (Array.isArray(body.types) ? body.types : [])
      .map((t) => ({
        type: norm(t?.type),
        measure: t?.measure === "count" ? "count" : "length",
        unit: String(t?.unit || "").trim() || "m",
        standardLength: Number(t?.standardLength) || 0,
        connectorRule: ["perBreak", "perStick", "none"].includes(t?.connectorRule)
          ? t.connectorRule
          : "perBreak",
        connectorsPerJoint: Number(t?.connectorsPerJoint) || 1,
        fittingUpliftPercent: Number(t?.fittingUpliftPercent) || 0,
      }))
      .filter((t) => t.type);
    const unitSystem = body.unitSystem === "imperial" ? "imperial" : "metric";
    await ServiceConstant.findOneAndUpdate(
      { userId },
      { $set: { types, unitSystem } },
      { upsert: true, new: true },
    );
    const merged = await getMergedConstants(userId);
    res.json({ ok: true, ...merged });
  } catch (e) {
    console.error("services/constants PUT error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /services/compute — price a batch of services items.
// Body: { items: [{ type, description, qty, unit, materialName, labourName,
//   connectorName, fittings:[{name,count,materialRate?,labourRate?}],
//   overheadPercent, profitPercent, materialRate?, labourRate?, connectorRate? }] }
// Explicit *Rate fields override RateGen resolution (so the plugin, which
// resolves its own rates, can pass them straight through).
router.post("/services/compute", async (req, res) => {
  try {
    await ensureDb();
    const userId = uid(req);
    const items = Array.isArray(req.body?.items)
      ? req.body.items.slice(0, 2000)
      : [];
    if (!items.length) {
      return res.json({ ok: true, items: [], totals: { net: 0, amount: 0 } });
    }

    const [{ types: constants }, maps] = await Promise.all([
      getMergedConstants(userId),
      buildRateMaps(userId),
    ]);

    let totalNet = 0;
    let totalAmount = 0;

    const out = items.map((it) => {
      const type = norm(it?.type) || "pipe";
      const c =
        constants[type] || SERVICE_TYPE_DEFAULTS[type] || SERVICE_TYPE_DEFAULTS.pipe;
      const measure = c.measure || "length";

      const materialRate =
        Number(it?.materialRate) > 0
          ? Number(it.materialRate)
          : lookup(maps.material, it?.materialName || it?.description);
      const labourRate =
        Number(it?.labourRate) > 0
          ? Number(it.labourRate)
          : lookup(maps.labour, it?.labourName || it?.description);
      const connectorRate =
        Number(it?.connectorRate) > 0
          ? Number(it.connectorRate)
          : lookup(maps.material, it?.connectorName || "connector");

      const fittings = (Array.isArray(it?.fittings) ? it.fittings : []).map((f) => ({
        name: f?.name,
        count: Number(f?.count) || 0,
        materialRate:
          Number(f?.materialRate) > 0
            ? Number(f.materialRate)
            : lookup(maps.material, f?.name),
        labourRate:
          Number(f?.labourRate) > 0
            ? Number(f.labourRate)
            : lookup(maps.labour, f?.name),
      }));

      const overheadPercent = Number(it?.overheadPercent) || 0;
      const profitPercent = Number(it?.profitPercent) || 0;

      const buildup = computeServiceBuildup({
        measure,
        qty: Number(it?.qty) || 0,
        unit: it?.unit || c.unit,
        description: it?.description || "",
        constants: {
          standardLength: c.standardLength,
          connectorRule: c.connectorRule,
          connectorsPerJoint: c.connectorsPerJoint,
          fittingUpliftPercent: c.fittingUpliftPercent,
        },
        rates: { materialRate, labourRate, connectorRate },
        fittings,
        overheadPercent,
        profitPercent,
      });

      totalNet += buildup.net;
      totalAmount += buildup.net * (1 + (overheadPercent + profitPercent) / 100);

      return {
        type,
        description: it?.description || "",
        qty: Number(it?.qty) || 0,
        resolved: { materialRate, labourRate, connectorRate },
        buildup,
      };
    });

    res.json({
      ok: true,
      items: out,
      totals: { net: round2(totalNet), amount: round2(totalAmount) },
    });
  } catch (e) {
    console.error("services/compute error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
