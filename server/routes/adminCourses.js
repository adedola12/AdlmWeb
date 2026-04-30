import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { PaidCourse } from "../models/PaidCourse.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function sanitizeCourseBody(body = {}, { partial = false } = {}) {
  const out = {};
  const assign = (key, value) => {
    if (!partial || value !== undefined) out[key] = value;
  };
  const stringField = (key) =>
    hasOwn(body, key) ? String(body[key] || "").trim() : undefined;

  assign("sku", stringField("sku"));
  assign("title", stringField("title"));
  assign("blurb", stringField("blurb"));
  assign("description", stringField("description"));
  assign("thumbnailUrl", stringField("thumbnailUrl"));
  assign("onboardingVideoUrl", stringField("onboardingVideoUrl"));
  assign("classroomJoinUrl", stringField("classroomJoinUrl"));
  assign(
    "classroomProvider",
    hasOwn(body, "classroomProvider")
      ? String(body.classroomProvider || "google_classroom").trim() === "other"
        ? "other"
        : "google_classroom"
      : undefined,
  );
  assign("classroomCourseId", stringField("classroomCourseId"));
  assign("classroomNotes", stringField("classroomNotes"));
  assign("certificateTemplateUrl", stringField("certificateTemplateUrl"));
  assign(
    "isPublished",
    hasOwn(body, "isPublished") ? body.isPublished !== false : partial ? undefined : true,
  );
  assign(
    "sort",
    hasOwn(body, "sort") ? Number(body.sort ?? 0) || 0 : partial ? undefined : 0,
  );
  assign(
    "modules",
    hasOwn(body, "modules")
      ? Array.isArray(body.modules)
        ? body.modules
        : []
      : partial
        ? undefined
        : [],
  );

  // softwareIds: validate/limit to 6, drop anything that doesn't look like
  // a Mongo ObjectId hex string. Storing the array even when empty lets
  // an admin clear all softwares from a course.
  if (hasOwn(body, "softwareIds")) {
    const arr = Array.isArray(body.softwareIds) ? body.softwareIds : [];
    const cleaned = arr
      .map((v) => String(v || "").trim())
      .filter((v) => /^[0-9a-fA-F]{24}$/.test(v))
      .slice(0, 6);
    out.softwareIds = cleaned;
  } else if (!partial) {
    out.softwareIds = [];
  }

  return out;
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/", async (_req, res) => {
  const items = await PaidCourse.find({})
    .sort({ sort: -1, createdAt: -1 })
    .lean();
  res.json(items);
});

router.get("/:sku", async (req, res) => {
  const sku = req.params.sku;
  const course = await PaidCourse.findOne({ sku }).lean();
  if (!course) return res.status(404).json({ error: "Not found" });
  res.json(course);
});

router.post("/", async (req, res) => {
  const payload = sanitizeCourseBody(req.body || {});
  if (!payload.sku || !payload.title) {
    return res.status(400).json({ error: "sku and title required" });
  }

  const exists = await PaidCourse.findOne({ sku: payload.sku });
  if (exists) return res.status(409).json({ error: "sku exists" });

  const doc = await PaidCourse.create(payload);
  res.json(doc);
});

router.patch("/:sku", async (req, res) => {
  const payload = sanitizeCourseBody(req.body || {}, { partial: true });
  const course = await PaidCourse.findOneAndUpdate(
    { sku: req.params.sku },
    payload,
    { new: true },
  );
  if (!course) return res.status(404).json({ error: "Not found" });
  res.json(course);
});

router.delete("/:sku", async (req, res) => {
  const out = await PaidCourse.findOneAndDelete({ sku: req.params.sku });
  if (!out) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
