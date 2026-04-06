import express from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { ProductDeployment } from "../models/ProductDeployment.js";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { isR2Configured, uploadBufferToR2, deleteFromR2 } from "../utils/r2Upload.js";
import { deleteAsset } from "../utils/cloudinary.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

router.use(requireAuth, requireAdmin);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const DEFAULT_R2_THRESHOLD_BYTES = 8 * 1024 * 1024;

function getR2ThresholdBytes() {
  const raw = Number(process.env.INSTALLER_R2_THRESHOLD_BYTES || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_R2_THRESHOLD_BYTES;
}

function sanitizeBaseName(value, fallback) {
  return String(value || fallback || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function sanitizeFileName(value, fallback) {
  return String(value || fallback || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function getOriginalName(file) {
  return String(file?.originalname || "package.bin").trim() || "package.bin";
}

function getPackageKindFromName(name) {
  return String(name || "").toLowerCase().endsWith(".zip") ? "zip" : "file";
}

function getUploadFolder(req) {
  return (
    String(req.body?.folder || process.env.CLOUDINARY_INSTALLERS_FOLDER || "adlm/installers").trim() ||
    "adlm/installers"
  );
}

function buildUploadNames(req) {
  const originalName = getOriginalName(req.file);
  const folder = getUploadFolder(req);
  const fallbackBase = `package-${Date.now()}`;
  const requestedId = req.body?.publicId || originalName || fallbackBase;
  const baseName = sanitizeBaseName(requestedId, fallbackBase);
  const safeOriginalName = sanitizeFileName(originalName, "package.bin");

  return {
    folder,
    originalName,
    baseName,
    fileName: safeOriginalName,
    packageKind: getPackageKindFromName(originalName),
  };
}

function normalizeOperation(raw) {
  if (!raw) return null;

  const typeRaw = String(raw.type || "copyDirectory").trim().toLowerCase();
  let type = "copyDirectory";
  if (typeRaw === "copyfile") type = "copyFile";
  if (typeRaw === "createshortcut") type = "createShortcut";
  if (typeRaw === "hidedirectory") type = "hideDirectory";
  if (typeRaw === "runexe") type = "runExe";

  const sourceDefault = type === "copyDirectory" || type === "hideDirectory" ? "." : "";
  const source = String(raw.source ?? sourceDefault).trim() || sourceDefault;
  const target = String(raw.target || "").trim();

  if (!target) return null;

  return {
    type,
    source,
    target,
    overwrite: raw.overwrite !== false,
    notes: String(raw.notes || "").trim(),
  };
}

function normalizeDeployment(body = {}, productKeyOverride = "") {
  const productKey = String(productKeyOverride || body.productKey || "")
    .trim()
    .toLowerCase();

  if (!productKey) {
    throw new Error("productKey is required");
  }

  const packageUri = String(body.packageUri || "").trim();
  const packageKindRaw = String(
    body.packageKind || (packageUri.toLowerCase().endsWith(".zip") ? "zip" : "file"),
  )
    .trim()
    .toLowerCase();

  return {
    productKey,
    displayName: String(body.displayName || "").trim(),
    packageUri,
    packageKind: packageKindRaw === "zip" ? "zip" : "file",
    version: String(body.version || "").trim(),
    installArguments: String(body.installArguments || "").trim(),
    waitForExit: !!body.waitForExit,
    markInstalledAfterLaunch: body.markInstalledAfterLaunch !== false,
    requiresElevation: body.requiresElevation !== false,
    operations: Array.isArray(body.operations)
      ? body.operations.map(normalizeOperation).filter(Boolean)
      : [],
    enabled: body.enabled !== false,
    notes: String(body.notes || "").trim(),
  };
}

router.post(
  "/upload-package",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const { folder, baseName, fileName, originalName, packageKind } = buildUploadNames(req);
    const thresholdBytes = getR2ThresholdBytes();
    const useR2 = req.file.size > thresholdBytes;

    if (useR2 && !isR2Configured()) {
      return res.status(503).json({
        error:
          "This package is larger than 8 MB and Cloudflare R2 is not configured yet. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL on the server.",
      });
    }

    let out;
    let storageProvider = "cloudinary";

    if (useR2) {
      const objectKey = `${folder.replace(/^\/+|\/+$/g, "")}/${baseName}/${fileName}`;
      out = await uploadBufferToR2(req.file.buffer, {
        key: objectKey,
        contentType: req.file.mimetype || "application/octet-stream",
      });
      storageProvider = "r2";
    } else {
      out = await uploadBufferToCloudinary(req.file.buffer, {
        folder,
        publicId: baseName,
        resourceType: "raw",
      });
    }

    return res.json({
      ok: true,
      packageUri: out.secure_url,
      publicId: out.public_id,
      originalName,
      bytes: req.file.size,
      packageKind,
      storageProvider,
      thresholdBytes,
    });
  }),
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await ProductDeployment.find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    res.json({ ok: true, items });
  }),
);

router.get(
  "/:productKey",
  asyncHandler(async (req, res) => {
    const productKey = String(req.params.productKey || "").trim().toLowerCase();
    const item = await ProductDeployment.findOne({ productKey }).lean();

    if (!item) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    return res.json({ ok: true, item });
  }),
);

router.put(
  "/:productKey",
  asyncHandler(async (req, res) => {
    const actor = String(req.user?.email || "admin").trim();
    const productKey = String(req.params.productKey || "").trim().toLowerCase();
    const normalized = normalizeDeployment(req.body || {}, productKey);

    const item = await ProductDeployment.findOneAndUpdate(
      { productKey },
      {
        $set: {
          ...normalized,
          updatedBy: actor,
        },
        $setOnInsert: {
          createdBy: actor,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return res.json({ ok: true, item });
  }),
);

router.delete(
  "/:productKey",
  asyncHandler(async (req, res) => {
    const productKey = String(req.params.productKey || "").trim().toLowerCase();
    const out = await ProductDeployment.findOneAndDelete({ productKey });

    if (!out) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    // Clean up cloud-stored package file
    const packageUri = String(out.packageUri || "").trim();
    const cleanupErrors = [];

    if (packageUri) {
      try {
        const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
        if (publicBaseUrl && packageUri.startsWith(publicBaseUrl)) {
          // R2-hosted file — extract the object key from the URL
          const objectKey = decodeURIComponent(packageUri.slice(publicBaseUrl.length + 1));
          await deleteFromR2(objectKey);
        } else if (packageUri.includes("res.cloudinary.com")) {
          // Cloudinary-hosted file — extract public_id
          const match = packageUri.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
          if (match?.[1]) {
            await deleteAsset(match[1], "raw");
          }
        }
      } catch (err) {
        cleanupErrors.push(err.message || "Cloud cleanup failed");
      }
    }

    return res.json({
      ok: true,
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    });
  }),
);

export default router;

