// server/models/RateGenRate.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const BreakdownLineSchema = new Schema(
  {
    componentName: { type: String, trim: true, default: "" },
    quantity: { type: Number, default: 0 },
    unit: { type: String, trim: true, default: "" },
    unitPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },

    // Provenance: persist the kind + source-library linkage so every qty/rate
    // traces back to its Material/Labour master row, and labour vs material is
    // deterministic downstream instead of being re-guessed from the name.
    refKind: { type: String, trim: true, default: "" }, // "material" | "labour" | "plant" | "consumable" | ...
    refSn: { type: Number, default: null }, // serial no. in the Material/Labour master library
    refName: { type: String, trim: true, default: "" }, // resolved library name
    priceAsOf: { type: Date, default: null }, // when this unit price was captured
  },
  { _id: false }
);

const RateGenRateSchema = new Schema(
  {
    sectionKey: { type: String, required: true, index: true, trim: true },
    sectionLabel: { type: String, required: true, trim: true },

    itemNo: { type: Number },
    code: { type: String, trim: true },

    description: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },

    // ✅ base net cost
    netCost: { type: Number, required: true },

    // ✅ store P/O (the main ask)
    overheadPercent: { type: Number, default: 10 },
    profitPercent: { type: Number, default: 25 },

    // ✅ store computed values too (handy for quick reads)
    overheadValue: { type: Number, default: 0 },
    profitValue: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },

    breakdown: { type: [BreakdownLineSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

RateGenRateSchema.pre("save", function preSave(next) {
  // ensure breakdown totals are present
  if (Array.isArray(this.breakdown)) {
    this.breakdown = this.breakdown.map((l) => {
      const qty = safeNum(l.quantity);
      const unitPrice = safeNum(l.unitPrice);
      const total = safeNum(l.totalPrice) || qty * unitPrice;
      // Build the line explicitly: spreading a Mongoose subdocument ({...l})
      // copies internal props, not the schema fields, which would drop
      // componentName + the provenance fields below.
      return {
        componentName: l.componentName,
        quantity: qty,
        unit: l.unit,
        unitPrice,
        totalPrice: total,
        refKind: l.refKind,
        refSn: l.refSn,
        refName: l.refName,
        priceAsOf: l.priceAsOf,
      };
    });
  }

  const net = safeNum(this.netCost);
  const ohPct = safeNum(this.overheadPercent);
  const prPct = safeNum(this.profitPercent);

  this.overheadValue = (net * ohPct) / 100;
  this.profitValue = (net * prPct) / 100;
  this.totalCost = net + this.overheadValue + this.profitValue;

  next();
});

export const RateGenRate =
  mongoose.models.RateGenRate ||
  mongoose.model("RateGenRate", RateGenRateSchema);
