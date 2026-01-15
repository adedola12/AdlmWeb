// server/routes/rates.compute.js
import express from "express";
import { ensureDb } from "../db.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { computeRate } from "../services/rategen.computeEngine.js";

const router = express.Router();

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// GET /api/rates/compute-items?section=blockwork
router.get("/compute-items", async (req, res, next) => {
  try {
    await ensureDb();

    const q = { enabled: true };

    // optional filtering (helps desktop refresh only one view)
    const section = String(req.query.section || "").trim();
    if (section) q.section = section;

    const items = await RateGenComputeItem.find(q)
      .sort({ section: 1, name: 1 })
      .lean();

    res.json(
      items.map((x) => {
        const oh = toNum(x.overheadPercentDefault ?? 10);
        const pf = toNum(x.profitPercentDefault ?? 25);

        return {
          id: String(x._id),
          section: x.section,
          name: x.name,
          outputUnit: x.outputUnit || "m2",

          // recommended (new)
          overheadPercentDefault: oh,
          profitPercentDefault: pf,

          // legacy (if desktop expects one P/O)
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
            unitPriceAtBuild:
              l.unitPriceAtBuild != null ? Number(l.unitPriceAtBuild) : null,
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
 * POST /api/rates/compute
 * body: { section, name, overheadPercent?, profitPercent?, priceMode? }
 */
router.post("/compute", async (req, res, next) => {
  try {
    await ensureDb();

    const { section, name, overheadPercent, profitPercent, priceMode } =
      req.body || {};

    if (!section || !name) {
      return res.status(400).json({ error: "section and name are required" });
    }

    const result = await computeRate({
      section: String(section).trim(),
      name: String(name).trim(),
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

export default router;
