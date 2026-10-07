// The sample models a reader may have: course files and software demos.
//
// LISTING IS NOT THE GATE, DOWNLOADING IS
//
// Everything published is listed, including models a reader cannot download —
// a student should be able to SEE that a course ships a Revit model before
// deciding to enrol, and somebody evaluating QUIV should see that a sample
// exists. Each row says whether they may have it and, when they may not, why in
// a sentence. Hiding them would answer a question nobody asked and lose a sale.
//
// The download is a short-lived signed link minted per request. Nothing here
// ever returns a storage key or a permanent URL.

import express from "express";
import { requireAuth, verifyAccess } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { DemoModel } from "../models/DemoModel.js";
import { canDownloadModel, visibleToViewer } from "../util/demoModelAccess.js";
import { presignDownload } from "../util/fileStore.js";

const router = express.Router();

// There is no shared optionalAuth: routes/agent.js keeps its own private one,
// so this does the same rather than exporting a new middleware for one caller.
// Never 401s — the list is open, and a visitor seeing that a course ships a
// Revit model is the point.
async function softAuth(req, _res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      const decoded = verifyAccess(auth.slice(7).trim());
      const uid = decoded?._id || decoded?.id || decoded?.sub;
      // `scope` marks a challenge token, not an access token.
      if (uid && !decoded?.scope) {
        req.user = await User.findById(uid).select("_id email entitlements").lean();
      }
    }
  } catch {
    // treat as a visitor
  }
  next();
}

const enrolmentsFor = async (user) => {
  if (!user?._id) return [];
  return CourseEnrollment.find({ userId: user._id }, { courseSku: 1, status: 1 }).lean();
};

/**
 * What is on offer. Open to visitors, because a public model is a real thing
 * and asking somebody to sign in to SEE one is friction for nothing.
 */
router.get("/", softAuth, async (req, res) => {
  try {
    const where = { published: true };
    if (req.query?.productKey) where.productKey = String(req.query.productKey).toLowerCase();
    if (req.query?.purpose) where.purpose = String(req.query.purpose);
    if (req.query?.courseSku) where.courseSku = String(req.query.courseSku);

    const [models, enrolments] = await Promise.all([
      DemoModel.find(where).sort({ createdAt: -1 }).limit(200).lean(),
      enrolmentsFor(req.user),
    ]);

    const items = models
      .filter((m) => visibleToViewer(m, req.user))
      .map((m) => {
        const verdict = canDownloadModel(m, req.user, enrolments);
        return {
          id: String(m._id),
          title: m.title,
          description: m.description,
          productKey: m.productKey,
          discipline: m.discipline,
          purpose: m.purpose,
          courseTitle: m.courseTitle,
          format: m.format,
          fileName: m.fileName,
          sizeBytes: m.sizeBytes,
          // What they may do, and why not when they may not.
          canDownload: verdict.allowed,
          reason: verdict.reason,
        };
      });

    res.json({ ok: true, items });
  } catch (e) {
    console.error("[me.demoModels] list:", e);
    res.status(500).json({ error: "Could not read the sample models." });
  }
});

/**
 * A link to the file.
 *
 * requireAuth even though a `public` model needs no account: minting a signed
 * link is the one expensive thing here, and an unauthenticated endpoint that
 * mints them is a way to hammer storage. A visitor sees the model in the list
 * and signs in to take it.
 */
router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const model = await DemoModel.findById(req.params.id).lean();
    const enrolments = await enrolmentsFor(req.user);
    const verdict = canDownloadModel(model, req.user, enrolments);
    if (!verdict.allowed) {
      // 403 with the reason, so the screen repeats it rather than inventing one.
      return res.status(403).json({ error: verdict.reason });
    }

    const url = await presignDownload({
      key: model.fileKey,
      storage: model.storage,
      fileName: model.fileName,
      expiresIn: 300,
    });

    // Best effort: a counter must never fail a download.
    DemoModel.updateOne({ _id: model._id }, { $inc: { downloads: 1 } }).catch(() => {});

    res.json({ ok: true, url, fileName: model.fileName, sizeBytes: model.sizeBytes });
  } catch (e) {
    console.error("[me.demoModels] download:", e);
    res.status(500).json({ error: "Could not make a download link." });
  }
});

export default router;
