import express from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { ProductDeployment } from "../models/ProductDeployment.js";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { isR2Configured, uploadBufferToR2, deleteFromR2, listFromR2 } from "../utils/r2Upload.js";
import { deleteAsset } from "../utils/cloudinary.js";
import cloudinary from "../utils/cloudinaryConfig.js";

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

  // cleanTargetOnUpdate + preservePatterns are persisted in the schema and
  // consumed by InstallerHub on update installs. Earlier this function
  // dropped them, so every admin save silently wiped the "preserve user
  // data files when updating" behavior — meaning re-saving a manifest
  // through the admin UI quietly downgraded its update semantics.
  const preservePatterns = Array.isArray(raw.preservePatterns)
    ? raw.preservePatterns.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  return {
    type,
    source,
    target,
    overwrite: raw.overwrite !== false,
    cleanTargetOnUpdate: !!raw.cleanTargetOnUpdate,
    preservePatterns,
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

  const result = {
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

  // sha256, envVars, and localRandomVars are only included in the update
  // when the caller explicitly provided them in the request body. A PUT
  // from the InstallerHub admin editor (which doesn't yet know about
  // these fields) just omits them, so $set won't touch them and the
  // previously-configured values persist across package updates.

  if (Object.prototype.hasOwnProperty.call(body, "sha256")) {
    const sha256 = String(body.sha256 || "").trim().toLowerCase();
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error("sha256 must be a 64-character lowercase hex string");
    }
    result.sha256 = sha256;
  }

  if (Object.prototype.hasOwnProperty.call(body, "envVars")) {
    // envVars may arrive as a plain object { key: value }. We validate
    // shape and coerce values to strings. Keys must match ^ADLM_[A-Z0-9_]+$
    // so a bad payload can't inject arbitrary vars like PATH or COMSPEC.
    const envVarsIn = body.envVars;
    const envVars = {};
    if (envVarsIn && typeof envVarsIn === "object" && !Array.isArray(envVarsIn)) {
      for (const [k, v] of Object.entries(envVarsIn)) {
        const name = String(k || "").trim();
        if (!name) continue;
        if (!/^ADLM_[A-Z0-9_]+$/.test(name)) continue;
        envVars[name] = String(v ?? "");
      }
    }
    // Pass `null` explicitly to clear previously-configured envVars;
    // otherwise store the (possibly empty) object.
    result.envVars = envVarsIn === null ? {} : envVars;
  }

  if (Object.prototype.hasOwnProperty.call(body, "localRandomVars")) {
    result.localRandomVars = Array.isArray(body.localRandomVars)
      ? body.localRandomVars
          .map((v) => String(v || "").trim())
          .filter((v) => /^ADLM_[A-Z0-9_]+$/.test(v))
      : [];
  }

  return result;
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

// ── Package files (list all uploaded files from cloud storage) ──
// Must be defined BEFORE /:productKey to avoid being caught by it.

router.get(
  "/packages",
  asyncHandler(async (_req, res) => {
    const items = [];

    // List R2 files
    try {
      const r2Items = await listFromR2("adlm/installers");
      items.push(...r2Items);
    } catch (err) {
      // R2 not configured or error — skip silently
    }

    // List Cloudinary raw files in the installers folder
    try {
      const folder = process.env.CLOUDINARY_INSTALLERS_FOLDER || "adlm/installers";
      let nextCursor;
      do {
        const result = await cloudinary.api.resources({
          type: "upload",
          resource_type: "raw",
          prefix: folder,
          max_results: 500,
          ...(nextCursor ? { next_cursor: nextCursor } : {}),
        });

        for (const r of result.resources || []) {
          items.push({
            publicId: r.public_id,
            originalName: (r.public_id || "").split("/").pop() || r.public_id,
            packageUri: r.secure_url,
            bytes: r.bytes || 0,
            storageProvider: "cloudinary",
            createdAt: r.created_at || null,
          });
        }

        nextCursor = result.next_cursor;
      } while (nextCursor);
    } catch (err) {
      // Cloudinary not configured or error — skip silently
    }

    // Sort newest first
    items.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });

    return res.json({ ok: true, items });
  }),
);

router.delete(
  "/packages/:publicId",
  asyncHandler(async (req, res) => {
    const publicId = decodeURIComponent(String(req.params.publicId || "").trim());
    if (!publicId) {
      return res.status(400).json({ error: "publicId is required" });
    }

    const errors = [];

    // Try R2 deletion
    try {
      const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
      if (publicBaseUrl && isR2Configured()) {
        await deleteFromR2(publicId);
      }
    } catch (err) {
      errors.push(`R2: ${err.message}`);
    }

    // Try Cloudinary deletion
    try {
      await deleteAsset(publicId, "raw");
    } catch (err) {
      errors.push(`Cloudinary: ${err.message}`);
    }

    return res.json({
      ok: true,
      deletedPublicId: publicId,
      errors: errors.length > 0 ? errors : undefined,
    });
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

