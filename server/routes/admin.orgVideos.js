// server/routes/admin.orgVideos.js
//
// Videos recorded for one organisation — filed, uploaded, encoded, published.
// Mounted at /admin/org-videos behind the "orgvideos" permission area.
//
// The picture goes through the same pipeline as a course lecture: master in
// the archive bucket, MediaConvert builds the HLS ladder, CloudFront serves
// it behind signed cookies. The file itself never passes through the API —
// Lambda caps a request body at 10MB — so the sequence the admin screen runs
// is:
//
//   POST   /                     make the row (title, organisation, notes)
//   POST   /:id/upload/s3        a presigned PUT into the archive bucket; the
//                                browser streams the master straight there
//   POST   /:id/upload/done      the browser says the bytes are in; we check
//                                the object exists and submit the encode
//   GET    /:id/status           poll MediaConvert; the row updates
//   GET    /:id/play             an admin preview: signed CloudFront cookies
//                                and the manifest, or the master while the
//                                ladder is still being built
//
// A pasted link needs none of that — PATCH videoUrl and it is live.

import express from "express";
import mongoose from "mongoose";
import { OrgVideo, orgKeyOf } from "../models/OrgVideo.js";
import { User } from "../models/User.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { objectSize, presignArchiveUrl } from "../utils/awsS3.js";
import { submitHlsJob, getJobState } from "../utils/awsMediaConvert.js";
import { signPlaybackCookies, playbackCookieOptions, cdnUrl } from "../utils/cloudfrontSign.js";
import {
  isPipelineConfigured,
  isCloudfrontConfigured,
  keysFor,
  presignArchivePut,
  discardOrgVideoObjects,
  ORG_VIDEO_PREFIX,
} from "../utils/orgVideoStorage.js";
import { deleteFromR2 } from "../utils/r2Upload.js";
import { notifyOrgVideoReady } from "../util/orgVideoMail.js";

const router = express.Router();
router.use(requireAuth, requirePermission("orgvideos"));

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const clean = (v, max = 400) => String(v ?? "").trim().slice(0, max);
const TERMINAL = new Set(["COMPLETE", "CANCELED", "ERROR"]);

function serialize(v) {
  return {
    id: String(v._id),
    title: v.title,
    description: v.description || "",
    orgName: v.orgName,
    orgKey: v.orgKey,
    source: v.source,
    videoUrl: v.source === "s3" ? "" : v.videoUrl || "",
    thumbnailUrl: v.thumbnailUrl || "",
    durationSec: v.durationSec || 0,
    fileName: v.fileName || "",
    fileSize: v.fileSize || 0,
    isPublished: !!v.isPublished,
    sort: v.sort || 0,
    viewCount: v.viewCount || 0,
    watchers: (v.watches || []).length,
    lastWatchedAt:
      (v.watches || []).reduce((m, w) => (w.lastAt && (!m || w.lastAt > m) ? w.lastAt : m), null),
    // The pipeline's view of the row. `stream` is the adaptive ladder;
    // `master` means the upload is in and plays as one file until then.
    pipeline:
      v.source === "s3"
        ? {
            master: !!v.sourceKey,
            stream: !!v.hlsKey,
            status: v.transcodeStatus || "",
            percent: v.transcodePercent || 0,
            error: v.transcodeError || "",
            jobId: v.transcodeJobId || "",
          }
        : null,
    bunny:
      v.source === "bunny" && v.bunny?.videoId
        ? { libId: v.bunny.libId || "", videoId: v.bunny.videoId, ready: true }
        : null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

/** Pull MediaConvert's view of the encode into the row. Best-effort. */
async function refreshTranscode(doc) {
  if (doc.source !== "s3" || !doc.transcodeJobId || TERMINAL.has(doc.transcodeStatus)) return doc;
  try {
    const state = await getJobState(doc.transcodeJobId);
    if (state.status) doc.transcodeStatus = state.status;
    doc.transcodePercent = state.status === "COMPLETE" ? 100 : Number(state.percent) || 0;
    doc.transcodeCheckedAt = new Date();
    if (state.status === "COMPLETE") {
      doc.hlsKey = `${doc.outPrefix}index.m3u8`;
      doc.transcodeError = "";
    } else if (state.status === "ERROR" || state.status === "CANCELED") {
      doc.transcodeError = state.errorMessage || `MediaConvert reported ${state.status}.`;
    }
    await doc.save();
  } catch (e) {
    console.warn("[admin.orgVideos] could not read job state:", e?.message || e);
  }
  return doc;
}

/** Submit (or resubmit) the ladder for a row whose master is in the archive. */
async function submitEncode(doc) {
  const { outPrefix } = keysFor(doc);
  const jobId = await submitHlsJob({
    sourceKey: doc.sourceKey,
    outPrefix,
    jobTag: `org-video:${doc._id}`,
  });
  doc.outPrefix = outPrefix;
  doc.transcodeJobId = jobId;
  doc.transcodeStatus = "SUBMITTED";
  doc.transcodePercent = 0;
  doc.transcodeError = "";
  doc.transcodeSubmittedAt = new Date();
  await doc.save();
  return doc;
}

/** Remove the bytes behind a row, wherever they are. Never throws. */
async function discardStored(doc) {
  try {
    if (doc.source === "s3") {
      await discardOrgVideoObjects(doc);
    } else if (doc.source === "r2" && doc.r2?.key) {
      await deleteFromR2(doc.r2.key);
    }
  } catch (e) {
    console.warn("[admin.orgVideos] could not discard stored file:", e?.message || e);
  }
}

/**
 * Email the firm the first time a row is both published and watchable. Runs
 * after the response has been decided, never before it, and never twice:
 * `notifiedAt` is stamped before the mail goes so a slow send cannot race a
 * second call into a duplicate.
 */
function maybeNotify(doc) {
  const watchable = doc.source === "s3" ? !!doc.sourceKey : doc.source !== "none" && !!doc.videoUrl;
  if (!doc.isPublished || !watchable || doc.notifiedAt) return;
  doc.notifiedAt = new Date();
  doc
    .save()
    .then(() => notifyOrgVideoReady(doc))
    .then((r) => console.log(`[admin.orgVideos] "${doc.title}" announced to ${r?.sent ?? 0} account(s) at ${doc.orgName}`))
    .catch((e) => console.warn("[admin.orgVideos] notify failed:", e?.message || e));
}

function clearStorage(doc) {
  doc.sourceKey = "";
  doc.outPrefix = "";
  doc.hlsKey = "";
  doc.transcodeJobId = "";
  doc.transcodeStatus = "";
  doc.transcodePercent = 0;
  doc.transcodeError = "";
  doc.r2 = {};
  doc.bunny = {};
  doc.fileName = "";
  doc.fileSize = 0;
}

/* ---------------------------------------------------------------- list ── */

// GET /admin/org-videos?org=&q=
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.org) filter.orgKey = orgKeyOf(req.query.org);
    if (req.query.q) {
      const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ title: rx }, { orgName: rx }, { description: rx }];
    }
    const rows = await OrgVideo.find(filter).sort({ orgKey: 1, sort: 1, createdAt: -1 });

    // Anything mid-encode gets a fresh read so the table is honest without a
    // separate poll per row. Bounded: a page of a hundred rows encoding at
    // once is not a real situation.
    const pending = rows.filter(
      (r) => r.source === "s3" && r.transcodeJobId && !TERMINAL.has(r.transcodeStatus),
    );
    await Promise.all(pending.slice(0, 10).map(refreshTranscode));

    const counts = {};
    for (const r of rows) counts[r.orgName] = (counts[r.orgName] || 0) + 1;

    return res.json({
      ok: true,
      items: rows.map(serialize),
      counts,
      storage: {
        pipeline: isPipelineConfigured(),
        cloudfront: isCloudfrontConfigured(),
      },
    });
  } catch (err) {
    console.error("[admin.orgVideos] list failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /admin/org-videos/organisations — every firm name on any entitlement or
// account, so the picker offers the spelling the licences already use. A firm
// with no licence yet can still be typed in.
router.get("/organisations", async (_req, res) => {
  try {
    const users = await User.find(
      {
        $or: [
          { "entitlements.organizationName": { $exists: true, $nin: [null, ""] } },
          { organizationName: { $exists: true, $nin: [null, ""] } },
        ],
      },
      { organizationName: 1, "entitlements.organizationName": 1, "entitlements.status": 1 },
    ).lean();

    const firms = new Map(); // key -> { name, people, live }
    const add = (name) => {
      const n = clean(name, 120);
      const key = orgKeyOf(n);
      if (!key) return;
      const f = firms.get(key) || { name: n, key, people: new Set(), live: 0 };
      firms.set(key, f);
      return f;
    };
    for (const u of users) {
      const seen = new Set();
      if (u.organizationName) {
        const f = add(u.organizationName);
        if (f) {
          f.people.add(String(u._id));
          seen.add(f.key);
        }
      }
      for (const e of u.entitlements || []) {
        const f = add(e.organizationName);
        if (!f) continue;
        f.people.add(String(u._id));
        if (String(e.status).toLowerCase() === "active" && !seen.has(f.key)) {
          f.live += 1;
          seen.add(f.key);
        }
      }
    }

    const items = [...firms.values()]
      .map((f) => ({ name: f.name, key: f.key, people: f.people.size, live: f.live }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ ok: true, items });
  } catch (err) {
    console.error("[admin.orgVideos] organisations failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------------------------------------------------- create ── */

// POST /admin/org-videos { title, orgName, description?, videoUrl? }
router.post("/", async (req, res) => {
  try {
    const title = clean(req.body?.title, 160);
    const orgName = clean(req.body?.orgName, 120);
    if (!title) return res.status(400).json({ error: "A title is needed." });
    if (!orgName) return res.status(400).json({ error: "Which organisation is this for?" });

    const videoUrl = clean(req.body?.videoUrl, 1000);
    const doc = await OrgVideo.create({
      title,
      orgName,
      description: clean(req.body?.description, 2000),
      videoUrl,
      source: videoUrl ? "link" : "none",
      isPublished: req.body?.isPublished == null ? true : !!req.body.isPublished,
      createdBy: req.user?.id || req.user?._id || undefined,
    });
    // A pasted link is watchable immediately; an upload announces itself
    // from upload/done once the master is in.
    maybeNotify(doc);
    return res.status(201).json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] create failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ---------------------------------------------------------------- edit ── */

// PATCH /admin/org-videos/:id
router.patch("/:id", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const b = req.body || {};
    if (b.title != null) {
      const t = clean(b.title, 160);
      if (!t) return res.status(400).json({ error: "A title is needed." });
      doc.title = t;
    }
    if (b.orgName != null) {
      const o = clean(b.orgName, 120);
      if (!o) return res.status(400).json({ error: "Which organisation is this for?" });
      doc.orgName = o;
    }
    if (b.description != null) doc.description = clean(b.description, 2000);
    if (b.isPublished != null) doc.isPublished = !!b.isPublished;
    if (b.sort != null) doc.sort = Number(b.sort) || 0;
    if (b.thumbnailUrl != null) doc.thumbnailUrl = clean(b.thumbnailUrl, 1000);
    if (b.durationSec != null) doc.durationSec = Math.max(0, Number(b.durationSec) || 0);

    // Swapping to a pasted link drops whatever was uploaded before, so the
    // master and its ladder do not sit in the buckets costing money for
    // nothing.
    if (b.videoUrl != null) {
      const url = clean(b.videoUrl, 1000);
      if (url !== doc.videoUrl || doc.source === "s3") {
        await discardStored(doc);
        clearStorage(doc);
        doc.videoUrl = url;
        doc.source = url ? "link" : "none";
      }
    }

    await doc.save();
    // Switching Live on, or pasting a link into a row that had nothing, is
    // the moment the firm can watch — so it is the moment they hear about it.
    maybeNotify(doc);
    return res.json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] patch failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// DELETE /admin/org-videos/:id
router.delete("/:id", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await discardStored(doc);
    await doc.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin.orgVideos] delete failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------------------------------------------------- upload ── */

// POST /admin/org-videos/:id/upload/s3 { fileName, fileSize, contentType }
router.post("/:id/upload/s3", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    if (!isPipelineConfigured()) {
      return res.status(503).json({
        error: "The video pipeline (archive bucket, delivery bucket, MediaConvert) is not configured on this server.",
      });
    }
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const fileName = clean(req.body?.fileName, 200) || "video.mp4";
    const contentType = clean(req.body?.contentType, 100) || "video/mp4";
    if (!contentType.startsWith("video/")) {
      return res.status(400).json({ error: "Only video files can be uploaded here." });
    }
    const ext = (fileName.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const { masterPrefix } = keysFor(doc);
    const signed = await presignArchivePut({
      key: `${masterPrefix}master-${Date.now()}.${ext}`,
      contentType,
    });
    return res.json({ ok: true, ...signed });
  } catch (err) {
    console.error("[admin.orgVideos] s3 sign failed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Could not sign the upload." });
  }
});

// POST /admin/org-videos/:id/upload/done { key, fileName?, fileSize? }
//
// The browser has finished its PUT. The object is checked before anything
// changes on the row, so a failed upload leaves the previous picture in place.
router.post("/:id/upload/done", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const key = clean(req.body?.key, 500);
    const { masterPrefix } = keysFor(doc);
    if (!key.startsWith(ORG_VIDEO_PREFIX) || !key.startsWith(masterPrefix)) {
      return res.status(400).json({ error: "That key does not belong to this video." });
    }
    const size = await objectSize(key);
    if (!size) {
      return res.status(400).json({ error: "The upload did not arrive in the archive. Try again." });
    }

    // The previous master and ladder go now — not before, so a failed upload
    // never leaves the row with nothing behind it.
    await discardStored(doc);
    clearStorage(doc);
    doc.source = "s3";
    doc.videoUrl = "";
    doc.sourceKey = key;
    doc.fileName = clean(req.body?.fileName, 200) || key.split("/").pop();
    doc.fileSize = Math.max(0, Number(req.body?.fileSize) || size);
    await doc.save();

    try {
      await submitEncode(doc);
    } catch (e) {
      // The master is in and plays on its own; the ladder can be retried
      // from "Improve quality". Say why rather than fail the upload.
      doc.transcodeStatus = "ERROR";
      doc.transcodeError = e?.message || "MediaConvert refused the job.";
      await doc.save();
    }
    // The master is in and plays on its own, so the firm hears now rather
    // than when the ladder finishes — the picture only gets better from here.
    maybeNotify(doc);
    return res.json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] upload done failed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
});

// POST /admin/org-videos/:id/enhance — build (or rebuild) the adaptive ladder
// from the master. Every rendition up to the recording's own resolution;
// nothing here invents detail the recording never had.
router.post("/:id/enhance", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    if (!isPipelineConfigured()) {
      return res.status(503).json({ error: "The video pipeline is not configured on this server." });
    }
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (doc.source !== "s3" || !doc.sourceKey) {
      return res.status(400).json({
        error: "Only an uploaded recording can be encoded. Upload the file itself for a Drive or YouTube link.",
        code: "NOT_UPLOADED",
      });
    }
    if (doc.transcodeJobId && !TERMINAL.has(doc.transcodeStatus)) {
      await refreshTranscode(doc);
      if (!TERMINAL.has(doc.transcodeStatus)) {
        return res.status(409).json({ error: "The encode is still running.", item: serialize(doc) });
      }
    }
    await submitEncode(doc);
    return res.json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] enhance failed:", err);
    return res.status(502).json({ ok: false, error: err?.message || "Could not start the encode." });
  }
});

// GET /admin/org-videos/:id/status — one row, freshly read from MediaConvert.
router.get("/:id/status", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await refreshTranscode(doc);
    return res.json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] status failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /admin/org-videos/:id/play — an admin preview. No concurrency seat and
// no watch logged: this is checking the file, not watching it as the firm.
router.get("/:id/play", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    if (doc.source !== "s3") {
      return res.json({ ok: true, kind: doc.source, playbackUrl: doc.videoUrl || "" });
    }

    let playbackUrl = "";
    let kind = "";
    if (doc.hlsKey && isCloudfrontConfigured()) {
      try {
        const { cookies, expiresAt } = signPlaybackCookies({ keyPrefix: doc.outPrefix });
        for (const [name, value] of Object.entries(cookies)) {
          res.cookie(name, value, playbackCookieOptions(expiresAt));
        }
        playbackUrl = cdnUrl(doc.hlsKey);
        kind = "stream";
      } catch (e) {
        console.warn("[admin.orgVideos] could not sign cookies:", e?.message || e);
      }
    }
    if (!playbackUrl && doc.sourceKey) {
      playbackUrl = await presignArchiveUrl(doc.sourceKey);
      kind = "master";
    }
    return res.json({ ok: true, kind, playbackUrl });
  } catch (err) {
    console.error("[admin.orgVideos] play failed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
});

export default router;
