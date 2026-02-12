import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    payerName: { type: String, default: "" },
    bankName: { type: String, default: "" },
    reference: { type: String, default: "" },
    note: { type: String, default: "" },
    receiptUrl: { type: String, default: "" },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const PTrainingEnrollmentSchema = new mongoose.Schema(
  {
    trainingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PTrainingEvent",
      required: true,
      index: true,
    },

    // user identity
    email: { type: String, default: "" },
    userEmail: { type: String, default: "" }, // legacy support
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },

    // registration payload
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // payment proof
    payment: { type: PaymentSchema, default: () => ({}) },

    // workflow
    status: { type: String, default: "pending" }, // pending|submitted|approved|rejected
    decidedAt: { type: Date, default: null },
    decidedBy: { type: String, default: "" },

    // if you track installation/entitlements
    installationCompletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

PTrainingEnrollmentSchema.index({ createdAt: -1 });

export default mongoose.model("PTrainingEnrollment", PTrainingEnrollmentSchema);
