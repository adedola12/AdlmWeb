import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import ModelCheck from "../models/ModelCheck.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
// POST /model-checks   — Save a new model check result
// ─────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      projectName,
      projectNumber,
      modelType,
      checkedAt,
      checkedByUser,
      readinessScore,
      overallStatus,
      totalElements,
      missingCategories,
      overlapCount,
      qsQueryText,
      categories,
      rebarAnalysis,
    } = req.body || {};

    if (!projectName || !modelType) {
      return res
        .status(400)
        .json({ error: "projectName and modelType are required." });
    }

    const check = await ModelCheck.create({
      userId: req.user._id || req.user.id,
      projectName: (projectName || "").slice(0, 200),
      projectNumber: (projectNumber || "").slice(0, 100),
      modelType,
      checkedAt: checkedAt ? new Date(checkedAt) : new Date(),
      checkedByUser: (checkedByUser || "").slice(0, 100),
      readinessScore: Math.min(100, Math.max(0, Number(readinessScore) || 0)),
      overallStatus: ["Pass", "Fail", "Warning"].includes(overallStatus)
        ? overallStatus
        : "Fail",
      totalElements: Number(totalElements) || 0,
      missingCategories: Number(missingCategories) || 0,
      overlapCount: Number(overlapCount) || 0,
      qsQueryText: (qsQueryText || "").slice(0, 50000),
      categories: Array.isArray(categories) ? categories.slice(0, 50) : [],
      rebarAnalysis: Array.isArray(rebarAnalysis)
        ? rebarAnalysis.slice(0, 20)
        : [],
    });

    return res.status(201).json({
      id: check._id.toString(),
      projectName: check.projectName,
      readinessScore: check.readinessScore,
      overallStatus: check.overallStatus,
      createdAt: check.createdAt,
    });
  } catch (err) {
    console.error("POST /model-checks error:", err);
    return res.status(500).json({ error: "Failed to save model check." });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /model-checks   — List all checks for the logged-in user
// ─────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [checks, total] = await Promise.all([
      ModelCheck.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "projectName projectNumber modelType readinessScore overallStatus totalElements missingCategories overlapCount checkedAt createdAt",
        )
        .lean(),
      ModelCheck.countDocuments({ userId }),
    ]);

    return res.json({
      checks,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /model-checks error:", err);
    return res.status(500).json({ error: "Failed to fetch model checks." });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /model-checks/:id   — Get a single check by ID
// ─────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const check = await ModelCheck.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!check) {
      return res.status(404).json({ error: "Model check not found." });
    }

    return res.json(check);
  } catch (err) {
    console.error("GET /model-checks/:id error:", err);
    return res.status(500).json({ error: "Failed to fetch model check." });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /model-checks/:id  — Delete a check
// ─────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const result = await ModelCheck.deleteOne({
      _id: req.params.id,
      userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Model check not found." });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /model-checks/:id error:", err);
    return res.status(500).json({ error: "Failed to delete model check." });
  }
});

export default router;
