import express from "express";
import { requireAdminKey } from "../middleware/requireAdminKey.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { bumpMeta } from "../models/RateGenMeta.js";

const router = express.Router();
router.use(requireAdminKey);

/**
 * Helper: snapshot line info from libraries.
 * This is what guarantees admin-created compute items rebind on user side.
 */
async function hydrateLines(lines = []) {
  const matSNs = lines
    .filter((l) => l.kind === "material" && l.refSn)
    .map((l) => l.refSn);
  const labSNs = lines
    .filter((l) => l.kind === "labour" && l.refSn)
    .map((l) => l.refSn);

  const [materials, labours] = await Promise.all([
    matSNs.length ? RateGenMaterial.find({ sn: { $in: matSNs } }).lean() : [],
    labSNs.length ? RateGenLabour.find({ sn: { $in: labSNs } }).lean() : [],
  ]);

  const matBySn = new Map(materials.map((m) => [m.sn, m]));
  const labBySn = new Map(labours.map((l) => [l.sn, l]));

  return lines.map((l) => {
    if (l.kind === "material" && l.refSn) {
      const m = matBySn.get(l.refSn);
      return {
        ...l,
        description: l.description || m?.name || "",
        unit: l.unit || m?.unit || "",
        refName: l.refName || m?.name || l.description || "",
        refKey: l.refKey || m?.key || "",
        unitPriceAtBuild: Number.isFinite(l.unitPriceAtBuild)
          ? l.unitPriceAtBuild
          : Number(m?.defaultUnitPrice || 0),
      };
    }
    if (l.kind === "labour" && l.refSn) {
      const lb = labBySn.get(l.refSn);
      return {
        ...l,
        description: l.description || lb?.name || "",
        unit: l.unit || lb?.unit || "",
        refName: l.refName || lb?.name || l.description || "",
        refKey: l.refKey || lb?.key || "",
        unitPriceAtBuild: Number.isFinite(l.unitPriceAtBuild)
          ? l.unitPriceAtBuild
          : Number(lb?.defaultUnitPrice || 0),
      };
    }
    // constant lines: keep as-is
    return {
      ...l,
      unitPriceAtBuild: Number(l.unitPriceAtBuild || 0),
      qtyPerUnit: Number(l.qtyPerUnit || 0),
      factor: Number(l.factor ?? 1),
    };
  });
}

/**
 * POST /admin/rategen/compute-items
 * body: { section, name, outputUnit?, overheadPercentDefault?, profitPercentDefault?, enabled?, lines[] }
 */
router.post("/compute-items", async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.section || !body.name) {
      return res.status(400).json({ error: "section and name are required" });
    }

    const hydrated = await hydrateLines(body.lines || []);

    const doc = await RateGenComputeItem.findOneAndUpdate(
      { section: body.section, name: body.name },
      {
        section: body.section,
        name: body.name,
        outputUnit: body.outputUnit || "m2",
        overheadPercentDefault: Number(body.overheadPercentDefault ?? 10),
        profitPercentDefault: Number(body.profitPercentDefault ?? 25),
        enabled: body.enabled !== false,
        notes: body.notes || "",
        lines: hydrated,
      },
      { new: true, upsert: true }
    );

    await bumpMeta(
      "compute",
      "admin",
      `upsert compute ${body.section}/${body.name}`
    );
    res.json({ ok: true, item: doc });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/rategen/compute-items?section=Blockwork
 */
router.get("/compute-items", async (req, res, next) => {
  try {
    const q = {};
    if (req.query.section) q.section = req.query.section;
    const items = await RateGenComputeItem.find(q)
      .sort({ section: 1, name: 1 })
      .lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

export default router;
