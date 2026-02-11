// server/models/TrainingEnrollment.js
import mongoose from "mongoose";

const TrainingEnrollmentSchema = new mongoose.Schema(
  {
    trainingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingEvent",
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    status: {
      type: String,
      enum: [
        "payment_pending",
        "form_pending",
        "submitted",
        "approved",
        "rejected",
      ],
      default: "payment_pending",
      index: true,
    },

    payment: {
      provider: { type: String, enum: ["paystack"], default: "paystack" },
      reference: { type: String, default: "", index: true },
      amountNGN: { type: Number, default: 0 },
      paid: { type: Boolean, default: false },
      paidAt: { type: Date, default: null },
      raw: { type: Object, default: null },
    },

    formData: { type: Object, default: {} },
    formSubmittedAt: { type: Date, default: null },

    installation: {
      status: {
        type: String,
        enum: ["none", "pending", "complete"],
        default: "none",
      },
      markedBy: { type: String, default: "" },
      markedAt: { type: Date, default: null },
    },

    entitlementsApplied: { type: Boolean, default: false },
    entitlementsAppliedAt: { type: Date, default: null },

    decidedBy: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    rejectReason: { type: String, default: "" },
  },
  { timestamps: true, minimize: false },
);

TrainingEnrollmentSchema.index({ trainingId: 1, userId: 1 }, { unique: true });

export const TrainingEnrollment =
  mongoose.models.TrainingEnrollment ||
  mongoose.model("TrainingEnrollment", TrainingEnrollmentSchema);
