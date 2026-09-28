// server/routes/admin.media.js
import express from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import cloudinary from "../cloudinary.js"; // configured v2 client
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { uploadAsset, deleteAsset } from "../utils/cloudinary.js";
import { HUB_KEY, HUB_CONTENT_TYPE, hubUploadProblem, looksLikeHubInstaller } from "../util/hubStorage.js";
import {
  uploadBufferToR2,
  isR2Configured,
  createPresignedPutUrl,
} from "../utils/r2Upload.js";
import { fileStoreBackend, presignUpload, headFile } from "../util/fileStore.js";
import { DOWNLOADS, forgetStored } from "../util/downloadLinks.js";

const router = express.Router();

// Gate the whole router once
router.use(requireAuth, requireAdmin);

// Allowed MIME types for the general media upload (images, video, PDFs).
// Everything else is rejected before buffering — prevents arbitrary file
// uploads (scripts, executables, etc.).
const ALLOWED_MEDIA_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_MEDIA_MIME_EXACT = new Set([
  "application/pdf",
]);

function mediaFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || "").toLowerCase();
  const ok =
    ALLOWED_MEDIA_MIME_EXACT.has(mime) ||
    ALLOWED_MEDIA_MIME_PREFIXES.some((p) => mime.startsWith(p));
  if (ok) return cb(null, true);
  cb(new Error(`Unsupported file type: ${mime || "unknown"}`));
}

function videoFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || "").toLowerCase();
  if (mime.startsWith("video/")) return cb(null, true);
  cb(new Error(`Unsupported file type for video upload: ${mime || "unknown"}`));
}

function pdfFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || "").toLowerCase();
  if (mime === "application/pdf") return cb(null, true);
  cb(new Error(`Only PDF files are allowed (got: ${mime || "unknown"})`));
}

// memory storage keeps file in RAM so we can stream it to Cloudinary
// 10MB is plenty for images, short clips, and PDFs. Videos use uploadLarge.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: mediaFileFilter,
});

// larger limit for video uploads (up to 200MB), restricted to video MIME
const uploadLarge = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: videoFileFilter,
});

// dedicated certificate/PDF uploader
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: pdfFileFilter,
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
 * POST /admin/media/upload-installer
 * Uploads a course software installer (.exe/.msi/.zip, AdminCourses) to R2 if
 * large, Cloudinary otherwise. Returns secure_url + sha256 (for integrity
 * display). These are PUBLIC links.
 *
 * Not for the Installer Hub. The Hub is for paid accounts only and lives in
 * the private file store (see /installer-upload-url below); a Hub build sent
 * here is refused. Course software used to share the Hub's public prefix
 * (adlm/installer-hub); it now has its own, so nothing new lands there.
 */
const INSTALLER_EXT_RE = /\.(exe|msi|zip|7z|appx|appxbundle|msix|msixbundle)$/;
const COURSE_SOFTWARE_PREFIX = "adlm/course-software";
const HUB_GOES_TO_SETTINGS =
  "The Installer Hub is uploaded in Admin → Site Settings → Installer Hub, which keeps it in private storage behind the paid-licence check.";

const uploadInstaller = multer({
  storage: multer.memoryStorage(),
  // 500MB cap — installers are usually much smaller, but headroom for combined
  // bundles. Cloudinary path will reject anything > its own limit; R2 won't.
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || "").toLowerCase();
    if (INSTALLER_EXT_RE.test(name)) return cb(null, true);
    cb(new Error("Only installer files (.exe, .msi, .zip, .7z, .appx, .msix) are allowed"));
  },
});

/**
 * POST /admin/media/installer-upload-url { filename, size? }
 *
 * Site Settings → Installer Hub → Upload installer. A presigned PUT straight
 * into ADLM's PRIVATE file store (util/fileStore.js: S3 once FILES_BUCKET is
 * set, else the private R2 installers bucket) at the one key the paid gate
 * serves the Hub from (DOWNLOADS["installer-hub"], R3). The browser sends the
 * bytes to storage directly, because the API runs on Lambda, whose request
 * bodies stop at 6 MB. Uploading again replaces the Hub in place.
 *
 * It used to sign a PUT into the PUBLIC bucket under adlm/installer-hub and
 * hand back that public URL for Setting.installerHubUrl, so anyone with the
 * link skipped the gate. There is no public URL any more: the stored
 * reference is the private key, and customers only ever get a short-lived
 * signed link from /me/downloads/installer-hub. Same shape as the Android
 * app's /apk-upload-url.
 */
router.post("/installer-upload-url", async (req, res) => {
  const problem = hubUploadProblem({ filename: req.body?.filename, size: req.body?.size });
  if (problem) return res.status(400).json({ error: problem });
  const backend = fileStoreBackend();
  if (!backend) {
    return res.status(503).json({
      error: "Private file storage is not configured, so the Installer Hub cannot be uploaded here.",
    });
  }
  try {
    const signed = await presignUpload({ key: HUB_KEY, contentType: HUB_CONTENT_TYPE, expiresIn: 3600 });
    return res.json({
      ok: true,
      originalName: String(req.body.filename).trim(),
      fileName: DOWNLOADS["installer-hub"].fileName,
      uploadUrl: signed.uploadUrl,
      key: HUB_KEY,
      contentType: HUB_CONTENT_TYPE,
      storage: signed.storage,
      expiresIn: signed.expiresIn,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not create an upload URL" });
  }
});

/**
 * POST /admin/media/installer-uploaded
 *
 * Confirms the Hub landed at its private key and serves it straight away on
 * this container (other warm containers pick it up within their five-minute
 * cache). Answers with the key, never a URL.
 */
router.post("/installer-uploaded", async (_req, res) => {
  try {
    const backend = fileStoreBackend();
    const head = backend ? await headFile({ key: HUB_KEY }) : null;
    if (!head) {
      return res.status(404).json({ error: "The Installer Hub did not finish uploading. Please upload it again." });
    }
    forgetStored(HUB_KEY);
    return res.json({ ok: true, key: HUB_KEY, bytes: head.size ?? null, storage: backend });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not check the upload" });
  }
});

router.post("/upload-installer", uploadInstaller.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const original = req.file.originalname || "installer.bin";
    if (looksLikeHubInstaller(original)) {
      return res.status(400).json({ error: HUB_GOES_TO_SETTINGS });
    }
    const safeName = original.replace(/[^a-zA-Z0-9._-]/g, "_");
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    // Route by size: anything over the deployments threshold (default 8MB)
    // goes to R2 since Cloudinary's free tier rejects large raw files.
    const R2_THRESHOLD = Number(process.env.INSTALLER_R2_THRESHOLD_BYTES || 8 * 1024 * 1024);
    const useR2 = req.file.size > R2_THRESHOLD;

    if (useR2 && !isR2Configured()) {
      return res.status(503).json({
        error: "File is larger than the Cloudinary threshold and Cloudflare R2 is not configured.",
      });
    }

    let out;
    let storageProvider;
    if (useR2) {
      const key = `${COURSE_SOFTWARE_PREFIX}/${Date.now()}-${safeName}`;
      out = await uploadBufferToR2(req.file.buffer, {
        key,
        contentType: req.file.mimetype || "application/octet-stream",
      });
      storageProvider = "r2";
    } else {
      out = await uploadBufferToCloudinary(req.file.buffer, {
        folder: COURSE_SOFTWARE_PREFIX,
        publicId: safeName.replace(/\.[^.]+$/, ""),
        resourceType: "raw",
      });
      storageProvider = "cloudinary";
    }

    return res.json({
      ok: true,
      secure_url: out.secure_url,
      public_id: out.public_id,
      storageProvider,
      bytes: req.file.size,
      sha256,
      originalName: original,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Installer upload failed" });
  }
});

/**
 * POST /admin/media/upload-apk
 * Uploads an Android APK to R2. APKs are typically large (30–150MB) and
 * Cloudinary's raw uploads are unreliable above ~10MB on the free tier,
 * so this endpoint always uses R2.
 *
 * Used by Site Settings → Mobile App URL field to replace the manual paste.
 */
const uploadApk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".apk") || name.endsWith(".aab")) return cb(null, true);
    cb(new Error("Only .apk or .aab files are allowed"));
  },
});

router.post("/upload-apk", uploadApk.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    if (!isR2Configured()) {
      return res.status(503).json({
        error: "Cloudflare R2 is not configured. APK uploads require R2 (Cloudinary cannot serve large APKs reliably).",
      });
    }

    const original = req.file.originalname || "app.apk";
    const safeName = original.replace(/[^a-zA-Z0-9._-]/g, "_");
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    const key = `adlm/mobile-app/${Date.now()}-${safeName}`;
    const out = await uploadBufferToR2(req.file.buffer, {
      key,
      // android-package-archive plays nicest with browsers offering
      // "open with" / "download" rather than displaying inline.
      contentType: original.endsWith(".aab")
        ? "application/octet-stream"
        : "application/vnd.android.package-archive",
    });

    return res.json({
      ok: true,
      secure_url: out.secure_url,
      public_id: out.public_id,
      storageProvider: "r2",
      bytes: req.file.size,
      sha256,
      originalName: original,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "APK upload failed" });
  }
});

/**
 * POST /admin/media/apk-upload-url { filename, size? }
 *
 * A presigned PUT for the Android app, straight into ADLM's private file store
 * at the one key the site serves it from (DOWNLOADS.android, R15). Once the
 * file is there every "Download the app" button hands out a short-lived signed
 * link to it, and the Site Settings link (often a Google Drive file) is only
 * the fail-safe. The file goes from the browser to storage directly, because
 * /upload-apk sends it through the API and the API runs on Lambda, whose
 * request bodies stop at 6 MB: a 70 MB APK never arrived. Uploading again
 * replaces the app in place; there is only ever one.
 */
const APK_TYPE = "application/vnd.android.package-archive";
const APK_MAX_BYTES = 5 * 1024 * 1024 * 1024; // one PUT

router.post("/apk-upload-url", async (req, res) => {
  const name = String(req.body?.filename || "").trim();
  if (!/\.apk$/i.test(name)) {
    return res.status(400).json({ error: "Choose an .apk file (an .aab cannot be installed from the website)." });
  }
  const size = Number(req.body?.size || 0);
  if (size && size > APK_MAX_BYTES) {
    return res.status(400).json({ error: "That file is over the 5 GB upload limit." });
  }
  if (!fileStoreBackend()) {
    return res.status(503).json({ error: "Private file storage is not configured, so the app cannot be uploaded here." });
  }
  try {
    const { key } = DOWNLOADS.android;
    const signed = await presignUpload({ key, contentType: APK_TYPE, expiresIn: 3600 });
    return res.json({ ok: true, key, contentType: APK_TYPE, ...signed });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not create an upload URL" });
  }
});

/**
 * POST /admin/media/apk-uploaded
 *
 * Confirms the app landed and serves it straight away on this container
 * (other warm containers pick it up within their five-minute cache).
 */
router.post("/apk-uploaded", async (_req, res) => {
  const { key } = DOWNLOADS.android;
  try {
    const head = fileStoreBackend() ? await headFile({ key }) : null;
    if (!head) return res.status(404).json({ error: "The app did not finish uploading. Please upload it again." });
    forgetStored(key);
    return res.json({ ok: true, key, bytes: head.size ?? null, storage: fileStoreBackend() });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not check the upload" });
  }
});

/**
 * POST /admin/media/upload-certificate
 * Uploads a PDF certificate template to Cloudflare R2.
 * R2 serves files with correct Content-Type so PDFs open in-browser.
 */
router.post("/upload-certificate", uploadPdf.single("file"), async (req, res) => {
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
