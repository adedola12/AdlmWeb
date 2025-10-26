// server/routes/adminBunny.js
import express from "express";
import multer from "multer";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
const upload = multer();

// Set these in your env (.env)
// BUNNY_STREAM_API_KEY=ff8e05e6e-... (from dashboard screenshot)
// BUNNY_STREAM_LIB_ID=518947          (from dashboard screenshot)
const API_KEY = process.env.BUNNY_STREAM_API_KEY;
const LIB_ID = process.env.BUNNY_STREAM_LIB_ID;

// Create a video container (returns videoId/guid)
router.post("/create", requireAdmin, express.json(), async (req, res) => {
  try {
    const title = req.body?.title || `upload-${Date.now()}`;
    const r = await fetch(
      `https://video.bunnycdn.com/library/${LIB_ID}/videos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          AccessKey: API_KEY,
        },
        body: JSON.stringify({ title }),
      }
    );
    if (!r.ok) {
      const t = await r.text();
      return res.status(400).json({ error: `Create failed: ${t}` });
    }
    const j = await r.json(); // {guid: "...", id: number, ...}
    // We will use guid as the <VIDEO_ID> for embeds/uploads
    const videoId = j.guid;
    const shorthand = `bunny:${LIB_ID}:${videoId}`;
    const embed = `https://iframe.mediadelivery.net/embed/${LIB_ID}/${videoId}`;
    res.json({ libId: LIB_ID, videoId, shorthand, embed, raw: j });
  } catch (e) {
    res.status(500).json({ error: e.message || "Create failed" });
  }
});

// Upload bytes to that videoId
router.post(
  "/upload",
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
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

      if (!put.ok) {
        const t = await put.text();
        return res.status(400).json({ error: `Upload failed: ${t}` });
      }

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

// (Optional) basic status
router.get("/status/:videoId", requireAdmin, async (req, res) => {
  const r = await fetch(
    `https://video.bunnycdn.com/library/${LIB_ID}/videos/${req.params.videoId}`,
    { headers: { AccessKey: API_KEY } }
  );
  const j = await r.json();
  res.json(j);
});

export default router;
