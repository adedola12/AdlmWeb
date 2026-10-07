// server/routes/admin.rategen.plant.js
//
// ADLM's plant library: machines priced per day from their parts and used by
// the hour (util/plantCosting.js). Master-level, so it sits behind the same
// "rategen" admin permission as the master rates.
//
// Plant has no Rate Gen desktop store to be published from, unlike materials
// and labour, so this is where ADLM keeps it.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { ensureDb } from "../db.js";
import { RateGenPlant } from "../models/RateGenPlant.js";
import { allocateSn, bumpMeta } from "../models/RateGenMeta.js";
import { cleanPlantInput, plantCosting } from "../util/plantCosting.js";

const router = express.Router();
router.use(requireAuth, requirePermission("rategen"));

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const view = (p) => ({ ...p, ...plantCosting(p) });

/** GET /admin/rategen-v2/plant — every machine, disabled ones too. */
router.get("/plant", async (_req, res, next) => {
  try {
    await ensureDb();
    const items = await RateGenPlant.find({}).sort({ name: 1 }).lean();
    res.json({ ok: true, items: items.map(view) });
  } catch (err) {
    next(err);
  }
});

/** POST /admin/rategen-v2/plant — add a machine. */
router.post("/plant", async (req, res, next) => {
  try {
    await ensureDb();
    const { plant, problem } = cleanPlantInput(req.body);
    if (problem) return res.status(400).json({ error: problem });

    const sn = await allocateSn("plant");
    const doc = await RateGenPlant.create({
      ...plant,
      sn,
      key: slug(plant.name),
      priceAsOf: new Date(),
      enabled: req.body?.enabled !== false,
      updatedBy: req.user?._id || req.user?.id || null,
    });
    await bumpMeta("plant", "admin", `add plant sn=${sn}`);
    res.json({ ok: true, item: view(doc.toObject()) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin/rategen-v2/plant/:sn — change a machine.
 *
 * A rate that already carries this machine keeps the hourly price it was
 * built at (its breakdown line holds its own unitPrice and priceAsOf); the
 * new price reaches a rate when it is next built or re-priced. Nothing here
 * re-prices a stored rate.
 */
router.put("/plant/:sn", async (req, res, next) => {
  try {
    await ensureDb();
    const sn = Number(req.params.sn);
    if (!Number.isFinite(sn)) return res.status(400).json({ error: "Invalid sn" });
    const doc = await RateGenPlant.findOne({ sn });
    if (!doc) return res.status(404).json({ error: "Machine not found" });

    const { plant, problem } = cleanPlantInput(req.body);
    if (problem) return res.status(400).json({ error: problem });

    Object.assign(doc, plant, {
      priceAsOf: new Date(),
      updatedBy: req.user?._id || req.user?.id || null,
    });
    if (typeof req.body?.enabled === "boolean") doc.enabled = req.body.enabled;
    await doc.save();
    await bumpMeta("plant", "admin", `update plant sn=${sn}`);
    res.json({ ok: true, item: view(doc.toObject()) });
  } catch (err) {
    next(err);
  }
});

/** DELETE is withdrawn for the same reason a published rate cannot be deleted. */
router.delete("/plant/:sn", (_req, res) =>
  res.status(405).json({
    error:
      "A machine cannot be deleted: rates already built with it name it. Disable it instead, and it drops out of the pickers.",
    code: "PLANT_DELETE_WITHDRAWN",
  }),
);

export default router;
