// server/routes/me.orgVideos.js
//
// The organisation's shelf, from the account's side. Mounted at /me/org-videos.
//
// WHOSE SHELF
//
// Nothing on the account says "I am YSA" in one place. The firm's name sits on
// each entitlement (licenseType "organization" carries organizationName) and,
// for accounts that signed up as a company, on the account itself. So the
// shelf is every published video filed under any of those names, normalised
// the same way the admin screen normalises them when filing (see orgKeyOf).
//
// An expired licence still gets the shelf. A demo recorded for a firm is not
// a thing that stops being theirs when the subscription lapses — and a lapsed
// firm watching "here is what you had" is a renewal, not a leak.

import express from "express";
import mongoose from "mongoose";
import { OrgVideo, orgKeyOf } from "../models/OrgVideo.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { bunnyEmbedUrl } from "../utils/bunnyStream.js";

const router = express.Router();
router.use(requireAuth);

async function orgKeysFor(userId) {
  const u = await User.findById(userId, {
    organizationName: 1,
    "entitlements.organizationName": 1,
  }).lean();
  if (!u) return { keys: [], names: [] };
  const names = new Map();
  const add = (n) => {
    const key = orgKeyOf(n);
    if (key && !names.has(key)) names.set(key, String(n).trim());
  };
  add(u.organizationName);
  for (const e of u.entitlements || []) add(e.organizationName);
  return { keys: [...names.keys()], names: [...names.values()] };
}

function forViewer(v) {
  const bunnyReady =
    v.source !== "bunny" ||
    v.bunny?.status == null ||
    v.bunny.status === 4 ||
    v.bunny.status === 8 ||
    (v.bunny.status === 3 && (v.bunny.encodeProgress || 0) >= 100);
  return {
    id: String(v._id),
    title: v.title,
    description: v.description || "",
    orgName: v.orgName,
    source: v.source,
    videoUrl: v.videoUrl || "",
    // A Bunny row plays through the embed; the client's parseBunny handles the
    // shorthand too, but the resolved URL saves it the work.
    embedUrl:
      v.source === "bunny" && v.bunny?.videoId
        ? v.bunny.libId
          ? `https://iframe.mediadelivery.net/embed/${v.bunny.libId}/${v.bunny.videoId}`
          : bunnyEmbedUrl(v.bunny.videoId)
        : "",
    ready: bunnyReady,
    thumbnailUrl: v.thumbnailUrl || "",
    durationSec: v.durationSec || 0,
    createdAt: v.createdAt,
  };
}

// GET /me/org-videos
router.get("/", async (req, res) => {
  try {
    const uid = req.user?.id || req.user?._id;
    const { keys, names } = await orgKeysFor(uid);
    if (!keys.length) return res.json({ ok: true, organisation: "", organisations: [], items: [] });

    const rows = await OrgVideo.find({ orgKey: { $in: keys }, isPublished: true })
      .sort({ sort: 1, createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      organisation: names[0] || "",
      organisations: names,
      items: rows.map(forViewer),
    });
  } catch (err) {
    console.error("[me.orgVideos] list failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /me/org-videos/:id/watched — one line in the row's watch log, so the
// admin table can say "YSA opened this on Tuesday" rather than nothing.
router.post("/:id/watched", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "Not found" });
    const uid = req.user?.id || req.user?._id;
    const { keys } = await orgKeysFor(uid);
    const doc = await OrgVideo.findOne({ _id: id, orgKey: { $in: keys }, isPublished: true });
    if (!doc) return res.status(404).json({ error: "Not found" });

    const me = String(uid);
    const w = doc.watches.find((x) => String(x.userId) === me);
    if (w) {
      w.lastAt = new Date();
      w.count = (w.count || 0) + 1;
    } else if (doc.watches.length < 500) {
      doc.watches.push({ userId: uid, email: req.user?.email || "" });
    }
    doc.viewCount = (doc.viewCount || 0) + 1;
    await doc.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error("[me.orgVideos] watched failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
