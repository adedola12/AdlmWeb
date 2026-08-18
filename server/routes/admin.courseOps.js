/**
 * Admin operations for running a course on the platform rather than in Google
 * Classroom: quiz authoring, and the cockpit that answers "how is this cohort
 * actually doing" without opening four different screens.
 */
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";
import { PlaybackSession } from "../models/PlaybackSession.js";
import { Quiz, QuizAttempt } from "../models/Quiz.js";

function requireAdmin(req, res, next) {
  // Read-only, placeholder-masked demo sessions (server/middleware/demoMode.js)
  // may view admin screens; every mutating method is already blocked upstream.
  if (req.demoMode) return next();
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin, express.json());

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ── quizzes ─────────────────────────────────────────────────────────────────

router.get("/quizzes", async (req, res) => {
  const filter = {};
  if (req.query.sku) filter.courseSku = String(req.query.sku);
  const quizzes = await Quiz.find(filter).sort({ moduleCode: 1 }).lean();

  // Attempt counts make it obvious which quizzes students actually reached.
  const counts = await QuizAttempt.aggregate([
    ...(filter.courseSku ? [{ $match: { courseSku: filter.courseSku } }] : []),
    {
      $group: {
        _id: { courseSku: "$courseSku", moduleCode: "$moduleCode" },
        attempts: { $sum: 1 },
        avgScore: { $avg: "$score" },
        passed: { $sum: { $cond: ["$passed", 1, 0] } },
      },
    },
  ]);
  const statsByModule = Object.fromEntries(
    counts.map((c) => [`${c._id.courseSku}:${c._id.moduleCode}`, c]),
  );

  res.json(
    quizzes.map((q) => {
      const stats = statsByModule[`${q.courseSku}:${q.moduleCode}`];
      return {
        ...q,
        stats: {
          attempts: stats?.attempts || 0,
          passed: stats?.passed || 0,
          avgScore: Math.round(stats?.avgScore || 0),
        },
      };
    }),
  );
});

function sanitizeQuiz(body = {}) {
  const questions = Array.isArray(body.questions) ? body.questions : [];
  return {
    courseSku: String(body.courseSku || "").trim(),
    moduleCode: String(body.moduleCode || "").trim(),
    title: String(body.title || "").trim(),
    intro: String(body.intro || "").trim(),
    passMark: Math.min(100, Math.max(0, Number(body.passMark ?? 60) || 0)),
    maxAttempts: Math.max(0, Number(body.maxAttempts ?? 0) || 0),
    isPublished: body.isPublished === true,
    questions: questions.map((q) => ({
      prompt: String(q?.prompt || "").trim(),
      options: (Array.isArray(q?.options) ? q.options : [])
        .map((o) => String(o || "").trim())
        .filter(Boolean),
      correctIndex: Math.max(0, Number(q?.correctIndex ?? 0) || 0),
      explanation: String(q?.explanation || "").trim(),
    })),
  };
}

router.post("/quizzes", async (req, res) => {
  const payload = sanitizeQuiz(req.body);
  if (!payload.courseSku || !payload.moduleCode) {
    return res.status(400).json({ error: "courseSku and moduleCode required" });
  }
  try {
    // One quiz per module — upsert rather than erroring on a second create.
    const quiz = await Quiz.findOneAndUpdate(
      { courseSku: payload.courseSku, moduleCode: payload.moduleCode },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json(quiz);
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not save quiz" });
  }
});

router.patch("/quizzes/:id", async (req, res) => {
  const payload = sanitizeQuiz(req.body);
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!quiz) return res.status(404).json({ error: "Not found" });
  res.json(quiz);
});

router.delete("/quizzes/:id", async (req, res) => {
  const out = await Quiz.findByIdAndDelete(req.params.id);
  if (!out) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ── cockpit ─────────────────────────────────────────────────────────────────

/**
 * GET /admin/course-ops/:sku/cockpit
 *
 * One row per enrolled student, joining the four things that were previously
 * scattered: how much they have actually watched (from playback heartbeats,
 * not the self-declared "mark complete"), what they have submitted, how they
 * scored, and when they were last seen.
 */
router.get("/:sku/cockpit", async (req, res) => {
  const sku = req.params.sku;

  const course = await PaidCourse.findOne({ sku }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const enrollments = await CourseEnrollment.find({ courseSku: sku })
    .populate("userId", "email name")
    .lean();
  if (!enrollments.length) {
    return res.json({ course: { sku, title: course.title }, modules: [], students: [] });
  }

  const userIds = enrollments.map((e) => e.userId?._id || e.userId).filter(Boolean);

  const [submissions, attempts, watch] = await Promise.all([
    CourseSubmission.find({ courseSku: sku, userId: { $in: userIds } }).lean(),
    QuizAttempt.find({ courseSku: sku, userId: { $in: userIds } }).lean(),
    PlaybackSession.aggregate([
      { $match: { courseSku: sku, userId: { $in: userIds } } },
      {
        $group: {
          _id: { userId: "$userId", moduleCode: "$moduleCode" },
          watchedSec: { $sum: "$watchedSec" },
          lastSeenAt: { $max: "$lastSeenAt" },
          sessions: { $sum: 1 },
        },
      },
    ]),
  ]);

  const key = (userId, moduleCode) => `${String(userId)}:${moduleCode}`;

  const watchByKey = new Map(
    watch.map((w) => [key(w._id.userId, w._id.moduleCode), w]),
  );
  const submissionsByUser = new Map();
  for (const s of submissions) {
    const list = submissionsByUser.get(String(s.userId)) || [];
    list.push(s);
    submissionsByUser.set(String(s.userId), list);
  }
  const attemptsByUser = new Map();
  for (const a of attempts) {
    const list = attemptsByUser.get(String(a.userId)) || [];
    list.push(a);
    attemptsByUser.set(String(a.userId), list);
  }

  const modules = (course.modules || []).map((m) => ({
    code: m.code,
    title: m.title,
    requiresSubmission: !!m.requiresSubmission,
    hasVideo: Boolean(m.hlsKey || m.videoUrl),
  }));
  const assignmentModules = modules.filter((m) => m.requiresSubmission);

  const students = enrollments.map((enrollment) => {
    const userId = String(enrollment.userId?._id || enrollment.userId || "");
    const mySubs = submissionsByUser.get(userId) || [];
    const myAttempts = attemptsByUser.get(userId) || [];
    const completed = new Set(enrollment.completedModules || []);

    const perModule = modules.map((m) => {
      const w = watchByKey.get(key(userId, m.code));
      return {
        code: m.code,
        watchedSec: Math.round(w?.watchedSec || 0),
        sessions: w?.sessions || 0,
        completed: completed.has(m.code),
      };
    });

    const watchedSec = perModule.reduce((sum, m) => sum + m.watchedSec, 0);
    const started = perModule.filter((m) => m.watchedSec > 0).length;

    const graded = mySubs.filter((s) => s.gradeStatus && s.gradeStatus !== "pending");
    const bestByModule = new Map();
    for (const a of myAttempts) {
      const prev = bestByModule.get(a.moduleCode);
      if (!prev || (a.score || 0) > (prev.score || 0)) bestByModule.set(a.moduleCode, a);
    }

    const lastSeen = perModule.reduce((latest, m) => {
      const w = watchByKey.get(key(userId, m.code));
      const at = w?.lastSeenAt ? new Date(w.lastSeenAt).getTime() : 0;
      return Math.max(latest, at);
    }, enrollment.lastProgressAt ? new Date(enrollment.lastProgressAt).getTime() : 0);

    return {
      userId,
      email: enrollment.userId?.email || enrollment.email || "",
      name: enrollment.userId?.name || "",
      status: enrollment.status,
      accessExpiresAt: toIso(enrollment.accessExpiresAt),
      lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
      modulesTotal: modules.length,
      modulesStarted: started,
      modulesCompleted: perModule.filter((m) => m.completed).length,
      watchedSec,
      assignmentsRequired: assignmentModules.length,
      assignmentsSubmitted: new Set(mySubs.map((s) => s.moduleCode)).size,
      assignmentsGraded: new Set(graded.map((s) => s.moduleCode)).size,
      quizzesTaken: bestByModule.size,
      quizAvgScore: bestByModule.size
        ? Math.round(
            [...bestByModule.values()].reduce((sum, a) => sum + (a.score || 0), 0) /
              bestByModule.size,
          )
        : null,
      perModule,
    };
  });

  // Most-stalled first: that is the list worth acting on.
  students.sort((a, b) => a.modulesStarted - b.modulesStarted);

  res.json({ course: { sku, title: course.title }, modules, students });
});

export default router;
