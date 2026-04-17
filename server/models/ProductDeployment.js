import mongoose from "mongoose";

const InstallOperationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["copyDirectory", "copyFile", "createShortcut", "hideDirectory", "runExe"],
      default: "copyDirectory",
    },
    source: { type: String, trim: true, default: "." },
    target: { type: String, trim: true, required: true },
    overwrite: { type: Boolean, default: true },
    cleanTargetOnUpdate: { type: Boolean, default: false },
    preservePatterns: { type: [String], default: [] },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const ProductDeploymentSchema = new mongoose.Schema(
  {
    productKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    displayName: { type: String, trim: true, default: "" },
    packageUri: { type: String, trim: true, default: "" },
    packageKind: {
      type: String,
      enum: ["file", "zip"],
      default: "file",
    },
    version: { type: String, trim: true, default: "" },
    installArguments: { type: String, trim: true, default: "" },
    waitForExit: { type: Boolean, default: false },
    markInstalledAfterLaunch: { type: Boolean, default: true },
    requiresElevation: { type: Boolean, default: true },
    operations: { type: [InstallOperationSchema], default: [] },

    /**
     * Optional SHA-256 hash (lowercase hex) of the packaged file at
     * packageUri. InstallerHub verifies the downloaded package against this
     * value and refuses to install on mismatch — this is what protects
     * users if the CDN / storage bucket is ever compromised.
     * Leave empty for legacy packages; integrity check is skipped.
     */
    sha256: { type: String, trim: true, default: "" },

    /**
     * Secret environment variables to write to HKCU\Environment on the
     * user's machine during install. Keys are env var names, values are
     * literal secret strings.
     *
     * These MUST NEVER be logged or returned to unauthenticated clients.
     * The /me/deployments endpoint only returns them for users whose
     * entitlement for this productKey is "active" and not expired.
     *
     * Use Map so Mongoose doesn't try to interpret key names as paths.
     */
    envVars: {
      type: Map,
      of: String,
      default: undefined,
    },

    /**
     * Names of env vars that should be GENERATED on the user's machine
     * (cryptographically random 32 bytes -> 64 hex chars) and written to
     * HKCU\Environment — only if not already present, so reinstalls don't
     * invalidate existing encrypted data.
     *
     * Example: ["ADLM_MEP_ENCRYPTION_KEY"]
     *
     * These never cross the wire; each user's machine generates its own.
     */
    localRandomVars: { type: [String], default: [] },

    enabled: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: String, trim: true, default: "" },
    updatedBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true, minimize: false },
);

export const ProductDeployment =
  mongoose.models.ProductDeployment ||
  mongoose.model("ProductDeployment", ProductDeploymentSchema);

