import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { TrainingLocation } from "../models/TrainingLocation.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

// List all training locations (including inactive)
router.get("/", async (_req, res) => {
  try {
    const locations = await TrainingLocation.find()
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, locations });
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
    });

    return res.json({ ok: true, location: loc });
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

    await loc.save();
    return res.json({ ok: true, location: loc });
  } catch (e) {
    console.error("admin training-locations update error:", e);
    return res.status(500).json({ error: "Failed to update training location" });
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
