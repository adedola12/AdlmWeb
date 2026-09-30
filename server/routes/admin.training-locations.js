import express from "express";
import {
  TRAVEL_RATE_FIELDS,
  trainingCostEstimate,
  travelPatch,
} from "../util/trainingCost.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { TrainingLocation } from "../models/TrainingLocation.js";

const router = express.Router();
// Training locations are part of the "trainings" admin area.
router.use(requireAuth, requirePermission("trainings"));

// List all training locations (including inactive)
router.get("/", async (_req, res) => {
  try {
    const locations = await TrainingLocation.find()
      .sort({ createdAt: -1 })
      .lean();
    // Each row carries its own estimate, so the screen can show what a training
    // there costs to run beside what it is sold for, and flag the ones whose
    // rates have never been set.
    return res.json({
      ok: true,
      fields: TRAVEL_RATE_FIELDS,
      locations: locations.map((loc) => ({ ...loc, estimate: trainingCostEstimate(loc) })),
    });
  } catch (e) {
    console.error("admin training-locations list error:", e);
    return res.status(500).json({ error: "Failed to load training locations" });
  }
});

// Create
router.post("/", async (req, res) => {
  try {
    const {
      name, city, state, address,
      trainingCostNGN, trainingCostUSD,
      bimInstallCostNGN, bimInstallCostUSD,
      durationDays, isActive,
      travel,
    } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const loc = await TrainingLocation.create({
      name: name.trim(),
      city: (city || "").trim(),
      state: (state || "").trim(),
      address: (address || "").trim(),
      trainingCostNGN: Number(trainingCostNGN || 0),
      trainingCostUSD: Number(trainingCostUSD || 0),
      bimInstallCostNGN: Number(bimInstallCostNGN || 0),
      bimInstallCostUSD: Number(bimInstallCostUSD || 0),
      durationDays: Math.max(Number(durationDays || 1), 1),
      isActive: isActive !== false,
      // The travel rates on the way in, so a location can be set up in one pass
      // rather than created and then edited. Dropping them here meant a form
      // that offered the fields and quietly lost them.
      travel: travelPatch(travel),
    });

    return res.json({
      ok: true,
      location: loc,
      // So the form can show what a trip works out to without a second read.
      estimate: trainingCostEstimate(loc.toObject()),
    });
  } catch (e) {
    console.error("admin training-locations create error:", e);
    return res.status(500).json({ error: "Failed to create training location" });
  }
});

// Update
router.put("/:id", async (req, res) => {
  try {
    const loc = await TrainingLocation.findById(req.params.id);
    if (!loc) return res.status(404).json({ error: "Location not found" });

    const fields = [
      "name", "city", "state", "address",
      "trainingCostNGN", "trainingCostUSD",
      "bimInstallCostNGN", "bimInstallCostUSD",
      "durationDays", "isActive",
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (["trainingCostNGN", "trainingCostUSD", "bimInstallCostNGN", "bimInstallCostUSD"].includes(f)) {
          loc[f] = Number(req.body[f] || 0);
        } else if (f === "durationDays") {
          loc[f] = Math.max(Number(req.body[f] || 1), 1);
        } else if (f === "isActive") {
          loc[f] = !!req.body[f];
        } else {
          loc[f] = String(req.body[f] || "").trim();
        }
      }
    }

    // The travel rates, as a block. Each is a rate somebody maintains, so an
    // empty string clears it to 0 and util/trainingCost.js then reports it as
    // missing rather than counting it as free.
    const patch = travelPatch(req.body.travel);
    if (patch) Object.assign(loc.travel, patch);

    await loc.save();
    return res.json({ ok: true, location: loc, estimate: trainingCostEstimate(loc.toObject()) });
  } catch (e) {
    console.error("admin training-locations update error:", e);
    return res.status(500).json({ error: "Failed to update training location" });
  }
});

/**
 * What one training at this location would cost to run.
 *
 * Read-only, and it names every rate that is missing rather than quietly
 * treating it as free — a total that is too low is worse than no total.
 * people / rooms / days / nights can be overridden for a one-off.
 */
router.get("/:id/estimate", async (req, res) => {
  try {
    const loc = await TrainingLocation.findById(req.params.id).lean();
    if (!loc) return res.status(404).json({ error: "Location not found" });
    const n = (v) => (v === undefined ? undefined : Number(v));
    return res.json({
      ok: true,
      location: { id: String(loc._id), name: loc.name, city: loc.city, state: loc.state },
      fields: TRAVEL_RATE_FIELDS,
      ...trainingCostEstimate(loc, {
        people: n(req.query.people),
        rooms: n(req.query.rooms),
        days: n(req.query.days),
        nights: n(req.query.nights),
      }),
    });
  } catch (e) {
    console.error("admin training-locations estimate error:", e);
    return res.status(500).json({ error: "Failed to estimate" });
  }
});

// Delete
router.delete("/:id", async (req, res) => {
  try {
    const loc = await TrainingLocation.findByIdAndDelete(req.params.id);
    if (!loc) return res.status(404).json({ error: "Location not found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("admin training-locations delete error:", e);
    return res.status(500).json({ error: "Failed to delete training location" });
  }
});

export default router;
