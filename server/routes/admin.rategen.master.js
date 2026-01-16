// server/routes/admin.rategen.master.js
import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import {
  fetchMasterMaterials,
  fetchMasterLabour,
} from "../util/rategenMaster.js";
import { normalizeZone } from "../util/zones.js";

const router = express.Router();

// admin only
router.use(requireAdmin);

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
