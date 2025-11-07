// server/routes/adminBunny.js
import express from "express";
import multer from "multer";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
const upload = multer();

const API_KEY = process.env.BUNNY_STREAM_API_KEY; // from dashboard
const LIB_ID = process.env.BUNNY_STREAM_LIB_ID; // e.g. 518947

// Create Bunny video container
router.post("/create", requireAdmin, express.json(), async (req, res) => {
  if (!API_KEY || !LIB_ID) {
    return res.status(500).json({ error: "Bunny env vars missing" });
  }
  try {
    const title = req.body?.title || `upload-${Date.now()}`;
    const r = await fetch(
      `https://video.bunnycdn.com/library/${LIB_ID}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", AccessKey: API_KEY },
        body: JSON.stringify({ title }),
      }
    );
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    const j = await r.json(); // contains guid
    const videoId = j.guid;
    res.json({
      libId: LIB_ID,
      videoId,
      shorthand: `bunny:${LIB_ID}:${videoId}`,
      embed: `https://iframe.mediadelivery.net/embed/${LIB_ID}/${videoId}`,
      raw: j,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Create failed" });
  }
});

// Upload bytes to the created video
router.post(
  "/upload",
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    if (!API_KEY || !LIB_ID) {
      return res.status(500).json({ error: "Bunny env vars missing" });
    }
    try {
      const { videoId } = req.body || {};
      if (!videoId) return res.status(400).json({ error: "videoId required" });
      if (!req.file) return res.status(400).json({ error: "file required" });

      const put = await fetch(
        `https://video.bunnycdn.com/library/${LIB_ID}/videos/${videoId}`,
        {
          method: "PUT",
          headers: {
            AccessKey: API_KEY,
            "Content-Type": "application/octet-stream",
          },
          body: req.file.buffer,
        }
      );
      if (!put.ok) return res.status(400).json({ error: await put.text() });

      res.json({
        ok: true,
        libId: LIB_ID,
        videoId,
        shorthand: `bunny:${LIB_ID}:${videoId}`,
        embed: `https://iframe.mediadelivery.net/embed/${LIB_ID}/${videoId}`,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || "Upload failed" });
    }
  }
);

export default router;
