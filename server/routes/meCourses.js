import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";

const router = express.Router();
router.use(requireAuth);

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

  return { coursesBySku, productBySku, entitlementsByKey, submissionsByKey };
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

  const course = context.coursesBySku[enrollment.courseSku] || fallbackCourse;
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

export default router;
