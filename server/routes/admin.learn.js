// server/routes/admin.learn.js
import express from "express";
import { Setting } from "../models/Setting.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { FreeVideo, PaidCourseVideo } from "../models/Learn.js";
import { fetchDurationSec } from "../util/youtubeDuration.js";
import {
  loadCatalogue,
  validateCatalogue,
  planSync,
  applyPlan,
  libraryStatus,
  checkAvailability,
} from "../util/youtubeLibrary.js";

const router = express.Router();

// ✅ Anyone holding the "learn" admin area (admin / mini-admin / custom role)
router.use(requireAuth, requirePermission("learn"));

// small helper so async errors go to your global error handler (no silent crashes)
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// "2026-08-13" or an ISO string -> Date; anything unparseable -> undefined,
// so a blank form field clears the date rather than storing an Invalid Date.
const parseDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/* ---------- FREE VIDEOS ---------- */
router.get(
  "/free",
  asyncHandler(async (_req, res) => {
    const list = await FreeVideo.find({})
      .sort({ sort: -1, createdAt: -1 })
      .lean();
    res.json(list);
  }),
);

router.post(
  "/free",
  asyncHandler(async (req, res) => {
    const {
      title,
      youtubeId,
      thumbnailUrl,
      isPublished = true,
      sort = 0,
    } = req.body || {};

    if (!title || !youtubeId) {
      return res.status(400).json({ error: "title and youtubeId required" });
    }

    const id = String(youtubeId).trim();
    // Typed-in duration wins; otherwise ask YouTube, which is a no-op unless
    // YOUTUBE_API_KEY is configured.
    const typed = Number(req.body?.durationSec) || 0;
    const durationSec = typed || (await fetchDurationSec(id));

    const doc = await FreeVideo.create({
      title: String(title).trim(),
      youtubeId: id,
      thumbnailUrl: thumbnailUrl ? String(thumbnailUrl).trim() : "",
      durationSec,
      productLabel: String(req.body?.productLabel || "").trim(),
      // Which shelf of the library, and whether the product page recommends
      // it. See util/freeVideoSections.js for the shelves.
      section: String(req.body?.section || "").trim(),
      recommended: !!req.body?.recommended,
      publishedAt: parseDate(req.body?.publishedAt),
      isPublished: !!isPublished,
      sort: Number(sort) || 0,
    });

    res.json({ ok: true, item: doc });
  }),
);

router.patch(
  "/free/:id",
  asyncHandler(async (req, res) => {
    const item = await FreeVideo.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const { title, youtubeId, thumbnailUrl, isPublished, sort } =
      req.body || {};

    if (title !== undefined) item.title = String(title).trim();
    if (youtubeId !== undefined) item.youtubeId = String(youtubeId).trim();
    if (thumbnailUrl !== undefined)
      item.thumbnailUrl = thumbnailUrl ? String(thumbnailUrl).trim() : "";
    if (isPublished !== undefined) item.isPublished = !!isPublished;
    if (sort !== undefined) item.sort = Number(sort) || 0;
    if (req.body?.productLabel !== undefined) {
      item.productLabel = String(req.body.productLabel || "").trim();
    }
    if (req.body?.durationSec !== undefined) {
      item.durationSec = Number(req.body.durationSec) || 0;
    }
    if (req.body?.section !== undefined) item.section = String(req.body.section || "").trim();
    if (req.body?.recommended !== undefined) item.recommended = !!req.body.recommended;
    if (req.body?.publishedAt !== undefined) {
      item.publishedAt = parseDate(req.body.publishedAt) || undefined;
    }
    // Still unknown and the video id changed? Try YouTube once.
    if (!item.durationSec) item.durationSec = await fetchDurationSec(item.youtubeId);

    await item.save();
    res.json({ ok: true, item });
  }),
);

router.delete(
  "/free/:id",
  asyncHandler(async (req, res) => {
    const gone = await FreeVideo.findByIdAndDelete(req.params.id).lean();
    // Remembered, so the auto-filer does not bring it back from the channel
    // feed a quarter of an hour later (review, 2026-09-22).
    if (gone?.youtubeId) {
      await Setting.updateOne(
        { key: "global" },
        { $addToSet: { freeLibraryIgnored: String(gone.youtubeId) } },
        { upsert: true },
      );
    }
    res.json({ ok: true });
  }),
);

/* ---------- THE YOUTUBE CHANNEL vs THE LIBRARY ----------
 *
 * The status screen in both admins. The catalogue (data/youtube-free-videos
 * .json) is the reviewed filing of the channel; the library is what the site
 * shows. These say where the two differ and let an admin close the gap
 * without a terminal: apply the catalogue, release held videos, and ask
 * YouTube whether each video will still play. util/youtubeLibrary.js is the
 * same code the command-line sync runs.
 */
router.get(
  "/youtube/status",
  asyncHandler(async (_req, res) => {
    const catalogue = loadCatalogue();
    const docs = await FreeVideo.find({}).lean();
    res.json({ ...libraryStatus(catalogue, docs), problems: validateCatalogue(catalogue) });
  }),
);

// Asks YouTube's oEmbed endpoint about each video. Live, not stored: the
// answer is only true at the moment it is given, and a stale "available"
// on a record is worse than no answer.
router.post(
  "/youtube/check",
  asyncHandler(async (req, res) => {
    const wanted = Array.isArray(req.body?.ids) && req.body.ids.length ? req.body.ids : null;
    const ids = wanted || (await FreeVideo.find({}).select("youtubeId").lean()).map((d) => d.youtubeId);
    const results = await checkAvailability(ids);
    const tally = { ok: 0, private: 0, missing: 0, error: 0 };
    for (const r of Object.values(results)) tally[r.state] = (tally[r.state] || 0) + 1;
    res.json({ checkedAt: new Date().toISOString(), tally, results });
  }),
);

// Applies the catalogue: creates what the library lacks, fills blanks on what
// it holds. `hold` creates the new rows unpublished. Never deletes.
router.post(
  "/youtube/sync",
  asyncHandler(async (req, res) => {
    const catalogue = loadCatalogue();
    const problems = validateCatalogue(catalogue);
    if (problems.length) return res.status(422).json({ error: "The catalogue cannot be applied.", problems });
    const docs = await FreeVideo.find({}).lean();
    const plan = planSync(catalogue.videos, docs, { force: !!req.body?.force });
    const done = await applyPlan(FreeVideo, plan, { hold: !!req.body?.hold });
    res.json({ ok: true, ...done, orphans: plan.orphans.length });
  }),
);

// Releases every catalogue video that is sitting unpublished.
router.post(
  "/youtube/publish",
  asyncHandler(async (_req, res) => {
    const catalogue = loadCatalogue();
    const ids = catalogue.videos.map((v) => v.youtubeId);
    const r = await FreeVideo.updateMany({ youtubeId: { $in: ids }, isPublished: false }, { $set: { isPublished: true } });
    res.json({ ok: true, published: r.modifiedCount || 0 });
  }),
);

/* ---------- PAID COURSES ---------- */
router.get(
  "/courses",
  asyncHandler(async (_req, res) => {
    const list = await PaidCourseVideo.find({})
      .sort({ sort: -1, createdAt: -1 })
      .lean();
    res.json(list);
  }),
);

router.post(
  "/courses",
  asyncHandler(async (req, res) => {
    const {
      sku,
      title,
      previewUrl,
      bullets = [],
      description = "",
      isPublished = true,
      sort = 0,
    } = req.body || {};

    if (!sku || !title || !previewUrl) {
      return res.status(400).json({ error: "sku, title, previewUrl required" });
    }

    const skuNorm = String(sku).trim();
    const exists = await PaidCourseVideo.findOne({ sku: skuNorm }).lean();
    if (exists) return res.status(409).json({ error: "SKU already exists" });

    const doc = await PaidCourseVideo.create({
      sku: skuNorm,
      title: String(title).trim(),
      previewUrl: String(previewUrl).trim(),
      bullets: Array.isArray(bullets) ? bullets : [],
      description: String(description || ""),
      isPublished: !!isPublished,
      sort: Number(sort) || 0,
    });

    res.json({ ok: true, item: doc });
  }),
);

router.patch(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    const item = await PaidCourseVideo.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const { sku, title, previewUrl, bullets, description, isPublished, sort } =
      req.body || {};

    if (sku !== undefined) item.sku = String(sku).trim();
    if (title !== undefined) item.title = String(title).trim();
    if (previewUrl !== undefined) item.previewUrl = String(previewUrl).trim();
    if (bullets !== undefined)
      item.bullets = Array.isArray(bullets) ? bullets : [];
    if (description !== undefined) item.description = String(description || "");
    if (isPublished !== undefined) item.isPublished = !!isPublished;
    if (sort !== undefined) item.sort = Number(sort) || 0;
    if (req.body?.durationSec !== undefined) {
      item.durationSec = Number(req.body.durationSec) || 0;
    }
    // Still unknown and the video id changed? Try YouTube once.
    if (!item.durationSec) item.durationSec = await fetchDurationSec(item.youtubeId);

    await item.save();
    res.json({ ok: true, item });
  }),
);

router.delete(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    await PaidCourseVideo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }),
);

export default router;
