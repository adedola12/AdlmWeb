// server/models/OutreachDraft.js
//
// The three emails Claude writes for one prospect contact: a first email and
// follow-ups for day 3 and day 7. Nothing leaves the building from here. A
// reviewer approves, edits then approves, or rejects each draft in the admin
// queue; phase 2's Sender picks up approved drafts.
//
// When a reviewer edits, the model's original text is kept in `original` so
// we can see how much the writer needed correcting (the phase 1 success
// metric is the share approved without heavy edits).
import mongoose from "mongoose";
import { PROSPECT_PRODUCTS } from "./IdealCustomerProfile.js";

export const DRAFT_STATUSES = ["pending_review", "approved", "rejected", "superseded"];

const EmailSchema = new mongoose.Schema(
  {
    step: { type: Number, enum: [0, 1, 2], required: true }, // 0 first, 1 and 2 follow-ups
    dayOffset: { type: Number, enum: [0, 3, 7], required: true },
    subject: { type: String, trim: true, required: true, maxlength: 200 },
    body: { type: String, trim: true, required: true, maxlength: 5000 },
  },
  { _id: false },
);

const threeEmails = {
  type: [EmailSchema],
  validate: {
    validator: (v) => Array.isArray(v) && v.length === 3 && v.map((e) => e.step).join() === "0,1,2",
    message: "A draft is exactly three emails, steps 0, 1 and 2 in order.",
  },
};

const OutreachDraftSchema = new mongoose.Schema(
  {
    prospectId: { type: mongoose.Schema.Types.ObjectId, ref: "Prospect", required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "ProspectContact", required: true },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "IdealCustomerProfile", required: true },
    product: { type: String, enum: PROSPECT_PRODUCTS, required: true },

    emails: threeEmails,
    // What the model wrote, before any reviewer edit. Empty until edited.
    original: { type: [EmailSchema], default: undefined },
    edited: { type: Boolean, default: false },

    status: { type: String, enum: DRAFT_STATUSES, default: "pending_review", index: true },
    reviewedBy: { type: String, trim: true, lowercase: true, default: "" },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, trim: true, default: "", maxlength: 2000 },

    // Which model wrote it, for comparing writers later.
    model: { type: String, trim: true, default: "", maxlength: 120 },
  },
  { timestamps: true },
);

OutreachDraftSchema.index({ status: 1, createdAt: 1 });

export const OutreachDraft =
  mongoose.models.OutreachDraft || mongoose.model("OutreachDraft", OutreachDraftSchema);

export default OutreachDraft;
