// server/routes/admin.rategen.rates.js
import express from "express";
import mongoose from "mongoose";
import { ensureDb } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { RateGenRate } from "../models/RateGenRate.js";

const router = express.Router();

// Admin JWT only (NOT x-admin-key)
router.use(requireAdmin);

const ALLOWED_SECTION_KEYS = new Set([
  "ground",
  "concrete",
  "blockwork",
  "finishes",
  "roofing",
  "doors_windows",
  "paint",
  "steelwork",
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
};

function toNum(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

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

  return s;
}

function getUserObjectId(req) {
  const raw = req.user?.id || req.user?._id || req.user?.userId || null;
  const s = raw ? String(raw) : "";
  return mongoose.isValidObjectId(s)
    ? new mongoose.Types.ObjectId(s)
    : undefined;
}

function sanitizeBreakdown(breakdownRaw) {
  const raw = Array.isArray(breakdownRaw) ? breakdownRaw : [];

  const breakdown = raw
    .map((l) => {
      const componentName = String(l?.componentName || "").trim();
      const quantity = toNum(l?.quantity);
      const unit = String(l?.unit || "").trim();
      const unitPrice = toNum(l?.unitPrice);

      const lineTotal = quantity * unitPrice;

      // ✅ keep optional link metadata (won't break if schema is non-strict)
      const refKind = l?.refKind ? String(l.refKind).trim() : null; // "material" | "labour"
      const refSn = l?.refSn != null ? toNum(l.refSn) : null;
      const refName = l?.refName ? String(l.refName).trim() : null;

      return {
        componentName,
        quantity,
        unit,
        unitPrice,
        lineTotal,
        totalPrice: lineTotal,

        // optional linkage
        refKind,
        refSn,
        refName,
      };
    })
    .filter((l) => l.componentName);

  const breakdownNet = breakdown.reduce(
    (sum, l) => sum + toNum(l.lineTotal),
    0
  );
  return { breakdown, breakdownNet };
}


/**
 * GET /admin/rategen-v2/rates?sectionKey=ground&limit=500
 */
router.get("/rates", async (req, res, next) => {
  try {
    await ensureDb();

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    const limit = Math.min(1000, Math.max(1, toNum(req.query.limit, 500)));

    const q = {};
    if (sectionKey) q.sectionKey = sectionKey;

    const items = await RateGenRate.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ ok: true, items });
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

    const { breakdown, breakdownNet } = sanitizeBreakdown(b.breakdown);
    const netCost = breakdownNet > 0 ? breakdownNet : toNum(b.netCost);

    if (!(netCost > 0)) {
      return res.status(400).json({
        error: "netCost must be > 0 (use breakdown or provide netCost).",
      });
    }

    const overheadPercent = toNum(b.overheadPercent, 10);
    const profitPercent = toNum(b.profitPercent, 25);

    const overheadValue = (netCost * overheadPercent) / 100;
    const profitValue = (netCost * profitPercent) / 100;
    const totalCost = netCost + overheadValue + profitValue;

    const itemNo =
      b.itemNo === undefined ||
      b.itemNo === null ||
      String(b.itemNo).trim() === ""
        ? undefined
        : toNum(b.itemNo);

    const userObjId = getUserObjectId(req);

    const doc = await RateGenRate.create({
      sectionKey,
      sectionLabel,
      itemNo,
      code: b.code ? String(b.code).trim() : undefined,
      description,
      unit,

      netCost,
      overheadPercent,
      profitPercent,
      overheadValue,
      profitValue,
      totalCost,

      breakdown,

      createdBy: userObjId,
      updatedBy: userObjId,
    });

    return res.json({ ok: true, item: doc });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/rategen-v2/rates/:id  (EDIT / UPDATE)
 */
router.patch("/rates/:id", async (req, res, next) => {
  try {
    await ensureDb();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid id" });

    const existing = await RateGenRate.findById(id);
    if (!existing) return res.status(404).json({ error: "Rate not found" });

    const b = req.body || {};

    const sectionKey = b.sectionKey
      ? normalizeSectionKey(b.sectionKey)
      : existing.sectionKey;
    if (!ALLOWED_SECTION_KEYS.has(sectionKey)) {
      return res.status(400).json({
        error: `Invalid sectionKey '${sectionKey}'. Allowed: ${Array.from(
          ALLOWED_SECTION_KEYS
        ).join(", ")}`,
      });
    }

    const sectionLabel = String(
      SECTION_LABELS[sectionKey] ||
        b.sectionLabel ||
        existing.sectionLabel ||
        ""
    ).trim();

    const description = String(
      b.description ?? existing.description ?? ""
    ).trim();
    const unit = String(b.unit ?? existing.unit ?? "").trim();

    if (!description)
      return res.status(400).json({ error: "description is required" });
    if (!unit) return res.status(400).json({ error: "unit is required" });

    const breakdownInput =
      b.breakdown != null ? b.breakdown : existing.breakdown;
    const { breakdown, breakdownNet } = sanitizeBreakdown(breakdownInput);

    const fallbackNet = toNum(existing.netCost, 0);
    const netCost =
      breakdownNet > 0
        ? breakdownNet
        : b.netCost != null
        ? toNum(b.netCost, fallbackNet)
        : fallbackNet;

    if (!(netCost > 0)) {
      return res.status(400).json({
        error: "netCost must be > 0 (use breakdown or provide netCost).",
      });
    }

    const overheadPercent =
      b.overheadPercent != null
        ? toNum(b.overheadPercent, 10)
        : toNum(existing.overheadPercent, 10);

    const profitPercent =
      b.profitPercent != null
        ? toNum(b.profitPercent, 25)
        : toNum(existing.profitPercent, 25);

    const overheadValue = (netCost * overheadPercent) / 100;
    const profitValue = (netCost * profitPercent) / 100;
    const totalCost = netCost + overheadValue + profitValue;

    const itemNo =
      b.itemNo === undefined || b.itemNo === null
        ? existing.itemNo
        : String(b.itemNo).trim() === ""
        ? undefined
        : toNum(b.itemNo);

    const userObjId = getUserObjectId(req);

    const updated = await RateGenRate.findByIdAndUpdate(
      id,
      {
        sectionKey,
        sectionLabel,
        itemNo,
        code:
          b.code != null
            ? String(b.code || "").trim() || undefined
            : existing.code,
        description,
        unit,

        netCost,
        overheadPercent,
        profitPercent,
        overheadValue,
        profitValue,
        totalCost,

        breakdown,

        updatedBy: userObjId,
      },
      { new: true }
    ).lean();

    return res.json({ ok: true, item: updated });
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
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid id" });

    const deleted = await RateGenRate.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Rate not found" });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
