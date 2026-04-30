import mongoose from "mongoose";

/**
 * Software — a reusable installer + install-video pair that can be attached
 * to one or more PaidCourse documents via PaidCourse.softwareIds.
 *
 * Why a separate collection: most courses share the same handful of
 * installers (Revit, Civil 3D, PlanSwift, etc.). Storing them once and
 * referencing them keeps the admin from re-uploading the same .exe/.apk
 * across every course it appears in.
 */
const SoftwareSchema = new mongoose.Schema(
  {
    // Display name shown on the user's course page (e.g. "PlanSwift 10.3").
    name: { type: String, required: true, trim: true },

    // Free-text vendor/blurb shown beneath the name.
    description: { type: String, default: "", trim: true },

    // installer = Windows .exe/.msi/.zip/.msix etc.
    // apk       = Android package
    // other     = anything else (zips, archives, configs)
    kind: {
      type: String,
      enum: ["installer", "apk", "other"],
      default: "installer",
    },

    // Public URL — Cloudflare R2 or Cloudinary, populated by the admin
    // upload widget or pasted manually.
    fileUrl: { type: String, default: "", trim: true },
    fileSha256: { type: String, default: "", trim: true, lowercase: true },
    fileSize: { type: Number, default: 0 },
    fileOriginalName: { type: String, default: "", trim: true },
    storageProvider: {
      type: String,
      enum: ["r2", "cloudinary", "external", ""],
      default: "",
    },

    version: { type: String, default: "", trim: true },

    // YouTube/Cloudinary/R2 URL of an installation walkthrough.
    installVideoUrl: { type: String, default: "", trim: true },

    // Set to false to hide from the admin picker without deleting.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SoftwareSchema.index({ name: 1 });
SoftwareSchema.index({ isActive: 1 });

export const Software =
  mongoose.models.Software || mongoose.model("Software", SoftwareSchema);
