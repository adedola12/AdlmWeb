import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";

const router = express.Router();
router.use(requireAuth);

// GET /me/courses  -> list enrollments w/ course info and progress
router.get("/", async (req, res) => {
  const enrollments = await CourseEnrollment.find({
    userId: req.user._id,
  }).lean();
  const skus = [...new Set(enrollments.map((e) => e.courseSku))];
  const courses = await PaidCourse.find({ sku: { $in: skus } }).lean();
  const bySku = Object.fromEntries(courses.map((c) => [c.sku, c]));

  // attach submissions + progress
  const subs = await CourseSubmission.find({
    userId: req.user._id,
    courseSku: { $in: skus },
  }).lean();
  const subsByKey = subs.reduce((acc, s) => {
    const k = `${s.courseSku}:${s.moduleCode}`;
    acc[k] = acc[k] || [];
    acc[k].push(s);
    return acc;
  }, {});

  const out = enrollments.map((e) => {
    const course = bySku[e.courseSku] || {
      sku: e.courseSku,
      title: e.courseSku,
      blurb: "",
      thumbnailUrl: "",
      onboardingVideoUrl: "",
      classroomJoinUrl: "",
      modules: [],
    };

    const totalModules = course?.modules?.length || 0;
    const completed = new Set(e.completedModules || []);
    const completedCount = completed.size;
    const progress = totalModules
      ? Math.round((completedCount / totalModules) * 100)
      : 0;

    // map submissions grouped by module
    const moduleSubmissions = (course?.modules || []).map((m) => ({
      moduleCode: m.code,
      moduleTitle: m.title,
      requiresSubmission: !!m.requiresSubmission,
      submissions: subsByKey[`${e.courseSku}:${m.code}`] || [],
      completed: completed.has(m.code),
    }));

    return {
      enrollment: e,
      course,
      progress,
      moduleSubmissions,
    };
  });

  res.json(out);
});

// POST /me/courses/:sku/submit
// body: { moduleCode, fileUrl, note }
router.post("/:sku/submit", async (req, res) => {
  const { moduleCode, fileUrl, note } = req.body || {};
  if (!moduleCode || !fileUrl)
    return res.status(400).json({ error: "moduleCode and fileUrl required" });

  const course = await PaidCourse.findOne({ sku: req.params.sku }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const isModule = (course.modules || []).some((m) => m.code === moduleCode);
  if (!isModule) return res.status(400).json({ error: "Invalid module" });

  const enr = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: req.params.sku,
  });
  if (!enr) return res.status(403).json({ error: "Not enrolled" });

  const doc = await CourseSubmission.create({
    userId: req.user._id,
    email: req.user.email,
    courseSku: req.params.sku,
    moduleCode,
    fileUrl,
    note: note || "",
    gradeStatus: "pending",
  });

  res.json(doc);
});

// server/routes/me.courses.js (same file where /:sku/submit exists)
// POST /me/courses/:sku/complete  { moduleCode }
router.post("/:sku/complete", async (req, res) => {
  const { moduleCode } = req.body || {};
  if (!moduleCode)
    return res.status(400).json({ error: "moduleCode required" });

  const course = await PaidCourse.findOne({ sku: req.params.sku }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const isModule = (course.modules || []).some((m) => m.code === moduleCode);
  if (!isModule) return res.status(400).json({ error: "Invalid module" });

  const enr = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: req.params.sku,
  });
  if (!enr) return res.status(403).json({ error: "Not enrolled" });

  if (!enr.completedModules.includes(moduleCode)) {
    enr.completedModules.push(moduleCode);
  }

  // if all modules done and not yet certified, issue certificate (same logic as grading route)
  const total = course?.modules?.length || 0;
  if (
    total > 0 &&
    new Set(enr.completedModules).size >= total &&
    !enr.certificateUrl
  ) {
    // optional: call your issueCertificate helper used in admin grading
    // const certUrl = await issueCertificate({ ... });
    // enr.status = "completed";
    // enr.certificateUrl = certUrl;
    // enr.certificateIssuedAt = new Date();
  }

  await enr.save();
  res.json({ ok: true });
});


// GET /me/courses/:sku  -> single course for the logged-in user
router.get("/me/courses/:sku", async (req, res) => {
  const sku = req.params.sku;
  const course = await PaidCourse.findOne({ sku, isPublished: true }).lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const enrollment = await CourseEnrollment.findOne({
    userId: req.user._id,
    courseSku: sku,
  }).lean();

  if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

  // build module submissions view (same shape you use in Dashboard)
  const subs = await CourseSubmission.find({
    userId: req.user._id,
    courseSku: sku,
  }).lean();

  const submissionsByModule = subs.reduce((m, s) => {
    (m[s.moduleCode] ||= []).push(s);
    return m;
  }, {});

  const moduleSubmissions = (course.modules || []).map((m) => ({
    moduleCode: m.code,
    moduleTitle: m.title,
    requiresSubmission: !!m.requiresSubmission,
    completed: (enrollment.completedModules || []).includes(m.code),
    submissions: submissionsByModule[m.code] || [],
  }));

  const total = (course.modules || []).length || 0;
  const done = (enrollment.completedModules || []).length || 0;
  const progress = total ? Math.round((done / total) * 100) : 0;

  res.json({ course, enrollment, progress, moduleSubmissions });
});
export default router;
