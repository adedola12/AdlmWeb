// server/models/WorkItem.js
//
// One piece of ADLM work on the work board (docs/WORK_BOARD.md): a feature,
// a fix, a button, a release, anything that changes what a customer sees.
//
// Two jobs in one record:
//   1. Visibility. The release approver sees everything in flight across
//      every product, with what is left and what it is waiting on.
//   2. Approval before build. From 22 Sep 2026 a new feature or button starts
//      life as a proposal with its business case written out. It may not move
//      past "proposed" until the approver approves it (util/workBoard.js
//      enforces that), and the design track runs beside the build so the
//      approver can design while it is being coded.
//
// Work that was already under way on 22 Sep 2026 is recorded with decision
// "grandfathered": it can keep moving, and the approver can still weigh in.
import mongoose from "mongoose";
import { DECISIONS, DESIGN_STATUSES, KINDS, PRODUCTS, STAGES } from "../util/workBoard.js";

const text = (max = 4000) => ({ type: String, trim: true, default: "", maxlength: max });

const CommentSchema = new mongoose.Schema(
  {
    by: { type: String, trim: true, lowercase: true, default: "" },
    byName: text(120),
    at: { type: Date, default: Date.now },
    text: text(4000),
  },
  { _id: true },
);

const WorkItemSchema = new mongoose.Schema(
  {
    // Stable key for seeded rows, so re-running the seed updates, never duplicates.
    key: { type: String, trim: true, lowercase: true, default: undefined },

    title: { type: String, trim: true, required: true, maxlength: 200 },
    summary: text(2000),
    products: { type: [{ type: String, enum: PRODUCTS }], default: [] },
    kind: { type: String, enum: KINDS, default: "feature" },
    stage: { type: String, enum: STAGES, default: "proposed", index: true },

    // The business case. Required to propose a new feature (see
    // missingBusinessCase in util/workBoard.js).
    businessCase: {
      problem: text(),       // what hurts today, for whom
      whoBenefits: text(),   // customers, firms, students, staff
      value: text(),         // revenue, retention, time saved, support load
      cost: text(),          // build effort, running cost, AI spend
      risks: text(),         // what could go wrong, what it could break
      successMetric: text(), // how we will know it worked
      alternatives: text(),  // including "do nothing"
    },

    // The design track, run by the approver beside the build.
    design: {
      status: { type: String, enum: DESIGN_STATUSES, default: "needed" },
      surfaces: text(),      // screens, buttons, dialogs affected
      link: text(500),       // Figma / staged page / prototype
      notes: text(),
      updatedBy: { type: String, trim: true, lowercase: true, default: "" },
      updatedAt: { type: Date, default: null },
    },

    decision: {
      status: { type: String, enum: DECISIONS, default: "pending", index: true },
      by: { type: String, trim: true, lowercase: true, default: "" },
      at: { type: Date, default: null },
      note: text(),
    },

    // Where it stands, in plain words.
    progress: text(),        // what is done
    pending: text(),         // what is left
    blockedOn: text(1000),   // who or what it waits on
    refs: text(1000),        // repos, branches, PRs

    submittedBy: { type: String, trim: true, lowercase: true, default: "" },
    submittedAt: { type: Date, default: Date.now },
    sortOrder: { type: Number, default: 0 },

    comments: { type: [CommentSchema], default: [] },
  },
  { timestamps: true },
);

WorkItemSchema.index({ key: 1 }, { unique: true, sparse: true });

export const WorkItem = mongoose.models.WorkItem || mongoose.model("WorkItem", WorkItemSchema);
