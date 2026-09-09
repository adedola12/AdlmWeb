// server/routes/admin.orgVideos.js
//
// Videos recorded for one organisation — filed, uploaded, encoded, published.
// Mounted at /admin/org-videos behind the "orgvideos" permission area.
//
// The upload itself never passes through here (Lambda's 10MB body cap, see
// utils/bunnyStream.js). The sequence the admin screen runs is:
//
//   POST   /                     make the row (title, organisation, notes)
//   POST   /:id/upload/bunny     Bunny creates a video; we hand back a TUS
//                                token and the browser streams the file up
//   POST   /:id/upload/done      the browser says the bytes are in; we read
//                                Bunny's status and start tracking the encode
//   GET    /:id/status           poll while Bunny encodes (the row updates)
//
// or, when Bunny is not configured:
//
//   POST   /:id/upload/r2        a presigned PUT straight to R2; the browser
//                                uploads, then calls /upload/done with the key
//
// A pasted link needs none of that — PATCH videoUrl and it is live.

import express from "express";
import mongoose from "mongoose";
import { OrgVideo, orgKeyOf, BUNNY_STATUS } from "../models/OrgVideo.js";
import { User } from "../models/User.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  isBunnyConfigured,
  createBunnyVideo,
  getBunnyVideo,
  deleteBunnyVideo,
  reencodeBunnyVideo,
  fetchBunnyVideo,
  bunnyTusAuth,
  bunnyShorthand,
  bunnyLibId,
} from "../utils/bunnyStream.js";
import {
  isR2Configured,
  createPresignedPutUrl,
  deleteFromR2,
} from "../utils/r2Upload.js";

const router = express.Router();
router.use(requireAuth, requirePermission("orgvideos"));

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const clean = (v, max = 400) => String(v ?? "").trim().slice(0, max);

function serialize(v) {
  const status = v.bunny?.status;
  return {
    id: String(v._id),
    title: v.title,
    description: v.description || "",
    orgName: v.orgName,
    orgKey: v.orgKey,
    source: v.source,
    videoUrl: v.videoUrl || "",
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
    bunny:
      v.source === "bunny"
        ? {
            libId: v.bunny?.libId || "",
            videoId: v.bunny?.videoId || "",
            status,
            statusLabel: status == null ? "" : BUNNY_STATUS[status] || `status ${status}`,
            encodeProgress: v.bunny?.encodeProgress || 0,
            resolutions: String(v.bunny?.resolutions || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            error: v.bunny?.error || "",
            // Playable once Bunny has produced its first playlist; "finished"
            // only means every rendition is done.
            ready: status === 4 || status === 8 || (status === 3 && (v.bunny?.encodeProgress || 0) >= 100),
          }
        : null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

/** Pull Bunny's view of the encode into the row. Best-effort. */
async function refreshBunny(doc) {
  if (doc.source !== "bunny" || !doc.bunny?.videoId || !isBunnyConfigured()) return doc;
  try {
    const v = await getBunnyVideo(doc.bunny.videoId);
    doc.bunny.status = typeof v?.status === "number" ? v.status : doc.bunny.status;
    doc.bunny.encodeProgress = Number(v?.encodeProgress) || 0;
    doc.bunny.lastCheckedAt = new Date();
    doc.bunny.error = doc.bunny.status === 5 || doc.bunny.status === 6 ? "Bunny could not process this file." : "";
    if (Number(v?.length) > 0) doc.durationSec = Math.round(Number(v.length));
    if (typeof v?.availableResolutions === "string") doc.bunny.resolutions = v.availableResolutions;
    // A fetched-and-encoded video is now playable: the plain file it came
    // from has done its job, so it goes. Only R2 objects are ours to remove.
    const playable = doc.bunny.status === 4 || doc.bunny.status === 8;
    if (playable && doc.previousSource?.source) {
      if (doc.previousSource.r2Key) {
        await deleteFromR2(doc.previousSource.r2Key).catch(() => {});
      }
      doc.previousSource = { source: "", videoUrl: "", r2Key: "" };
    }
    // Bunny's thumbnail lives on the library's pull zone, which the video
    // record does not name. The embed player carries its own poster, so the
    // row keeps no thumbnail rather than guessing a hostname.
    await doc.save();
  } catch (e) {
    doc.bunny.error = e?.message || "Could not read the encode status.";
  }
  return doc;
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
      (r) => r.source === "bunny" && r.bunny?.status != null && r.bunny.status < 4,
    );
    await Promise.all(pending.slice(0, 10).map(refreshBunny));

    const counts = {};
    for (const r of rows) counts[r.orgName] = (counts[r.orgName] || 0) + 1;

    return res.json({
      ok: true,
      items: rows.map(serialize),
      counts,
      storage: {
        bunny: isBunnyConfigured(),
        r2: isR2Configured(),
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
      source: videoUrl ? (/^bunny:/i.test(videoUrl) ? "bunny" : "link") : "none",
      isPublished: req.body?.isPublished == null ? true : !!req.body.isPublished,
      createdBy: req.user?.id || req.user?._id || undefined,
    });
    if (doc.source === "bunny") {
      const m = videoUrl.match(/^bunny:([a-z0-9]+):([a-f0-9-]+)$/i);
      if (m) {
        doc.bunny.libId = m[1];
        doc.bunny.videoId = m[2];
        await doc.save();
        await refreshBunny(doc);
      }
    }
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
    // stored file does not sit in Bunny or R2 costing money for nothing.
    if (b.videoUrl != null) {
      const url = clean(b.videoUrl, 1000);
      if (url !== doc.videoUrl) {
        await discardStored(doc);
        doc.videoUrl = url;
        const m = url.match(/^bunny:([a-z0-9]+):([a-f0-9-]+)$/i);
        if (m) {
          doc.source = "bunny";
          doc.bunny = { libId: m[1], videoId: m[2], status: null, encodeProgress: 0 };
        } else {
          doc.source = url ? "link" : "none";
          doc.bunny = {};
        }
        doc.r2 = {};
        doc.fileName = "";
        doc.fileSize = 0;
      }
    }

    await doc.save();
    if (doc.source === "bunny") await refreshBunny(doc);
    return res.json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] patch failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/** Remove the bytes behind a row, wherever they are. Never throws. */
async function discardStored(doc) {
  try {
    if (doc.source === "bunny" && doc.bunny?.videoId && doc.bunny?.libId === bunnyLibId()) {
      await deleteBunnyVideo(doc.bunny.videoId);
    } else if (doc.source === "r2" && doc.r2?.key) {
      await deleteFromR2(doc.r2.key);
    }
  } catch (e) {
    console.warn("[admin.orgVideos] could not discard stored file:", e?.message || e);
  }
}

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

// POST /admin/org-videos/:id/upload/bunny { fileName, fileSize, contentType }
router.post("/:id/upload/bunny", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    if (!isBunnyConfigured()) {
      return res.status(503).json({ error: "Bunny Stream is not configured on this server." });
    }
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const fileName = clean(req.body?.fileName, 200) || "video.mp4";
    const fileSize = Math.max(0, Number(req.body?.fileSize) || 0);

    // A re-upload replaces: the old file goes so the row never points at two.
    await discardStored(doc);

    const created = await createBunnyVideo(`${doc.orgName} — ${doc.title}`);
    const videoId = created?.guid;
    if (!videoId) return res.status(502).json({ error: "Bunny did not return a video id." });

    doc.source = "bunny";
    doc.bunny = {
      libId: bunnyLibId(),
      videoId,
      status: 0,
      encodeProgress: 0,
      lastCheckedAt: new Date(),
      error: "",
    };
    doc.r2 = {};
    doc.videoUrl = bunnyShorthand(videoId);
    doc.fileName = fileName;
    doc.fileSize = fileSize;
    await doc.save();

    return res.json({
      ok: true,
      item: serialize(doc),
      tus: {
        ...bunnyTusAuth(videoId),
        metadata: {
          filetype: clean(req.body?.contentType, 100) || "video/mp4",
          title: `${doc.orgName} — ${doc.title}`,
        },
      },
    });
  } catch (err) {
    console.error("[admin.orgVideos] bunny start failed:", err);
    return res.status(502).json({ ok: false, error: err?.message || "Could not start the upload." });
  }
});

// POST /admin/org-videos/:id/upload/r2 { fileName, fileSize, contentType }
router.post("/:id/upload/r2", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    if (!isR2Configured()) {
      return res.status(503).json({ error: "R2 storage is not configured on this server." });
    }
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const fileName = clean(req.body?.fileName, 200) || "video.mp4";
    const contentType = clean(req.body?.contentType, 100) || "video/mp4";
    if (!contentType.startsWith("video/")) {
      return res.status(400).json({ error: "Only video files can be uploaded here." });
    }
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const signed = await createPresignedPutUrl({
      key: `adlm/org-videos/${doc.orgKey.replace(/\s+/g, "-") || "org"}/${Date.now()}-${safe}`,
      contentType,
      expiresIn: 3600,
    });
    return res.json({ ok: true, ...signed });
  } catch (err) {
    console.error("[admin.orgVideos] r2 sign failed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Could not sign the upload." });
  }
});

// POST /admin/org-videos/:id/upload/done { provider: "bunny"|"r2", key?, publicUrl?, fileName?, fileSize? }
router.post("/:id/upload/done", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const provider = String(req.body?.provider || "");
    if (provider === "r2") {
      const key = clean(req.body?.key, 500);
      const publicUrl = clean(req.body?.publicUrl, 1000);
      if (!key || !publicUrl) return res.status(400).json({ error: "key and publicUrl are needed." });
      if (!key.startsWith("adlm/org-videos/")) {
        return res.status(400).json({ error: "That key is not an organisation video." });
      }
      // The previous file, if it was something else, goes now — not before,
      // so a failed upload never leaves the row with nothing.
      if (!(doc.source === "r2" && doc.r2?.key === key)) await discardStored(doc);
      doc.source = "r2";
      doc.r2 = { key };
      doc.bunny = {};
      doc.videoUrl = publicUrl;
      doc.fileName = clean(req.body?.fileName, 200) || doc.fileName;
      doc.fileSize = Math.max(0, Number(req.body?.fileSize) || doc.fileSize || 0);
      await doc.save();
      return res.json({ ok: true, item: serialize(doc) });
    }

    if (provider === "bunny") {
      if (doc.source !== "bunny" || !doc.bunny?.videoId) {
        return res.status(400).json({ error: "No Bunny upload was started for this video." });
      }
      if (doc.bunny.status == null || doc.bunny.status < 1) doc.bunny.status = 1;
      await doc.save();
      await refreshBunny(doc);
      return res.json({ ok: true, item: serialize(doc) });
    }

    return res.status(400).json({ error: "provider must be bunny or r2." });
  } catch (err) {
    console.error("[admin.orgVideos] upload done failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /admin/org-videos/:id/enhance
//
// "Improve the quality" — honestly. Nothing here adds detail the recording
// never had; what it does is make sure the firm gets the BEST the file holds:
//
//   bunny  → run the encode again with the library's current settings, so
//            every rendition up to the source's own resolution exists.
//   r2 /   → hand the public URL to Bunny, which pulls the file and encodes
//   link     it for adaptive streaming; the row becomes a Bunny video. Only
//            a direct file URL works — Drive/YouTube pages are not files.
router.post("/:id/enhance", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    if (!isBunnyConfigured()) {
      return res.status(503).json({ error: "Bunny Stream is not configured on this server, so there is no encoder to improve it with." });
    }
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    if (doc.source === "bunny" && doc.bunny?.videoId) {
      if (doc.bunny.libId && doc.bunny.libId !== bunnyLibId()) {
        return res.status(400).json({ error: "This video lives in a different Bunny library than the one this server is set up for." });
      }
      await reencodeBunnyVideo(doc.bunny.videoId);
      doc.bunny.status = 2;
      doc.bunny.encodeProgress = 0;
      doc.bunny.error = "";
      await doc.save();
      await refreshBunny(doc);
      return res.json({ ok: true, action: "reencode", item: serialize(doc) });
    }

    const url = String(doc.videoUrl || "").trim();
    const isFile = /^https?:\/\/[^?#]+\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/i.test(url);
    if (!url || !isFile) {
      return res.status(400).json({
        error: "Bunny can only fetch a direct video file (an .mp4 link). For a Drive or YouTube link, upload the file itself and it will be encoded.",
        code: "NOT_A_FILE_URL",
      });
    }

    const fetched = await fetchBunnyVideo(url, `${doc.orgName} — ${doc.title}`);
    const videoId = fetched?.id || fetched?.guid;
    if (!videoId) return res.status(502).json({ error: "Bunny accepted the fetch but did not return a video id." });

    // The old bytes stay where they are until Bunny has actually produced
    // something — see refreshBunny / the client's poll: a fetch that fails
    // would otherwise leave the row with nothing behind it.
    doc.previousSource = { source: doc.source, videoUrl: doc.videoUrl, r2Key: doc.r2?.key || "" };
    doc.source = "bunny";
    doc.bunny = { libId: bunnyLibId(), videoId, status: 0, encodeProgress: 0, resolutions: "", lastCheckedAt: new Date(), error: "" };
    doc.r2 = {};
    doc.videoUrl = bunnyShorthand(videoId);
    await doc.save();
    await refreshBunny(doc);
    return res.json({ ok: true, action: "fetch", item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] enhance failed:", err);
    return res.status(502).json({ ok: false, error: err?.message || "Could not start the encode." });
  }
});

// GET /admin/org-videos/:id/status — one row, freshly read from Bunny.
router.get("/:id/status", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const doc = await OrgVideo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await refreshBunny(doc);
    return res.json({ ok: true, item: serialize(doc) });
  } catch (err) {
    console.error("[admin.orgVideos] status failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
