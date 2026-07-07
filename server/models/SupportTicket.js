// server/models/SupportTicket.js
// User-raised technical-support requests. Captures the issue plus the user's
// AnyDesk address so the technical team can connect remotely, and a schedule
// slot + status workflow so tickets can be triaged and planned.
import mongoose from "mongoose";

const SupportTicketSchema = new mongoose.Schema(
  {
    // Requester (snapshotted so the ticket stays readable even if the user
    // record changes later).
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    userEmail: { type: String, trim: true, lowercase: true, default: "" },
    userFullName: { type: String, trim: true, default: "" },
    whatsapp: { type: String, trim: true, default: "" },

    // What's wrong
    title: { type: String, trim: true, required: true, maxlength: 200 },
    description: { type: String, trim: true, default: "", maxlength: 5000 },
    productKey: { type: String, trim: true, lowercase: true, default: "" },

    // Which ADLM software raised this ticket — lets the same endpoint be reused
    // by the website and every desktop plugin. Free-form so new products don't
    // need a schema change (e.g. "web", "revit-plugin", "quiv", "heron", "mep").
    source: { type: String, trim: true, lowercase: true, default: "web" },
    appVersion: { type: String, trim: true, default: "" },

    category: {
      type: String,
      enum: ["technical", "billing", "account", "general", "feature-request"],
      default: "technical",
      index: true,
    },

    // Screenshots of the issue (Cloudinary). Route enforces max 5 files of
    // 2MB each; publicId kept so images can be cleaned up on ticket delete.
    images: {
      type: [
        {
          _id: false,
          url: { type: String, required: true },
          publicId: { type: String, default: "" },
          bytes: { type: Number, default: 0 },
        },
      ],
      default: [],
    },

    // Remote support
    anyDeskAddress: { type: String, trim: true, default: "" },

    // Workflow
    status: {
      type: String,
      enum: ["open", "scheduled", "in-progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    scheduledForFixingAt: { type: Date, default: null, index: true },
    adminNotes: { type: String, trim: true, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, scheduledForFixingAt: 1 });

export const SupportTicket =
  mongoose.models.SupportTicket ||
  mongoose.model("SupportTicket", SupportTicketSchema);
