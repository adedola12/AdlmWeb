import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getTimeMgtDb } from "../db.timemgt.js";
import { getLaborTaskModel } from "../models/TimeMgtTask.js";

const router = Router();

// All task routes require a valid ADLM JWT
router.use(requireAuth);

// Lazy connection: resolve the TimeMgt DB once per request if not cached
async function getModel() {
  const conn = await getTimeMgtDb();
  return getLaborTaskModel(conn);
}

/**
 * GET /api/tasks
 * Returns all tasks owned by the authenticated user.
 * Supports ?limit=N&skip=N for pagination.
 */
router.get("/", async (req, res) => {
  try {
    const ownerKey = String(req.user?.id || req.user?._id || req.user?.sub || "");
    if (!ownerKey) return res.status(401).json({ error: "Unauthorized" });

    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const skip = parseInt(req.query.skip) || 0;

    const LaborTask = await getModel();
    const tasks = await LaborTask.find({ ownerKey })
      .sort({ taskStartDate: -1, createdAtUtc: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ tasks, count: tasks.length });
  } catch (err) {
    console.error("[tasks] GET / error:", err?.message || err);
    res.status(500).json({ error: "Failed to load tasks." });
  }
});

/**
 * GET /api/tasks/:taskKey
 * Returns a single task by its WPF taskKey (guid string).
 */
router.get("/:taskKey", async (req, res) => {
  try {
    const ownerKey = String(req.user?.id || req.user?._id || req.user?.sub || "");
    const LaborTask = await getModel();
    const task = await LaborTask.findOne({
      taskKey: req.params.taskKey,
      ownerKey,
    }).lean();

    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({ task });
  } catch (err) {
    console.error("[tasks] GET /:taskKey error:", err?.message || err);
    res.status(500).json({ error: "Failed to load task." });
  }
});

/**
 * POST /api/tasks
 * Creates a new task. Requires taskKey in the body (WPF generates this as a guid).
 */
router.post("/", async (req, res) => {
  try {
    const ownerKey = String(req.user?.id || req.user?._id || req.user?.sub || "");
    if (!ownerKey) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    if (!body.taskKey) {
      return res.status(400).json({ error: "taskKey is required." });
    }
    if (!body.itemOfWork) {
      return res.status(400).json({ error: "itemOfWork is required." });
    }

    const LaborTask = await getModel();

    const now = new Date();
    const task = await LaborTask.findOneAndUpdate(
      { taskKey: body.taskKey, ownerKey },
      {
        $setOnInsert: { createdAtUtc: body.createdAtUtc ? new Date(body.createdAtUtc) : now },
        $set: {
          ownerKey,
          taskKey: body.taskKey,
          updatedAtUtc: now,
          iD: body.iD ?? 0,
          itemOfWork: body.itemOfWork ?? "",
          trade: body.trade ?? "",
          skilledLabor: body.skilledLabor ?? 0,
          unskilledLabor: body.unskilledLabor ?? 0,
          hoursWorked: body.hoursWorked ?? 0,
          breakHours: body.breakHours ?? 0,
          equipmentUsed: body.equipmentUsed ?? "",
          output: body.output ?? 0,
          outputUnit: body.outputUnit ?? "units",
          taskStartDate: body.taskStartDate ? new Date(body.taskStartDate) : null,
          taskEndDate: body.taskEndDate ? new Date(body.taskEndDate) : null,
          weather: body.weather ?? null,
        },
      },
      { upsert: true, new: true, lean: true }
    );

    res.status(201).json({ task });
  } catch (err) {
    console.error("[tasks] POST / error:", err?.message || err);
    res.status(500).json({ error: "Failed to create task." });
  }
});

/**
 * PATCH /api/tasks/:taskKey
 * Partial update — only the fields sent in the body are updated.
 * updatedAtUtc is always refreshed server-side.
 */
router.patch("/:taskKey", async (req, res) => {
  try {
    const ownerKey = String(req.user?.id || req.user?._id || req.user?.sub || "");
    const body = req.body || {};

    // Strip read-only / identity fields from the patch body
    const { taskKey: _k, ownerKey: _o, _id: _id, createdAtUtc: _c, ...fields } = body;

    const LaborTask = await getModel();
    const task = await LaborTask.findOneAndUpdate(
      { taskKey: req.params.taskKey, ownerKey },
      { $set: { ...fields, updatedAtUtc: new Date() } },
      { new: true, lean: true }
    );

    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({ task });
  } catch (err) {
    console.error("[tasks] PATCH /:taskKey error:", err?.message || err);
    res.status(500).json({ error: "Failed to update task." });
  }
});

/**
 * DELETE /api/tasks/:taskKey
 * Soft-deletes by taskKey — only the owner can delete.
 */
router.delete("/:taskKey", async (req, res) => {
  try {
    const ownerKey = String(req.user?.id || req.user?._id || req.user?.sub || "");
    const LaborTask = await getModel();
    const result = await LaborTask.deleteOne({
      taskKey: req.params.taskKey,
      ownerKey,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Task not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[tasks] DELETE /:taskKey error:", err?.message || err);
    res.status(500).json({ error: "Failed to delete task." });
  }
});

/**
 * GET /api/tasks/weather/forecast
 * Returns a 7-day Open-Meteo forecast for the given lat/lon.
 * Free, no API key required. Web/mobile clients use this instead of
 * calling Open-Meteo directly, which keeps the API surface unified and
 * lets us add server-side caching later.
 */
router.get("/weather/forecast", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: "lat and lon query params are required." });
    }

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,wind_speed_10m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=7`;

    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      return res.status(502).json({ error: "Weather upstream error." });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error("[tasks] GET /weather/forecast error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch weather forecast." });
  }
});

export default router;
