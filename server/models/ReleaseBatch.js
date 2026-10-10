// server/models/ReleaseBatch.js
//
// A batch: everything finished and waiting on the `release` branch, offered to
// the release approver as ONE thing to test and approve (docs/RELEASE_GATE.md).
//
// Richard is a designer, not a developer: he never opens GitHub. He tests the
// flows on preview.adlmstudio.net and in his Installer Hub, then presses
// Approve here. The approval is pinned to the exact commit he tested
// (`headSha`), so a push to `release` afterwards invalidates it and the batch
// has to be tested again. GitHub enforces this through a required status check
// that reads GET /release-gate/batch-status; nothing merges into main without
// a recorded approval of that commit.
import mongoose from "mongoose";

// One user flow on the test sheet. His verdict comes back the same way.
const ItemSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    where: { type: String, trim: true, default: "" },
    steps: { type: [String], default: [] },
    designUrl: { type: String, trim: true, default: "" },
    // "" until he says. "not-in-design" items take keep/change/remove instead.
    verdict: {
      type: String,
      enum: ["", "works", "needs-change", "could-not-test", "keep", "change", "remove"],
      default: "",
    },
    note: { type: String, trim: true, default: "" },
    kind: { type: String, enum: ["flow", "not-in-design", "behind-the-scenes"], default: "flow" },
  },
  { _id: false },
);

const ReleaseBatchSchema = new mongoose.Schema(
  {
    // Human name for the batch, e.g. "Batch 2 - shared projects and Hub 2.0".
    title: { type: String, trim: true, required: true },
    // The published test sheet he works from.
    sheetUrl: { type: String, trim: true, default: "" },

    repo: { type: String, trim: true, default: "ADLM-Studio/AdlmWeb" },
    fromBranch: { type: String, trim: true, default: "release" },
    toBranch: { type: String, trim: true, default: "main" },
    // The commit on `release` he is asked to test. The approval is worthless
    // against any other commit, which is the whole point.
    headSha: { type: String, trim: true, required: true, index: true },

    status: {
      type: String,
      enum: ["testing", "approved", "changes-requested", "merged", "superseded", "failed"],
      default: "testing",
      index: true,
    },

    items: { type: [ItemSchema], default: [] },

    preparedBy: { type: String, trim: true, lowercase: true, default: "" },
    preparedAt: { type: Date, default: Date.now },

    approvedBy: { type: String, trim: true, lowercase: true, default: "" },
    approvedAt: { type: Date, default: null },
    approvalNote: { type: String, trim: true, default: "" },

    // Filled by the merge workflow (.github/workflows/batch-merge.yml).
    mergedAt: { type: Date, default: null },
    mergeSha: { type: String, trim: true, default: "" },
    mergeError: { type: String, trim: true, default: "" },
  },
  { timestamps: true, demoTenancy: false },
);

export const ReleaseBatch =
  mongoose.models.ReleaseBatch || mongoose.model("ReleaseBatch", ReleaseBatchSchema);
