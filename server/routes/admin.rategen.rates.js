// server/routes/admin.rategen.rates.js
import express from "express";
import mongoose from "mongoose";
import { RateGenRate } from "../models/RateGenRate.js";
import { requireAdmin } from "../middleware/auth.js";
import { ensureDb } from "../db.js";

const router = express.Router();

// all endpoints here require admin (role-based, not x-admin-key)
router.use(requireAdmin);

/** canonical section keys */
const ALLOWED_SECTION_KEYS = new Set([
  "ground",
  "concrete",
  "blockwork",
  "finishes",
  "roofing",
  "doors_windows",
  "paint",
  "steelwork",
  "carbon",
]);

const SECTION_LABELS = {
  ground: "Groundwork",
  concrete: "Concrete Works",
  blockwork: "Blockwork",
  finishes: "Finishes",
  roofing: "Roofing",
  doors_windows: "Windows & Doors",
  paint: "Painting",
  steelwork: "Steelwork",
  carbon: "Carbon and Others"
};

const toNum = (v, fallback = 0) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

function normalizeSectionKey(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (s === "painting") return "paint";
  if (s.includes("door") || s.includes("window")) return "doors_windows";
  if (s.includes("steel")) return "steelwork";
  if (s.includes("roof")) return "roofing";
  if (s.includes("paint")) return "paint";
  if (s.includes("ground") || s.includes("substructure")) return "ground";
  if (s.includes("concrete")) return "concrete";
  if (s.includes("finish")) return "finishes";
  if (s.includes("block")) return "blockwork";
  if (s.includes("carbon")) return "carbon";

  return s;
}

/**
 * GET /admin/rategen-v2/rates?sectionKey=ground&limit=500
 */
router.get("/rates", async (req, res, next) => {
  try {
    await ensureDb();

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    if (sectionKey && !ALLOWED_SECTION_KEYS.has(sectionKey)) {
      return res.status(400).json({
        error: `Invalid sectionKey '${sectionKey}'. Allowed: ${Array.from(
          ALLOWED_SECTION_KEYS
        ).join(", ")}`,
      });
    }

    const limit = Math.min(1000, Math.max(1, toNum(req.query.limit, 500)));
    const q = {};
    if (sectionKey) q.sectionKey = sectionKey;

    const items = await RateGenRate.find(q)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/rategen-v2/rates
 */
router.post("/rates", async (req, res, next) => {
  try {
    await ensureDb();

    const b = req.body || {};
    const sectionKey = normalizeSectionKey(b.sectionKey);

    if (!ALLOWED_SECTION_KEYS.has(sectionKey)) {
      return res.status(400).json({
        error: `Invalid sectionKey '${sectionKey}'. Allowed: ${Array.from(
          ALLOWED_SECTION_KEYS
        ).join(", ")}`,
      });
    }

    const sectionLabel = String(
      SECTION_LABELS[sectionKey] || b.sectionLabel || ""
    ).trim();

    const description = String(b.description || "").trim();
    const unit = String(b.unit || "").trim();

    if (!description)
      return res.status(400).json({ error: "description is required" });
    if (!unit) return res.status(400).json({ error: "unit is required" });

    const breakdownRaw = Array.isArray(b.breakdown) ? b.breakdown : [];
    const breakdown = breakdownRaw
      .map((l) => {
        const componentName = String(l?.componentName || "").trim();
        const quantity = toNum(l?.quantity, 0);
        const unitLine = String(l?.unit || "").trim();
        const unitPrice = toNum(l?.unitPrice, 0);

        const lineTotal =
          toNum(l?.lineTotal, 0) > 0
            ? toNum(l?.lineTotal, 0)
            : quantity * unitPrice;

        return {
          componentName,
          quantity,
          unit: unitLine,
          unitPrice,
          lineTotal,

          // optional refs (safe if schema ignores unknown)
          refKind: l?.refKind ?? null,
          refSn: l?.refSn ?? null,
          refName: l?.refName ?? null,
        };
      })
      .filter((l) => l.componentName);

    const breakdownNet = breakdown.reduce(
      (sum, l) => sum + toNum(l.lineTotal, 0),
      0
    );
    const netCost = breakdownNet > 0 ? breakdownNet : toNum(b.netCost, 0);

    if (!(netCost > 0)) {
      return res.status(400).json({
        error: "netCost must be > 0 (use breakdown lines or provide netCost).",
      });
    }

    const overheadPercent =
      b.overheadPercent != null ? toNum(b.overheadPercent, 10) : 10;
    const profitPercent =
      b.profitPercent != null ? toNum(b.profitPercent, 25) : 25;

    const overheadValue = (netCost * overheadPercent) / 100;
    const profitValue = (netCost * profitPercent) / 100;
    const totalCost = netCost + overheadValue + profitValue;

    const itemNo =
      b.itemNo === undefined ||
      b.itemNo === null ||
      String(b.itemNo).trim() === ""
        ? undefined
        : toNum(b.itemNo, 0);

    const doc = await RateGenRate.create({
      sectionKey,
      sectionLabel,
      itemNo,
      description,
      unit,
      netCost,
      overheadPercent,
      profitPercent,
      overheadValue,
      profitValue,
      totalCost,
      breakdown,
      createdBy: req.user?._id || req.user?.id || null,
      updatedBy: req.user?._id || req.user?.id || null,
    });

    res.json({ ok: true, item: doc });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/rategen-v2/rates/:id
 */
router.delete("/rates/:id", async (req, res, next) => {
  try {
    await ensureDb();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const deleted = await RateGenRate.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Rate not found" });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
