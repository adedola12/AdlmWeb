// Admin → sample models. Adding the Revit and IFC files that courses and
// software demos are built on.
//
// THE UPLOAD IS TWO STEPS, ON PURPOSE
//
// A Revit model is hundreds of megabytes. Posting it through the API would mean
// buffering it in the Lambda, so the browser uploads straight to storage with a
// signed PUT and then tells us it landed:
//
//   POST /admin/demo-models            create the row, get an upload URL
//   PUT  <uploadUrl>                   the browser, straight to storage
//   POST /admin/demo-models/:id/done   we check it is really there
//
// The row exists between steps two and three, unpublished, so a half-finished
// upload can be seen and cleared rather than vanishing. `done` calls headFile
// before recording the size: a browser that says it uploaded and did not must
// not produce a model a student then cannot download.
//
// Permission is `learn`, the same as courses and videos — the people who make a
// course are the people who add its model. A separate key would mean granting
// two things to do one job.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { DemoModel } from "../models/DemoModel.js";
import { PaidCourse } from "../models/PaidCourse.js";
import {
  contentTypeFor,
  formatFor,
  MODEL_ACCESS,
  MODEL_PURPOSES,
  modelStorageKey,
  modelUploadProblem,
  safeModelName,
} from "../util/demoModelFile.js";
import { headFile, presignDownload, presignUpload } from "../util/fileStore.js";

const router = express.Router();
router.use(requireAuth, requirePermission("learn"));

const me = (req) => String(req.user?.email || "").trim().toLowerCase();
const str = (v) => String(v || "").trim();

/** Everything, newest first. Small library; no paging needed yet. */
router.get("/", async (_req, res) => {
  try {
    const items = await DemoModel.find({}).sort({ createdAt: -1 }).limit(500).lean();
    res.json({
      ok: true,
      items: items.map((m) => ({
        ...m,
        id: String(m._id),
        // Never leak the storage key to a browser: it is the one thing that
        // would let somebody address the file outside the signed link.
        fileKey: undefined,
        ready: Boolean(m.fileKey && m.uploadedAt),
      })),
      formats: Object.keys(MODEL_ACCESS),
      purposes: MODEL_PURPOSES,
      accessLevels: MODEL_ACCESS,
    });
  } catch (e) {
    console.error("[admin.demoModels] list:", e);
    res.status(500).json({ error: "Could not read the sample models." });
  }
});

/** Step one: make the row and hand back a signed PUT. */
router.post("/", async (req, res) => {
  try {
    const title = str(req.body?.title);
    const fileName = str(req.body?.fileName);
    if (!title) return res.status(400).json({ error: "Give the model a name." });

    const problem = modelUploadProblem({ fileName, filename: fileName, size: req.body?.size });
    if (problem) return res.status(400).json({ error: problem });

    const purpose = MODEL_PURPOSES.includes(req.body?.purpose) ? req.body.purpose : "demo";
    const access = MODEL_ACCESS.includes(req.body?.access) ? req.body.access : "signed-in";

    // A course model must name its course, or nobody can be checked against it.
    // By SKU, because that is what a learner's enrolment carries — an ObjectId
    // here would refuse every course model to the students it was made for.
    let courseSku = "";
    let courseTitle = "";
    if (purpose === "course") {
      courseSku = str(req.body?.courseSku);
      if (!courseSku) return res.status(400).json({ error: "Choose the course this model is for." });
      const course = await PaidCourse.findOne({ sku: courseSku }, { title: 1, sku: 1 }).lean();
      if (!course) return res.status(400).json({ error: "That course does not exist." });
      courseTitle = str(course.title);
    }

    const doc = await DemoModel.create({
      title,
      description: str(req.body?.description),
      productKey: str(req.body?.productKey).toLowerCase(),
      discipline: ["architectural", "structural", "mep"].includes(req.body?.discipline)
        ? req.body.discipline
        : "",
      purpose,
      courseSku,
      courseTitle,
      access: purpose === "course" ? "course" : access,
      fileName: safeModelName(fileName),
      format: formatFor(fileName),
      uploadedBy: me(req),
      published: false,
    });

    const key = modelStorageKey(doc._id, fileName);
    const signed = await presignUpload({ key, contentType: contentTypeFor(fileName) });
    doc.fileKey = key;
    doc.storage = signed.storage || "";
    await doc.save();

    res.status(201).json({
      ok: true,
      id: String(doc._id),
      uploadUrl: signed.uploadUrl,
      contentType: signed.contentType,
      expiresIn: signed.expiresIn,
    });
  } catch (e) {
    console.error("[admin.demoModels] create:", e);
    res.status(500).json({ error: "Could not start the upload." });
  }
});

/** Step three: confirm the file is actually in storage. */
router.post("/:id/done", async (req, res) => {
  try {
    const doc = await DemoModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (!doc.fileKey) return res.status(400).json({ error: "This model has no upload to finish." });

    // The browser saying it uploaded is not evidence. Ask storage.
    const head = await headFile({ key: doc.fileKey, storage: doc.storage });
    if (!head) {
      return res
        .status(409)
        .json({ error: "The file is not in storage yet. Finish the upload, then try again." });
    }

    doc.sizeBytes = Number(head.size) || 0;
    doc.uploadedAt = new Date();
    await doc.save();
    res.json({ ok: true, id: String(doc._id), sizeBytes: doc.sizeBytes });
  } catch (e) {
    console.error("[admin.demoModels] done:", e);
    res.status(500).json({ error: "Could not confirm the upload." });
  }
});

/** Edit the things that are not the file. */
router.patch("/:id", async (req, res) => {
  try {
    const doc = await DemoModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    if (req.body?.title !== undefined) doc.title = str(req.body.title);
    if (req.body?.description !== undefined) doc.description = str(req.body.description);
    if (req.body?.productKey !== undefined) doc.productKey = str(req.body.productKey).toLowerCase();
    if (MODEL_ACCESS.includes(req.body?.access)) doc.access = req.body.access;
    if (req.body?.published !== undefined) {
      // Publishing a model whose file never arrived would put a broken download
      // in a course.
      if (req.body.published && !doc.isReady()) {
        return res.status(400).json({ error: "The file has not finished uploading yet." });
      }
      doc.published = Boolean(req.body.published);
    }
    await doc.save();
    res.json({ ok: true });
  } catch (e) {
    console.error("[admin.demoModels] patch:", e);
    res.status(500).json({ error: "Could not save the change." });
  }
});

/** A signed link, so an admin can check what a student will get. */
router.get("/:id/link", async (req, res) => {
  try {
    const doc = await DemoModel.findById(req.params.id).lean();
    if (!doc?.fileKey) return res.status(404).json({ error: "Not found" });
    const url = await presignDownload({
      key: doc.fileKey,
      storage: doc.storage,
      fileName: doc.fileName,
      expiresIn: 300,
    });
    res.json({ ok: true, url, fileName: doc.fileName });
  } catch (e) {
    console.error("[admin.demoModels] link:", e);
    res.status(500).json({ error: "Could not make a download link." });
  }
});

/**
 * Remove the row.
 *
 * The stored object is deliberately left alone: deleting it is not reversible,
 * and an orphan in a bucket costs pennies while a model deleted by a mis-click
 * costs a course. Clearing storage is a separate, deliberate job.
 */
router.delete("/:id", async (req, res) => {
  try {
    const out = await DemoModel.findByIdAndDelete(req.params.id);
    if (!out) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, note: "The row is gone; the stored file was left in place." });
  } catch (e) {
    console.error("[admin.demoModels] delete:", e);
    res.status(500).json({ error: "Could not remove it." });
  }
});

export default router;
