import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { LaborTask } from "../models/TimeMgtTask.js";

const router = Router();

// All admin timemgt routes require auth + staff role
router.use(requireAuth);
router.use((req, res, next) => {
  if (!req.user?.isAdmin && req.user?.role !== "staff" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

/**
 * GET /admin/timemgt/analytics
 * Aggregate overview: tasks by trade, weather conditions, productivity, active users.
 */
router.get("/analytics", async (req, res) => {
  try {
    const [tradeBreakdown, weatherBreakdown, userStats, totals] = await Promise.all([
      // Tasks by trade with aggregate hours + output
      LaborTask.aggregate([
        {
          $group: {
            _id: "$trade",
            taskCount: { $sum: 1 },
            totalHours: { $sum: "$hoursWorked" },
            totalOutput: { $sum: "$output" },
            avgSkilledLabor: { $avg: "$skilledLabor" },
            avgUnskilledLabor: { $avg: "$unskilledLabor" },
          },
        },
        { $sort: { taskCount: -1 } },
        { $limit: 20 },
      ]),

      // Tasks with weather recorded — breakdown by condition
      LaborTask.aggregate([
        { $match: { "weather.condition": { $exists: true, $ne: "" } } },
        {
          $group: {
            _id: "$weather.condition",
            count: { $sum: 1 },
            avgTemp: { $avg: "$weather.temperature" },
            avgHoursWorked: { $avg: "$hoursWorked" },
            avgOutput: { $avg: "$output" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),

      // Per-user summary — most active users
      LaborTask.aggregate([
        {
          $group: {
            _id: "$ownerKey",
            taskCount: { $sum: 1 },
            totalHours: { $sum: "$hoursWorked" },
            totalOutput: { $sum: "$output" },
            lastActivity: { $max: "$updatedAtUtc" },
            trades: { $addToSet: "$trade" },
          },
        },
        { $sort: { taskCount: -1 } },
        { $limit: 50 },
      ]),

      // Overall platform totals
      LaborTask.aggregate([
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            totalHours: { $sum: "$hoursWorked" },
            totalOutput: { $sum: "$output" },
            uniqueUsers: { $addToSet: "$ownerKey" },
            tasksWithWeather: {
              $sum: { $cond: [{ $ne: ["$weather", null] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalTasks: 1,
            totalHours: 1,
            totalOutput: 1,
            uniqueUserCount: { $size: "$uniqueUsers" },
            tasksWithWeather: 1,
          },
        },
      ]),
    ]);

    res.json({
      totals: totals[0] ?? {
        totalTasks: 0,
        totalHours: 0,
        totalOutput: 0,
        uniqueUserCount: 0,
        tasksWithWeather: 0,
      },
      tradeBreakdown,
      weatherBreakdown,
      userStats,
    });
  } catch (err) {
    console.error("[admin/timemgt] analytics error:", err?.message);
    res.status(500).json({ error: "Analytics query failed." });
  }
});

/**
 * GET /admin/timemgt/tasks
 * Raw paginated task list for admin review.
 * Query: ?ownerKey=&trade=&limit=50&skip=0
 */
router.get("/tasks", async (req, res) => {
  try {
    const filter = {};
    if (req.query.ownerKey) filter.ownerKey = req.query.ownerKey;
    if (req.query.trade) filter.trade = req.query.trade;

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = parseInt(req.query.skip) || 0;

    const [tasks, total] = await Promise.all([
      LaborTask.find(filter)
        .sort({ createdAtUtc: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LaborTask.countDocuments(filter),
    ]);

    res.json({ tasks, total, limit, skip });
  } catch (err) {
    console.error("[admin/timemgt] tasks error:", err?.message);
    res.status(500).json({ error: "Query failed." });
  }
});

export default router;
