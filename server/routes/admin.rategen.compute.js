import express from "express";
import { ensureDb } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";

import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { computeRate } from "../services/rategen.computeEngine.js";

const router = express.Router();

// entitled users only (same rule as library)
router.use(requireAuth, requireEntitlement("rategen"));

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
  return s;
}

/**
 * GET /rategen/compute/items?section=blockwork
 * Returns ComputeItemDefinition list for desktop.
 */
router.get("/compute/items", async (req, res, next) => {
  try {
    await ensureDb();

    const q = { enabled: true };
    const section = normalizeSectionKey(req.query.section);
    if (section) q.section = section;

    const items = await RateGenComputeItem.find(q)
      .sort({ section: 1, name: 1 })
      .lean();

    res.json(
      items.map((x) => {
        const oh = toNum(x.overheadPercentDefault, 10);
        const pf = toNum(x.profitPercentDefault, 25);

        return {
          id: String(x._id),
          section: x.section,
          name: x.name,
          outputUnit: x.outputUnit || "m2",

          overheadPercentDefault: oh,
          profitPercentDefault: pf,

          // legacy single P/O
          poPercent: oh + pf,

          enabled: x.enabled !== false,
          notes: x.notes || "",
          updatedAt: x.updatedAt,

          lines: (x.lines || []).map((l) => ({
            kind: l.kind,
            refSn: l.refSn ?? null,
            refKey: l.refKey ?? null,
            refName: l.refName ?? null,
            description: l.description || "",
            unit: l.unit || "",
            unitPriceAtBuild: l.unitPriceAtBuild ?? null,
            qtyPerUnit: l.qtyPerUnit ?? 0,
            factor: l.factor ?? 1,
          })),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /rategen/compute/run
 * body: { section, name, overheadPercent?, profitPercent?, priceMode? }
 */
router.post("/compute/run", async (req, res, next) => {
  try {
    await ensureDb();

    const { section, name, overheadPercent, profitPercent, priceMode } =
      req.body || {};
    const sec = normalizeSectionKey(section);
    const nm = String(name || "").trim();

    if (!sec || !nm) {
      return res.status(400).json({ error: "section and name are required" });
    }

    const result = await computeRate({
      section: sec,
      name: nm,
      overheadPercent:
        overheadPercent != null ? toNum(overheadPercent) : undefined,
      profitPercent: profitPercent != null ? toNum(profitPercent) : undefined,
      priceMode: priceMode || "hybrid",
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

/* ───────── Legacy aliases (optional for transition) ───────── */
router.get("/compute-items", (req, res, next) =>
  router.handle({ ...req, url: "/compute/items" }, res, next)
);
router.post("/compute", (req, res, next) =>
  router.handle({ ...req, url: "/compute/run" }, res, next)
);

export default router;
