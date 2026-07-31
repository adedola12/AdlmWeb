import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";
import { Software } from "../models/Software.js";
import { PlaybackSession } from "../models/PlaybackSession.js";
import { Quiz, QuizAttempt } from "../models/Quiz.js";
import {
  signPlaybackCookies,
  playbackCookieOptions,
  cdnUrl,
} from "../utils/cloudfrontSign.js";
import { presignArchiveUrl } from "../utils/awsS3.js";

const router = express.Router();
router.use(requireAuth);

// A stream is "live" if we heard from it recently. Heartbeats land every 30s,
// so 90s tolerates one dropped beat before the seat is released — otherwise a
// student who closes the lid is locked out of their own account for minutes.
const LIVE_WINDOW_MS = 90 * 1000;
const MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.COURSE_MAX_CONCURRENT_STREAMS || 2) || 2,
);

function liveSince() {
  return new Date(Date.now() - LIVE_WINDOW_MS);
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || "";
}

/** Short handle burned into the watermark and quotable in a takedown. */
function makeSessionRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function accessMeta(accessStartedAt, accessExpiresAt) {
  const started = accessStartedAt ? new Date(accessStartedAt) : null;
  const expires = accessExpiresAt ? new Date(accessExpiresAt) : null;

  if (!expires || Number.isNaN(expires.getTime())) {
    return {
      startedAt: toIso(started),
      expiresAt: null,
      daysLeft: null,
      isExpired: false,
      label: "Open access",
    };
  }

  const endOfDay = new Date(expires);
  endOfDay.setHours(23, 59, 59, 999);

  const diffMs = endOfDay.getTime() - Date.now();
  const isExpired = diffMs < 0;
  const daysLeft = isExpired ? 0 : Math.max(Math.ceil(diffMs / 86400000), 0);

  return {
    startedAt: toIso(started),
    expiresAt: toIso(expires),
    daysLeft,
    isExpired,
    label: isExpired
      ? "Access expired"
      : daysLeft === 0
        ? "Access ends today"
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
  };
}

function latestSubmission(list = []) {
  return [...list].sort((a, b) => {
    const ax = new Date(a?.createdAt || 0).getTime();
    const bx = new Date(b?.createdAt || 0).getTime();
    return bx - ax;
  })[0] || null;
}

function buildModuleSubmissions(course, enrollment, submissionsByKey) {
  const completed = new Set(enrollment?.completedModules || []);
  return (course?.modules || []).map((module) => {
    const key = `${enrollment.courseSku}:${module.code}`;
    const submissions = submissionsByKey[key] || [];
    const latest = latestSubmission(submissions);

    return {
      moduleCode: module.code,
      moduleTitle: module.title,
      requiresSubmission: !!module.requiresSubmission,
      submissions,
      latestSubmission: latest,
      completed: completed.has(module.code),
      videoUrl: module.videoUrl || "",
      instructions: module.instructions || "",
      assignmentPrompt: module.assignmentPrompt || "",
      durationSec: Number(module.durationSec || 0) || 0,
    };
  });
}

function buildSummary(course, moduleSubmissions) {
  const totalModules = Array.isArray(course?.modules) ? course.modules.length : 0;
  const completedModules = moduleSubmissions.filter((item) => item.completed).length;
  const requiredAssignments = moduleSubmissions.filter((item) => item.requiresSubmission);
  const submittedAssignments = requiredAssignments.filter(
    (item) => (item.submissions || []).length > 0,
  );
  const pendingAssignments = requiredAssignments.filter(
    (item) => item.latestSubmission?.gradeStatus === "pending",
  );
  const approvedAssignments = requiredAssignments.filter(
    (item) => item.latestSubmission?.gradeStatus === "approved",
  );
  const rejectedAssignments = requiredAssignments.filter(
    (item) => item.latestSubmission?.gradeStatus === "rejected",
  );

  const progress = totalModules
    ? Math.round((completedModules / totalModules) * 100)
    : 0;

  return {
    totalModules,
    completedModules,
    requiredAssignments: requiredAssignments.length,
    submittedAssignments: submittedAssignments.length,
    pendingAssignments: pendingAssignments.length,
    approvedAssignments: approvedAssignments.length,
    rejectedAssignments: rejectedAssignments.length,
    progress,
  };
}

async function loadCourseContext(userId, skus) {
  const [user, courses, products, submissions] = await Promise.all([
    User.findById(userId).select("entitlements").lean(),
    PaidCourse.find({ sku: { $in: skus } }).lean(),
    Product.find({ isCourse: true, courseSku: { $in: skus } })
      .select("key name billingInterval courseSku thumbnailUrl blurb")
      .lean(),
    CourseSubmission.find({ userId, courseSku: { $in: skus } }).lean(),
  ]);

  const coursesBySku = Object.fromEntries(courses.map((course) => [course.sku, course]));
  const productBySku = Object.fromEntries(products.map((product) => [product.courseSku, product]));
  const entitlementsByKey = Object.fromEntries(
    (user?.entitlements || []).map((entitlement) => [
      String(entitlement?.productKey || "").toLowerCase(),
      entitlement,
    ]),
  );

  const submissionsByKey = submissions.reduce((acc, submission) => {
    const key = `${submission.courseSku}:${submission.moduleCode}`;
    (acc[key] ||= []).push(submission);
    return acc;
  }, {});

  // Hydrate softwares attached to these courses. We do one batched query
  // for all software ids referenced by the user's enrolled courses.
  const allSoftwareIds = new Set();
  for (const c of courses) {
    for (const id of c.softwareIds || []) allSoftwareIds.add(String(id));
  }
  const softwares = allSoftwareIds.size
    ? await Software.find({ _id: { $in: [...allSoftwareIds] }, isActive: true }).lean()
    : [];
  const softwareById = Object.fromEntries(softwares.map((s) => [String(s._id), s]));

  return { coursesBySku, productBySku, entitlementsByKey, submissionsByKey, softwareById };
}

function buildCourseResponse(enrollment, context) {
  const fallbackCourse = {
    sku: enrollment.courseSku,
    title: enrollment.courseSku,
    blurb: "",
    thumbnailUrl: "",
    onboardingVideoUrl: "",
    classroomJoinUrl: "",
    classroomProvider: "google_classroom",
    classroomCourseId: "",
    classroomNotes: "",
    modules: [],
  };

  const courseRaw = context.coursesBySku[enrollment.courseSku] || fallbackCourse;
  const softwares = (courseRaw.softwareIds || [])
    .map((id) => context.softwareById?.[String(id)])
    .filter(Boolean);
  const course = { ...courseRaw, softwares };
  const product = context.productBySku[enrollment.courseSku] || null;
  const entitlement = product
    ? context.entitlementsByKey[String(product.key || "").toLowerCase()] || null
    : null;

  const startedAt = enrollment.accessStartedAt || enrollment.createdAt || null;
  const expiresAt = enrollment.accessExpiresAt || entitlement?.expiresAt || null;
  const moduleSubmissions = buildModuleSubmissions(course, enrollment, context.submissionsByKey);
  const summary = buildSummary(course, moduleSubmissions);

  return {
    enrollment: {
      ...enrollment,
      accessStartedAt: toIso(startedAt),
      accessExpiresAt: toIso(expiresAt),
      lastProgressAt: toIso(enrollment.lastProgressAt),
      classroomLastSyncedAt: toIso(enrollment.classroomLastSyncedAt),
    },
    course,
    product,
    progress: summary.progress,
    summary,
    access: accessMeta(startedAt, expiresAt),
    classroom: {
      provider: course.classroomProvider || "google_classroom",
      joinUrl: course.classroomJoinUrl || "",
      courseId: course.classroomCourseId || "",
      notes: course.classroomNotes || "",
      lastSyncedAt: toIso(enrollment.classroomLastSyncedAt),
      syncEnabled: Boolean(course.classroomCourseId),
    },
    moduleSubmissions,
  };
}

router.get("/", async (req, res) => {
  const enrollments = await CourseEnrollment.find({
    userId: req.user._id,
  }).lean();

  if (!enrollments.length) return res.json([]);

  const skus = [...new Set(enrollments.map((item) => item.courseSku).filter(Boolean))];
  const context = await loadCourseContext(req.user._id, skus);
  const out = enrollments.map((enrollment) => buildCourseResponse(enrollment, context));
  res.json(out);
});

router.post("/:sku/submit", async (req, res) => {
  const { moduleCode, fileUrl, note } = req.body || {};
  if (!moduleCode || !fileUrl) {
    return res.status(400).json({ error: "moduleCode and fileUrl required" });
  }

  const course = await PaidCourse.findOne({ sku: req.params.sku }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const isModule = (course.modules || []).some((module) => module.code === moduleCode);
  if (!isModule) return res.status(400).json({ error: "Invalid module" });

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: req.params.sku,
  });
  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  const doc = await CourseSubmission.create({
    userId: req.user._id,
    email: req.user.email,
    courseSku: req.params.sku,
    moduleCode,
    fileUrl,
    note: note || "",
    gradeStatus: "pending",
  });

  enrollment.lastProgressAt = new Date();
  await enrollment.save();

  res.json(doc);
});

router.post("/:sku/complete", async (req, res) => {
  const { moduleCode } = req.body || {};
  if (!moduleCode) {
    return res.status(400).json({ error: "moduleCode required" });
  }

  const course = await PaidCourse.findOne({ sku: req.params.sku }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const isModule = (course.modules || []).some((module) => module.code === moduleCode);
  if (!isModule) return res.status(400).json({ error: "Invalid module" });

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: req.params.sku,
  });
  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  enrollment.completedModules = Array.isArray(enrollment.completedModules)
    ? enrollment.completedModules
    : [];
  if (!enrollment.completedModules.includes(moduleCode)) {
    enrollment.completedModules.push(moduleCode);
  }
  enrollment.lastProgressAt = new Date();

  await enrollment.save();
  res.json({ ok: true, completedModules: enrollment.completedModules });
});

router.get("/:sku", async (req, res) => {
  const sku = req.params.sku;
  const course = await PaidCourse.findOne({ sku }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: sku,
  }).lean();
  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  const context = await loadCourseContext(req.user._id, [sku]);
  const response = buildCourseResponse(enrollment, {
    ...context,
    coursesBySku: { ...context.coursesBySku, [sku]: course },
  });

  res.json(response);
});

/**
 * GET /me/courses/:sku/certificate-template
 * Proxies the certificate PDF template so the client can load it
 * without CORS issues (R2 / Cloudinary may block cross-origin fetch).
 */
router.get("/:sku/certificate-template", async (req, res) => {
  try {
    const sku = req.params.sku;

    const enrollment = await CourseEnrollment.findOne({
      userId: req.user._id,
      courseSku: sku,
    }).lean();
    if (!enrollment) return res.status(403).json({ error: "Not enrolled" });
    if (enrollment.status !== "completed") {
      return res.status(403).json({ error: "Course not completed" });
    }

    const course = await PaidCourse.findOne({ sku }).lean();
    if (!course?.certificateTemplateUrl) {
      return res.status(404).json({ error: "No certificate template" });
    }

    // Fetch the PDF from R2/Cloudinary and pipe it to the client
    const upstream = await fetch(course.certificateTemplateUrl);
    if (!upstream.ok) {
      return res.status(502).json({ error: "Failed to fetch certificate template" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || "Certificate proxy failed" });
    }
  }
});

/**
 * POST /me/courses/:sku/playback/start
 *
 * Claims a streaming seat. Returns the session ref that the player burns into
 * the watermark, so any capture of the video carries a handle that resolves
 * back to this row.
 *
 * 409 when the account already has MAX_CONCURRENT live streams — that is the
 * lever against one login being shared, which is a far more common leak than
 * screen recording.
 */
router.post("/:sku/playback/start", express.json(), async (req, res) => {
  const sku = req.params.sku;
  const moduleCode = String(req.body?.moduleCode || "").trim();

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: sku,
  }).lean();
  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  // Re-entering the SAME lecture is a reconnect, not a second stream. A page
  // reload would otherwise claim a fresh seat while the previous one sat live
  // for another 90 seconds, so two refreshes locked a student out of the
  // lecture they were already watching.
  await PlaybackSession.updateMany(
    {
      userId: req.user._id,
      courseSku: sku,
      moduleCode,
      endedAt: null,
    },
    { $set: { endedAt: new Date() } },
  );

  const live = await PlaybackSession.find({
    userId: req.user._id,
    endedAt: null,
    lastSeenAt: { $gte: liveSince() },
  })
    .sort({ lastSeenAt: -1 })
    .lean();

  if (live.length >= MAX_CONCURRENT) {
    return res.status(409).json({
      error: "Too many active streams",
      limit: MAX_CONCURRENT,
      active: live.map((s) => ({
        sessionRef: s.sessionRef,
        moduleCode: s.moduleCode,
        startedAt: toIso(s.startedAt),
        lastSeenAt: toIso(s.lastSeenAt),
      })),
    });
  }

  const session = await PlaybackSession.create({
    userId: req.user._id,
    email: req.user.email || "",
    courseSku: sku,
    moduleCode,
    sessionRef: makeSessionRef(),
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
  });

  // The playback URL is only ever handed out here, so a stream cannot be
  // obtained without also claiming a concurrency seat and leaving an audit row.
  let playbackUrl = "";
  let playbackExpiresAt = null;
  // "hls" is the real delivery path. "archive" means the student is pulling a
  // multi-gigabyte master straight from S3 with no CDN and no bitrate ladder —
  // watchable, but slow and stuttery on a Nigerian connection, and previously
  // indistinguishable from working playback from the outside.
  let playbackMode = "none";
  const course = await PaidCourse.findOne({ sku }).select("modules").lean();
  const module = (course?.modules || []).find((m) => m.code === moduleCode);

  if (module?.hlsKey) {
    try {
      const prefix = module.hlsKey.replace(/index\.m3u8$/, "");
      const { cookies, expiresAt } = signPlaybackCookies({
        keyPrefix: prefix,
        ip: clientIp(req),
      });
      for (const [name, value] of Object.entries(cookies)) {
        res.cookie(name, value, playbackCookieOptions(expiresAt));
      }
      playbackUrl = cdnUrl(module.hlsKey);
      playbackExpiresAt = toIso(expiresAt);
      playbackMode = "hls";
    } catch (err) {
      // CloudFront not wired up yet — fall back to whatever videoUrl the
      // module already carries rather than failing the whole request.
      // Loud, because the fallback below still plays: the only symptom an
      // operator sees is students reporting that video is slow.
      console.warn(
        `[playback] DEGRADED for ${sku}/${moduleCode} — CloudFront signing failed ` +
          `(${err.message}). Serving the raw master from S3 instead of HLS. ` +
          `See docs/COURSE_VIDEO_PIPELINE.md §5.`,
      );
    }
  }

  // No HLS yet, but the master is archived: hand out a short-lived direct link
  // so a freshly ingested recording is watchable before the delivery pipeline
  // exists. Superseded automatically once hlsKey is set.
  if (!playbackUrl && module?.sourceKey) {
    try {
      playbackUrl = await presignArchiveUrl(module.sourceKey);
      playbackExpiresAt = toIso(new Date(Date.now() + 2 * 60 * 60 * 1000));
      playbackMode = "archive";
    } catch (err) {
      console.warn("[playback] could not presign archive object:", err.message);
    }
  }

  res.json({
    sessionId: String(session._id),
    sessionRef: session.sessionRef,
    heartbeatSec: 30,
    playbackUrl,
    playbackExpiresAt,
    playbackMode,
  });
});

/** Keeps the seat alive and records how far the student has actually watched. */
router.post("/:sku/playback/ping", express.json(), async (req, res) => {
  const sessionId = String(req.body?.sessionId || "");
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const positionSec = Math.max(0, Number(req.body?.positionSec || 0) || 0);
  const watchedDeltaSec = Math.min(
    120, // a heartbeat can never be worth more than two minutes of watching
    Math.max(0, Number(req.body?.watchedDeltaSec || 0) || 0),
  );

  const session = await PlaybackSession.findOneAndUpdate(
    { _id: sessionId, userId: req.user._id, endedAt: null },
    {
      $set: { lastSeenAt: new Date(), positionSec },
      $inc: { watchedSec: watchedDeltaSec },
    },
    { new: true },
  );
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Watching counts as progress on the enrollment, so the "last active" figure
  // reflects actual viewing rather than only assignment uploads.
  await CourseEnrollment.updateOne(
    { userId: req.user._id, courseSku: req.params.sku },
    { $set: { lastProgressAt: new Date() } },
  );

  res.json({ ok: true });
});

/** Releases the seat. Best-effort — a dropped heartbeat frees it anyway. */
router.post("/:sku/playback/stop", express.json(), async (req, res) => {
  const sessionId = String(req.body?.sessionId || "");
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  await PlaybackSession.updateOne(
    { _id: sessionId, userId: req.user._id, endedAt: null },
    { $set: { endedAt: new Date(), lastSeenAt: new Date() } },
  );
  res.json({ ok: true });
});

/**
 * GET /me/courses/:sku/quiz/:moduleCode
 *
 * The quiz as the student may see it: correct answers and explanations are
 * stripped, so the answer key never leaves the server.
 */
router.get("/:sku/quiz/:moduleCode", async (req, res) => {
  const { sku, moduleCode } = req.params;

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: sku,
  }).lean();
  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  const quiz = await Quiz.findOne({
    courseSku: sku,
    moduleCode,
    isPublished: true,
  }).lean();
  if (!quiz) return res.status(404).json({ error: "No quiz for this module" });

  const attempts = await QuizAttempt.find({
    userId: req.user._id,
    courseSku: sku,
    moduleCode,
  })
    .sort({ submittedAt: -1 })
    .lean();

  res.json({
    quiz: {
      _id: quiz._id,
      title: quiz.title,
      intro: quiz.intro,
      passMark: quiz.passMark,
      maxAttempts: quiz.maxAttempts,
      questions: (quiz.questions || []).map((q) => ({
        _id: q._id,
        prompt: q.prompt,
        options: q.options,
      })),
    },
    attempts: attempts.map((a) => ({
      score: a.score,
      passed: a.passed,
      correctCount: a.correctCount,
      totalQuestions: a.totalQuestions,
      submittedAt: toIso(a.submittedAt),
    })),
    attemptsLeft: quiz.maxAttempts
      ? Math.max(0, quiz.maxAttempts - attempts.length)
      : null,
    best: attempts.reduce((best, a) => Math.max(best, a.score || 0), 0),
  });
});

/** POST /me/courses/:sku/quiz/:moduleCode — grade and record an attempt. */
router.post("/:sku/quiz/:moduleCode", express.json(), async (req, res) => {
  const { sku, moduleCode } = req.params;
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: sku,
  }).lean();
  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  const quiz = await Quiz.findOne({
    courseSku: sku,
    moduleCode,
    isPublished: true,
  }).lean();
  if (!quiz) return res.status(404).json({ error: "No quiz for this module" });

  if (quiz.maxAttempts) {
    const used = await QuizAttempt.countDocuments({
      userId: req.user._id,
      courseSku: sku,
      moduleCode,
    });
    if (used >= quiz.maxAttempts) {
      return res.status(409).json({ error: "No attempts remaining" });
    }
  }

  const questions = quiz.questions || [];
  const results = questions.map((q, i) => {
    const given = Number(answers[i]);
    const correct = Number.isInteger(given) && given === q.correctIndex;
    return {
      questionId: String(q._id),
      correct,
      correctIndex: q.correctIndex,
      explanation: q.explanation || "",
    };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const score = questions.length
    ? Math.round((correctCount / questions.length) * 100)
    : 0;
  const passed = score >= (quiz.passMark || 0);

  await QuizAttempt.create({
    userId: req.user._id,
    email: req.user.email || "",
    quizId: quiz._id,
    courseSku: sku,
    moduleCode,
    answers: answers.map((a) => Number(a)),
    score,
    correctCount,
    totalQuestions: questions.length,
    passed,
  });

  await CourseEnrollment.updateOne(
    { userId: req.user._id, courseSku: sku },
    { $set: { lastProgressAt: new Date() } },
  );

  res.json({ score, passed, correctCount, totalQuestions: questions.length, results });
});

export default router;
