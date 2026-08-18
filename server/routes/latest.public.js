// server/routes/latest.public.js
//
// GET /latest — the published "Latest from ADLM" items, in the order the admin
// arranged them. Public and unauthenticated: it renders on every marketing
// page, including to visitors who have never signed in.
import express from "express";
import { LatestItem, KINDS } from "../models/LatestItem.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // The band shows four at a time in his design; allow a little headroom
    // but cap it so a misconfigured client cannot pull the whole collection.
    const limit = Math.min(12, Math.max(1, parseInt(req.query.limit, 10) || 6));

    const items = await LatestItem.find({ published: true })
      .sort({ sort: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      items: items.map((i) => ({
        id: String(i._id),
        kind: i.kind,
        // Resolve the chip here so every consumer shows the same wording.
        tag: i.tag || KINDS[i.kind] || "",
        title: i.title,
        blurb: i.blurb,
        imageUrl: i.imageUrl,
        ctaLabel: i.ctaLabel,
        ctaHref: i.ctaHref,
      })),
    });
  } catch (err) {
    console.error("[latest] list failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
