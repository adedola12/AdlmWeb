// server/models/RateUsage.js
//
// Which Rate Gen rate a QS chose for which bill item. One row per bill line
// priced from a rate on the web (price-from-rate and price-many).
//
// It exists so the rate suggestions can say "you used this last time": a QS
// who priced lintel concrete with "Concrete (1:2:4) grade 20" on five projects
// should be offered that rate first on the sixth, even though the two
// descriptions share almost no words (util/rateSuggestions.js, usageIndex).
//
// Holds no money. The rate is re-read from the user's library whenever it is
// suggested, so a suggestion always carries today's price. Append-only, and a
// write is best-effort: failing to record a choice must never fail the pricing
// that made it.
import mongoose from "mongoose";

const RateUsageSchema = new mongoose.Schema(
  {
    // Whose choice it was. Suggestions read only the caller's own rows.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "TakeoffProject", default: null },
    projectName: { type: String, trim: true, default: "" },
    productKey: { type: String, trim: true, lowercase: true, default: "" },
    code: { type: String, trim: true, default: "" },

    // The item, as lineKey() reads it (the level stripped, the type kept), and
    // its unit as written on the bill.
    key: { type: String, trim: true, required: true },
    unit: { type: String, trim: true, default: "" },

    // The rate chosen.
    rateId: { type: String, trim: true, required: true },
    rateDescription: { type: String, trim: true, default: "" },
    // The rate's own unit, and the dimensions that converted it to the line's
    // (thickness, width, depth in metres; kgPerM; perItem). Kept so "price the
    // lines like this one" can convert the same way.
    rateUnit: { type: String, trim: true, default: "" },
    convert: { type: mongoose.Schema.Types.Mixed, default: null },

    // "panel", "similar" (priced with a line the QS picked), "ada", "backfill".
    via: { type: String, trim: true, default: "panel" },
  },
  { timestamps: true },
);

// The suggestion read: the newest of one user's choices.
RateUsageSchema.index({ userId: 1, createdAt: -1 });
// "What rate did this line get?" when copying it to the lines like it.
RateUsageSchema.index({ projectId: 1, code: 1, createdAt: -1 });

export const RateUsage =
  mongoose.models.RateUsage || mongoose.model("RateUsage", RateUsageSchema);
