// server/routes/admin.media.js
import express from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import cloudinary from "../cloudinary.js"; // configured v2 client
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { uploadAsset, deleteAsset } from "../utils/cloudinary.js";
import { uploadBufferToR2, isR2Configured } from "../utils/r2Upload.js";

const router = express.Router();

// Gate the whole router once
router.use(requireAuth, requireAdmin);

// memory storage keeps file in RAM so we can stream it to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// larger limit for video uploads (up to 200MB)
const uploadLarge = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

/**
 * POST /admin/media/sign
 * Returns signature for signed client upload
 */
router.post("/sign", async (req, res) => {
  try {
    const {
      resource_type = "video",
      folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "adlm/previews",
      public_id,
      eager,
    } = req.body || {};

    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signs only known params (not resource_type)
    const paramsToSign = { timestamp, folder };
    if (public_id) paramsToSign.public_id = public_id;
    if (eager) paramsToSign.eager = eager;
    // raw uploads (PDFs, etc.) need public access mode to be viewable
    if (resource_type === "raw") paramsToSign.access_mode = "public";

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.json({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      resource_type, // returned for client to pick /image|/video endpoint
      ...(public_id ? { public_id } : {}),
      ...(eager ? { eager } : {}),
      ...(resource_type === "raw" ? { access_mode: "public" } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to sign" });
  }
});

/**
 * POST /admin/media/upload-file
 * multipart/form-data { file: <binary> }
 * optional: body/query { folder, publicId }
 * Streams buffer to Cloudinary with upload_stream
 */
router.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const { folder, publicId, resourceType } = { ...req.body, ...req.query };
    const out = await uploadBufferToCloudinary(req.file.buffer, {
      folder,
      publicId,
      resourceType: resourceType || "video",
    });
    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Upload failed" });
  }
});

/**
 * POST /admin/media/upload-url { url, folder?, publicId?, resourceType? }
 * Server-side ingestion of remote URL
 */
router.post("/upload-url", async (req, res) => {
  try {
    const { url, folder, publicId, resourceType } = req.body || {};
    if (!url) return res.status(400).json({ error: "url is required" });

    const out = await uploadAsset({
      file: url,
      folder,
      publicId,
      resourceType: resourceType || "video",
    });
    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Upload failed" });
  }
});

/** POST /admin/media/delete { publicId, resourceType? } */
router.post("/delete", async (req, res) => {
  const { publicId, resourceType } = req.body || {};
  if (!publicId) return res.status(400).json({ error: "publicId required" });
  const out = await deleteAsset(publicId, resourceType || "video");
  return res.json(out);
});

/**
 * POST /admin/media/preview-url { url, durationSec?, startSec? }
 * Build a delivery transform for a clipped preview (no reupload)
 */
router.post("/preview-url", (req, res) => {
  try {
    const { url, durationSec = 60, startSec = 0 } = req.body || {};
    if (!url) return res.status(400).json({ error: "url required" });

    const previewUrl = url.replace(
      /\/upload\/(?!.*\/)/,
      `/upload/so_${startSec},du_${durationSec}/`
    );

    return res.json({ previewUrl });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e.message || "Failed to build preview" });
  }
});

router.get("/assets", async (req, res) => {
  const {
    type = "image",
    prefix = "",
    max = 24,
    next: next_cursor,
    q = "",
  } = req.query;

  try {
    const opts = {
      type: "upload",
      resource_type: type === "video" ? "video" : "image",
      max_results: Math.min(Number(max) || 24, 100),
      prefix: prefix || undefined,
      next_cursor: next_cursor || undefined,
    };

    const out = await cloudinary.api.resources(opts);
    let items = out.resources.map((r) => ({
      public_id: r.public_id,
      url: r.secure_url,
      format: r.format,
      bytes: r.bytes,
      width: r.width,
      height: r.height,
      created_at: r.created_at,
    }));

    const ql = (q || "").toLowerCase();
    if (ql) {
      items = items.filter(
        (x) =>
          x.public_id.toLowerCase().includes(ql) ||
          x.url.toLowerCase().includes(ql)
      );
    }

    res.json({ items, next: out.next_cursor || null });
  } catch (e) {
    res.status(500).json({ error: e.message || "Cloudinary list failed" });
  }
});

/**
 * POST /admin/media/upload-video-r2
 * Uploads a video file to Cloudflare R2 (for large files >10MB).
 * R2 serves with correct Content-Type so videos play in-browser.
 */
router.post("/upload-video-r2", uploadLarge.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    if (!isR2Configured()) {
      return res.status(500).json({
        error: "Cloudflare R2 is not configured.",
      });
    }

    const mime = req.file.mimetype || "video/mp4";
    const ext = (req.file.originalname || "video.mp4").split(".").pop() || "mp4";
    const key = `adlm/videos/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const out = await uploadBufferToR2(req.file.buffer, {
      key,
      contentType: mime,
    });

    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Video upload failed" });
  }
});

/**
 * POST /admin/media/upload-certificate
 * Uploads a PDF certificate template to Cloudflare R2.
 * R2 serves files with correct Content-Type so PDFs open in-browser.
 */
router.post("/upload-certificate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const mime = req.file.mimetype || "";
    if (mime !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    if (!isR2Configured()) {
      return res.status(500).json({
        error: "Cloudflare R2 is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.",
      });
    }

    const key = `adlm/certificates/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const out = await uploadBufferToR2(req.file.buffer, {
      key,
      contentType: "application/pdf",
    });

    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Certificate upload failed" });
  }
});

export default router;
