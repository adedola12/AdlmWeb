import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { CourseSubmission } from "../models/CourseSubmission.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import PDFDocument from "pdfkit";
import cloudinary from "../utils/cloudinaryConfig.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// list pending submissions
router.get("/submissions", async (_req, res) => {
  const items = await CourseSubmission.find({ gradeStatus: "pending" })
    .sort({ createdAt: 1 })
    .lean();
  res.json(items);
});

// grade
router.post("/submissions/:id/grade", async (req, res) => {
  const { status, feedback } = req.body || {};
  if (!["approved", "rejected"].includes(status))
    return res.status(400).json({ error: "status must be approved|rejected" });

  const s = await CourseSubmission.findById(req.params.id);
  if (!s) return res.status(404).json({ error: "Submission not found" });

  s.gradeStatus = status;
  s.feedback = feedback || "";
  s.gradedBy = req.user.email;
  s.gradedAt = new Date();
  await s.save();

  // if approved, mark module completed (idempotent)
  if (status === "approved") {
    const enr = await CourseEnrollment.findOne({
      userId: s.userId,
      courseSku: s.courseSku,
    });
    if (enr) {
      if (!enr.completedModules.includes(s.moduleCode)) {
        enr.completedModules.push(s.moduleCode);
      }

      // check completion -> issue certificate
      const course = await PaidCourse.findOne({ sku: s.courseSku }).lean();
      const total = course?.modules?.length || 0;
      const done = new Set(enr.completedModules || []);
      if (total > 0 && done.size >= total && !enr.certificateUrl) {
        const certUrl = await issueCertificate({
          studentEmail: enr.email,
          courseTitle: course.title,
          certificateTemplateUrl: course.certificateTemplateUrl,
        });
        enr.status = "completed";
        enr.certificateUrl = certUrl;
        enr.certificateIssuedAt = new Date();
      }

      await enr.save();
    }
  }

  res.json({ ok: true });
});

// --- certificate helper --- //
async function issueCertificate({
  studentEmail,
  courseTitle,
  certificateTemplateUrl,
}) {
  // generate a simple PDF in memory, then upload to Cloudinary as raw
  const buffers = [];
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.on("data", buffers.push.bind(buffers));
  const title = "Certificate of Completion";

  if (certificateTemplateUrl) {
    try {
      // draw background template (optional)
      doc.image(certificateTemplateUrl, 0, 0, {
        width: doc.page.width,
        height: doc.page.height,
      });
    } catch {}
  }

  doc.fontSize(28).text(title, { align: "center" });
  doc.moveDown(2);
  doc.fontSize(16).text(`This certifies that`, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(22).text(studentEmail, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(16).text(`has successfully completed`, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(20).text(courseTitle, { align: "center" });
  doc.moveDown(2);
  doc.fontSize(12).text(new Date().toDateString(), { align: "center" });
  doc.end();

  const pdfBuffer = await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  // upload to Cloudinary
  const uploadRes = await cloudinary.uploader.upload_stream({
    folder: "adlm/certificates",
    resource_type: "raw",
    public_id: `${Date.now()}-${studentEmail.replace(/[^a-z0-9]+/gi, "_")}`,
    format: "pdf",
  });

  const url = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "adlm/certificates",
        resource_type: "raw",
        format: "pdf",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(pdfBuffer);
  });

  return url;
}

export default router;
