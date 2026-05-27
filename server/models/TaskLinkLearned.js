// Per-user learning store for PM task → BoQ item link suggestions.
//
// Every time a user explicitly saves a task with `linkedBoqIdentities`,
// we upsert a row keyed on (userId, productKey, normalizedTaskName).
// Next time the same user imports a project (or runs Generate-from-BoQ
// against a new project), the importer checks this store first and
// re-uses the proven mapping before falling back to fuzzy match.
//
// `hits` increments on each save — gives us a confidence signal if we
// later want to prioritise frequently-confirmed mappings over rare ones.
// `lastUsed` lets us age out stale entries via a TTL or cleanup script.

import mongoose from "mongoose";

const TaskLinkLearnedSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Same product-key normalisation the projects use (revit, planswift,
    // civil3d, etc.). Mapping is scoped per tool so a Revit link doesn't
    // pollute a Planswift project's suggestions.
    productKey: { type: String, required: true, index: true },
    // sorted-token-set form of the task name — see fuzzyMatch.normalizeTaskName.
    // Two task names that tokenise the same hit the same row.
    taskNameNorm: { type: String, required: true },
    // The user's confirmed link(s) for this task name. Stores the same
    // identity strings used by linkedBoqIdentities — measured-item hashes
    // ("…"), prelim ("prelim::N"), PC ("pc::N"), variation ("var::N").
    linkedIdentities: { type: [String], default: [] },
    // Times we've confirmed this mapping by save.
    hits: { type: Number, default: 1 },
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// One row per (user, tool, name). Upserting on a delete-then-insert
// would race; keep this unique compound index and use findOneAndUpdate.
TaskLinkLearnedSchema.index(
  { userId: 1, productKey: 1, taskNameNorm: 1 },
  { unique: true },
);

export const TaskLinkLearned = mongoose.model(
  "TaskLinkLearned",
  TaskLinkLearnedSchema,
);
