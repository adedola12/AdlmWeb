import express from "express";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";

const router = express.Router();

// If your other /api/rates endpoints require Bearer token, keep the same middleware here.
router.get("/compute-items", async (_req, res) => {
  const items = await RateGenComputeItem.find({ enabled: true })
    .sort({ section: 1, name: 1 })
    .lean();

  // Return exactly the schema desktop expects (ComputeItemDefinition)
  res.json(
    items.map((x) => ({
      id: String(x._id),
      section: x.section,
      name: x.name,
      outputUnit: x.outputUnit,
      poPercent: x.poPercent,
      enabled: x.enabled,
      lines: (x.lines || []).map((l) => ({
        kind: l.kind,
        refSn: l.refSn ?? null,
        description: l.description || "",
        unit: l.unit || "",
        unitPriceAtBuild: l.unitPriceAtBuild ?? null,
        qtyPerUnit: l.qtyPerUnit ?? 0,
        factor: l.factor ?? 1,
      })),
    }))
  );
});

export default router;
