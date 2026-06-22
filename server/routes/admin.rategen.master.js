// server/routes/admin.rategen.master.js
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  fetchMasterMaterials,
  fetchMasterLabour,
} from "../util/rategenMaster.js";
import { normalizeZone } from "../util/zones.js";

const router = express.Router();

// anyone holding the "rategen" admin area
router.use(requireAuth, requirePermission("rategen"));

// GET /admin/rategen-v2/master?zone=south_west
router.get("/master", async (req, res, next) => {
  try {
    const zone = normalizeZone(req.query.zone) || "south_west";

    const [materials, labour] = await Promise.all([
      fetchMasterMaterials(zone),
      fetchMasterLabour(zone),
    ]);

    res.json({
      ok: true,
      zone,
      materials,
      labour,
      source: "mongo-master",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
