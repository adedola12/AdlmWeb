// server/routes/admin.rategen.rates.js
import express from "express";
import mongoose from "mongoose";
import { RateGenRate } from "../models/RateGenRate.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { ensureDb } from "../db.js";
import { validateRateComposition } from "../util/rateGuardrail.js";
import { RateGenTradeMargin } from "../models/RateGenTradeMargin.js";
import { cleanMarginRows, resolveMargins } from "../util/tradeMargins.js";
import { tradeMarginsView } from "../util/tradeMarginsView.js";
import { ALLOWED_SECTION_KEYS, SECTION_LABELS } from "../util/rategenSections.js";

const router = express.Router();

// anyone holding the "rategen" admin area can manage rates
router.use(requireAuth, requirePermission("rategen"));

// The canonical trades live in util/rategenSections.js so the trade-margin
// helpers can read them without importing this router. Re-exported here
// because the catalogue register already imports them from this file.
export { ALLOWED_SECTION_KEYS, SECTION_LABELS };

const toNum = (v, fallback = 0) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeSectionKey(raw) {
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
  if (s.includes("mep")) return "mep";

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
          // Persist the intended line total (incl. waste %, output conversions)
          // so the stored breakdown sums to netCost and each qty/rate reconciles.
          totalPrice: lineTotal,

          // provenance: kind + source-library linkage + capture time
          refKind: l?.refKind ?? null,
          refSn: l?.refSn ?? null,
          refName: l?.refName ?? null,
          priceAsOf: l?.priceAsOf ? new Date(l.priceAsOf) : new Date(),
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

    // A figure the builder sends is kept exactly. One it leaves out comes from
    // ADLM's default for this trade, else the built-in 10 / 25 — which is
    // exactly what every master rate got before trade defaults existed.
    const tradeDefaults =
      b.overheadPercent != null && b.profitPercent != null
        ? null
        : resolveMargins({
            scope: "master",
            sectionKey,
            adlmTrades: await RateGenTradeMargin.find({ sectionKey }).lean(),
          });
    const overheadPercent =
      b.overheadPercent != null
        ? toNum(b.overheadPercent, 10)
        : tradeDefaults.overheadPercent;
    const profitPercent =
      b.profitPercent != null ? toNum(b.profitPercent, 25) : tradeDefaults.profitPercent;

    const overheadValue = (netCost * overheadPercent) / 100;
    const profitValue = (netCost * profitPercent) / 100;
    const totalCost = netCost + overheadValue + profitValue;

    // Composite-rate guardrail (spec §2): a headline total must not exceed
    // Material + Labour + Overhead + Profit beyond tolerance. The server always
    // stores the derived `totalCost`, but if the client supplied one we reject
    // overstated values so an invalid rate never gets created.
    if (
      b.totalCost !== undefined &&
      b.totalCost !== null &&
      String(b.totalCost).trim() !== ""
    ) {
      const guard = validateRateComposition({
        netCost,
        overheadAmount: overheadValue,
        profitAmount: profitValue,
        totalCost: b.totalCost,
      });
      if (guard.status === "overstated") {
        return res.status(400).json({
          error:
            "totalCost exceeds its build-up (netCost + overhead + profit). " +
            `Stated ${guard.stated.toFixed(2)} vs expected ${guard.expected.toFixed(
              2
            )} (tolerance ±${guard.tolerance.toFixed(2)}).`,
          guardrail: guard,
        });
      }
    }

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
 * PATCH /admin/rategen-v2/rates/:id
 * PUT   /admin/rategen-v2/rates/:id
 *
 * Update an existing master rate. Mirrors POST /rates: re-derives netCost from
 * the breakdown, recomputes overhead/profit/totalCost, runs the composite-rate
 * guardrail (reject overstated totals), persists breakdown provenance, and
 * enforces canonical section keys.
 *
 * We load the doc and `.save()` it (rather than findByIdAndUpdate) so the
 * RateGenRate `pre("save")` hook runs — it rebuilds each breakdown line
 * (keeping refKind/refSn/refName/priceAsOf) and recomputes the derived totals.
 */
const updateRate = async (req, res, next) => {
  try {
    await ensureDb();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const doc = await RateGenRate.findById(id);
    if (!doc) return res.status(404).json({ error: "Rate not found" });

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
          // Persist the intended line total (incl. waste %, output conversions)
          // so the stored breakdown sums to netCost and each qty/rate reconciles.
          totalPrice: lineTotal,

          // provenance: kind + source-library linkage + capture time
          refKind: l?.refKind ?? null,
          refSn: l?.refSn ?? null,
          refName: l?.refName ?? null,
          priceAsOf: l?.priceAsOf ? new Date(l.priceAsOf) : new Date(),
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

    // An edit that leaves a percentage out keeps the one this rate already
    // holds. It used to fall back to 10 / 25, which silently re-priced a
    // stored rate; no default of any kind ever rewrites a stored figure.
    const overheadPercent =
      b.overheadPercent != null
        ? toNum(b.overheadPercent, 10)
        : toNum(doc.overheadPercent, 10);
    const profitPercent =
      b.profitPercent != null ? toNum(b.profitPercent, 25) : toNum(doc.profitPercent, 25);

    const overheadValue = (netCost * overheadPercent) / 100;
    const profitValue = (netCost * profitPercent) / 100;
    const totalCost = netCost + overheadValue + profitValue;

    // Composite-rate guardrail (spec §2): a headline total must not exceed
    // Material + Labour + Overhead + Profit beyond tolerance. The server always
    // stores the derived `totalCost`, but if the client supplied one we reject
    // overstated values so an edit can never overstate the rate.
    if (
      b.totalCost !== undefined &&
      b.totalCost !== null &&
      String(b.totalCost).trim() !== ""
    ) {
      const guard = validateRateComposition({
        netCost,
        overheadAmount: overheadValue,
        profitAmount: profitValue,
        totalCost: b.totalCost,
      });
      if (guard.status === "overstated") {
        return res.status(400).json({
          error:
            "totalCost exceeds its build-up (netCost + overhead + profit). " +
            `Stated ${guard.stated.toFixed(2)} vs expected ${guard.expected.toFixed(
              2
            )} (tolerance ±${guard.tolerance.toFixed(2)}).`,
          guardrail: guard,
        });
      }
    }

    const itemNo =
      b.itemNo === undefined ||
      b.itemNo === null ||
      String(b.itemNo).trim() === ""
        ? undefined
        : toNum(b.itemNo, 0);

    doc.sectionKey = sectionKey;
    doc.sectionLabel = sectionLabel;
    doc.itemNo = itemNo;
    doc.description = description;
    doc.unit = unit;
    doc.netCost = netCost;
    doc.overheadPercent = overheadPercent;
    doc.profitPercent = profitPercent;
    doc.overheadValue = overheadValue;
    doc.profitValue = profitValue;
    doc.totalCost = totalCost;
    doc.breakdown = breakdown;
    doc.updatedBy = req.user?._id || req.user?.id || null;

    await doc.save();

    res.json({ ok: true, item: doc });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admin/rategen-v2/trade-margins
 * ADLM's overhead and profit default per trade, for the master library.
 */
router.get("/trade-margins", async (_req, res, next) => {
  try {
    await ensureDb();
    const rows = await RateGenTradeMargin.find({}).lean();
    res.json({ ok: true, ...tradeMarginsView([], rows) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin/rategen-v2/trade-margins
 * body: { rows: [{ sectionKey, overheadPercent, profitPercent }] }
 *
 * Replaces ADLM's table. Read only when a master rate is CREATED without a
 * percentage: no published rate is re-priced by saving this.
 */
router.put("/trade-margins", async (req, res, next) => {
  try {
    await ensureDb();
    const { rows, problem } = cleanMarginRows(req.body?.rows, ALLOWED_SECTION_KEYS);
    if (problem) return res.status(400).json({ error: problem });

    const by = req.user?._id || req.user?.id || null;
    const keep = rows.map((r) => r.sectionKey);
    await RateGenTradeMargin.deleteMany({ sectionKey: { $nin: keep } });
    for (const r of rows) {
      await RateGenTradeMargin.findOneAndUpdate(
        { sectionKey: r.sectionKey },
        { ...r, updatedBy: by },
        { upsert: true, new: true, runValidators: true },
      );
    }
    const saved = await RateGenTradeMargin.find({}).lean();
    res.json({ ok: true, ...tradeMarginsView([], saved) });
  } catch (err) {
    next(err);
  }
});

router.patch("/rates/:id", updateRate);
router.put("/rates/:id", updateRate);

/**
 * DELETE /admin/rategen-v2/rates/:id — withdrawn deliberately.
 *
 * A published rate is not the admin's to remove. RateGen, QUIV and HERON all
 * price against this library, and a bill built last month names the rate that
 * priced it: deleting one does not unprice that bill, it makes the figure on
 * it unexplainable. There is no undo and no archive to restore from.
 *
 * The route is kept, answering 405 with the reason, rather than deleted
 * outright — a 404 would read as "wrong URL" and invite somebody to look for
 * the right one.
 *
 * What to do instead, depending on what was actually wanted:
 *   - the rate is wrong          → edit it; every product re-syncs on its next
 *                                  pull and old bills keep their own figures
 *   - the rate should not be used → price it out of use, or raise it with the
 *                                  library owner; there is no "retired" flag
 *                                  yet and inventing one here would be a
 *                                  schema change made in a hurry
 */
router.delete("/rates/:id", (_req, res) =>
  res.status(405).json({
    error:
      "A published rate cannot be deleted. Bills already priced with it name it, and removing it would leave those figures unexplainable. Edit the rate instead — every product picks the change up on its next sync.",
    code: "RATE_DELETE_WITHDRAWN",
  }),
);

export default router;
