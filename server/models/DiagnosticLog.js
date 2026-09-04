// server/models/DiagnosticLog.js
//
// A redacted tail of a desktop plugin's diagnostic log, sent by users who joined
// the beta programme (POST /usage/logs). The plugin sends one about twice a day
// while it is open and one shortly after a view takes noticeably long to open,
// so the admin can read timings from the field instead of asking each user to
// find and email the file.
//
// The content is kept in the document itself: it is a few hundred lines of text,
// is only ever read inline by an admin, and needs no CDN. Documents expire after
// RETENTION_DAYS so a beta tester's logs do not accumulate forever, and the route
// also caps the number kept per user+product.
import mongoose from "mongoose";

export const RETENTION_DAYS = 90;
export const MAX_CONTENT_BYTES = 512 * 1024;

const DiagnosticLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    // Denormalised like UsageSession so the admin list needs no join.
    email: { type: String, trim: true, lowercase: true, default: "" },

    productKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    appVersion: { type: String, trim: true, default: "" },
    // Which Revit (or other host) build sent it, e.g. "2026".
    hostTarget: { type: String, trim: true, default: "" },
    // Why the plugin sent it: "first", "scheduled", "opt-in", "slow-open:bill", ...
    reason: { type: String, trim: true, default: "" },

    lineCount: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },

    // Lines the plugin's PerfLog wrote, pulled out so the list view can show the
    // headline timings without loading the whole file.
    perfLines: { type: [String], default: [] },

    content: { type: String, default: "" },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

DiagnosticLogSchema.index({ userId: 1, productKey: 1, createdAt: -1 });
DiagnosticLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 86400 },
);

export const DiagnosticLog =
  mongoose.models.DiagnosticLog ||
  mongoose.model("DiagnosticLog", DiagnosticLogSchema);
