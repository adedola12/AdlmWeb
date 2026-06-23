// server/routes/services.js
// MEP services pricing: per-type constants + the shared build-up compute.
// Mounted at /rategen-v2 → /rategen-v2/services/*. Both the web MEP Budget view
// and (later) the MEP plugin call /services/compute so the math is identical.
// Rate resolution + pricing live in util/serviceResolve.js (shared).
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { ensureDb } from "../db.js";
import { ServiceConstant } from "../models/ServiceConstant.js";
import {
  getMergedConstants,
  priceServiceItems,
  norm,
} from "../util/serviceResolve.js";

const router = express.Router();

// Auth scoped to /services/* (mirrors rategen.library.js scoping its own auth).
router.use("/services", requireAuth);

function uid(req) {
  return req.user?._id || req.user?.id || req.user?.sub || null;
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
    const result = await priceServiceItems(uid(req), req.body?.items);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("services/compute error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
