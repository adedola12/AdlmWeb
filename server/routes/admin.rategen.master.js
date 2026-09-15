// server/routes/admin.rategen.master.js
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  fetchMasterMaterials,
  fetchMasterLabour,
  updateMasterPrices,
} from "../util/rategenMaster.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";
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

/**
 * PATCH /admin/rategen-v2/master/prices
 *
 * Set master prices for a zone. This is what Rate Gen calls when an
 * administrator publishes a price change, and it is the reason the change goes
 * through the API at all rather than the desktop writing Mongo directly.
 *
 * WHY THE SERVER DECIDES, NOT THE APP
 *
 * Rate Gen has no idea what role the signed-in person holds — nothing in
 * AuthClient carries one, and nothing local could be trusted if it did, since
 * the app runs on the customer's own machine. A price here is every user's
 * price. So the permission is enforced on this side, where it cannot be
 * edited by the person it restricts.
 *
 * Every publish is audited: it changes what every install will pull down, and
 * "who put the cement price up" should have an answer.
 */
router.patch("/master/prices", async (req, res, next) => {
  try {
    const kind = String(req.body?.kind || "").toLowerCase();
    if (kind !== "material" && kind !== "labour") {
      return res.status(400).json({ error: "kind must be material or labour" });
    }

    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) {
      return res.status(400).json({ error: "updates must be a non-empty array" });
    }
    // A publish is meant to be a considered correction, not a bulk import. The
    // whole catalogue arriving in one request is how a mistake becomes 595
    // mistakes.
    if (updates.length > 500) {
      return res.status(400).json({ error: "too many rows in one publish (max 500)" });
    }

    const zone = normalizeZone(req.body?.zone) || "south_west";
    const state = req.body?.state || null;

    const result = await updateMasterPrices(kind, updates, zone, state);

    await writeAudit({
      actorId: req.user?._id,
      actorEmail: req.user?.email,
      isGod: !!req.user?.isGod,
      action: "rategen.master.prices",
      status: 200,
      ...reqAuditContext(req),
      meta: {
        kind,
        scope: result.scope,
        changed: result.changed.length,
        missing: result.missing.length,
        // The figures themselves, so the log answers "what was it before" as
        // well as "who".
        rows: result.changed.slice(0, 100),
      },
    });

    res.json({
      ok: true,
      kind,
      scope: result.scope,
      changed: result.changed.length,
      missing: result.missing,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
