import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { LaborTask } from "../models/TimeMgtTask.js";

const router = Router();

// All task routes require a valid ADLM JWT
router.use(requireAuth);

function ownerKey(req) {
  return String(req.user?.id || req.user?._id || req.user?.sub || "");
}

/**
 * GET /api/tasks/weather/forecast
 * Proxy to Open-Meteo — free, no API key. Must be defined BEFORE /:taskKey
 * so Express does not match "weather" as a taskKey.
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

    res.json(await upstream.json());
  } catch (err) {
    console.error("[tasks] GET /weather/forecast error:", err?.message);
    res.status(500).json({ error: "Failed to fetch weather forecast." });
  }
});

/**
 * GET /api/tasks
 * Returns all tasks owned by the authenticated user.
 * Supports ?limit=N&skip=N for pagination.
 */
router.get("/", async (req, res) => {
  try {
    const key = ownerKey(req);
    if (!key) return res.status(401).json({ error: "Unauthorized" });

    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const skip = parseInt(req.query.skip) || 0;

    const tasks = await LaborTask.find({ ownerKey: key })
      .sort({ taskStartDate: -1, createdAtUtc: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ tasks, count: tasks.length });
  } catch (err) {
    console.error("[tasks] GET / error:", err?.message);
    res.status(500).json({ error: "Failed to load tasks." });
  }
});

/**
 * GET /api/tasks/:taskKey
 * Returns a single task by its WPF taskKey (guid string).
 */
router.get("/:taskKey", async (req, res) => {
  try {
    const key = ownerKey(req);
    const task = await LaborTask.findOne({
      taskKey: req.params.taskKey,
      ownerKey: key,
    }).lean();

    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({ task });
  } catch (err) {
    console.error("[tasks] GET /:taskKey error:", err?.message);
    res.status(500).json({ error: "Failed to load task." });
  }
});

/**
 * POST /api/tasks/bulk
 * Upserts multiple tasks in one request — used by the WPF app on first sign-in
 * to migrate locally-stored tasks to the server.  Must be defined BEFORE /:taskKey.
 */
router.post("/bulk", async (req, res) => {
  try {
    const key = ownerKey(req);
    if (!key) return res.status(401).json({ error: "Unauthorized" });

    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    if (tasks.length === 0) return res.json({ upserted: 0 });

    const ops = tasks
      .filter((t) => t?.taskKey && t?.itemOfWork)
      .map((body) => ({
        updateOne: {
          filter:  { taskKey: body.taskKey, ownerKey: key },
          update: {
            $setOnInsert: { createdAtUtc: body.createdAtUtc ? new Date(body.createdAtUtc) : new Date() },
            $set: {
              ownerKey:      key,
              taskKey:       body.taskKey,
              updatedAtUtc:  new Date(),
              iD:            body.iD ?? 0,
              itemOfWork:    body.itemOfWork ?? "",
              trade:         body.trade ?? "",
              skilledLabor:  body.skilledLabor ?? 0,
              unskilledLabor: body.unskilledLabor ?? 0,
              hoursWorked:   body.hoursWorked ?? 0,
              breakHours:    body.breakHours ?? 0,
              equipmentUsed: body.equipmentUsed ?? "",
              output:        body.output ?? 0,
              outputUnit:    body.outputUnit ?? "units",
              taskStartDate: body.taskStartDate ? new Date(body.taskStartDate) : null,
              taskEndDate:   body.taskEndDate   ? new Date(body.taskEndDate)   : null,
              weather:       body.weather ?? null,
            },
          },
          upsert: true,
        },
      }));

    const result = await LaborTask.bulkWrite(ops, { ordered: false });
    res.json({ upserted: result.upsertedCount + result.modifiedCount });
  } catch (err) {
    console.error("[tasks] POST /bulk error:", err?.message);
    res.status(500).json({ error: "Bulk upload failed." });
  }
});

/**
 * POST /api/tasks
 * Creates or upserts a task. taskKey (from WPF guid) is the idempotency key.
 */
router.post("/", async (req, res) => {
  try {
    const key = ownerKey(req);
    if (!key) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    if (!body.taskKey) return res.status(400).json({ error: "taskKey is required." });
    if (!body.itemOfWork) return res.status(400).json({ error: "itemOfWork is required." });

    const now = new Date();
    const task = await LaborTask.findOneAndUpdate(
      { taskKey: body.taskKey, ownerKey: key },
      {
        $setOnInsert: { createdAtUtc: body.createdAtUtc ? new Date(body.createdAtUtc) : now },
        $set: {
          ownerKey: key,
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
    console.error("[tasks] POST / error:", err?.message);
    res.status(500).json({ error: "Failed to create task." });
  }
});

/**
 * PATCH /api/tasks/:taskKey
 * Partial update — only supplied fields are changed.
 */
router.patch("/:taskKey", async (req, res) => {
  try {
    const key = ownerKey(req);
    const { taskKey: _k, ownerKey: _o, _id, createdAtUtc: _c, ...fields } = req.body || {};

    const task = await LaborTask.findOneAndUpdate(
      { taskKey: req.params.taskKey, ownerKey: key },
      { $set: { ...fields, updatedAtUtc: new Date() } },
      { new: true, lean: true }
    );

    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({ task });
  } catch (err) {
    console.error("[tasks] PATCH /:taskKey error:", err?.message);
    res.status(500).json({ error: "Failed to update task." });
  }
});

/**
 * DELETE /api/tasks/:taskKey
 * Deletes by taskKey — owner-scoped.
 */
router.delete("/:taskKey", async (req, res) => {
  try {
    const key = ownerKey(req);
    const result = await LaborTask.deleteOne({
      taskKey: req.params.taskKey,
      ownerKey: key,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Task not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[tasks] DELETE /:taskKey error:", err?.message);
    res.status(500).json({ error: "Failed to delete task." });
  }
});

export default router;
