import mongoose from "mongoose";

const InvoiceItemSchema = new mongoose.Schema(
  {
    source: { type: String, trim: true, default: "" }, // e.g. "product:revit", "training:abc123", "bim:abc123"
    description: { type: String, trim: true, default: "" },
    qty: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },

    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },

    // Client info
    clientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientName: { type: String, trim: true, default: "" },
    clientEmail: { type: String, trim: true, lowercase: true, default: "" },
    clientPhone: { type: String, trim: true, default: "" },
    clientAddress: { type: String, trim: true, default: "" },
    clientOrganization: { type: String, trim: true, default: "" },

    // Line items
    items: { type: [InvoiceItemSchema], default: [] },

    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    subtotal: { type: Number, default: 0 },

    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0 },

    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0 },

    // kept for backward compat with old invoices
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },

    total: { type: Number, default: 0 },

    // Terms & notes
    terms: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },

    // Status
    status: {
      type: String,
      enum: ["draft", "sent", "paid", "overdue", "cancelled"],
      default: "draft",
    },

    // Payment / receipt (populated once the invoice is marked paid)
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, trim: true, default: "" }, // e.g. "Bank Transfer", "Card", "Cash"
    paymentReference: { type: String, trim: true, default: "" },
    amountPaid: { type: Number, default: 0 },

    receiptNumber: { type: String, trim: true, default: "" },
    receiptSeq: { type: Number },
    receiptSentAt: { type: Date, default: null },

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" },

    // Counter for auto-generation
    seq: { type: Number },
  },
  { timestamps: true }
);

InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ createdAt: -1 });
InvoiceSchema.index({ clientUserId: 1 });
InvoiceSchema.index({ clientEmail: 1 });

// Next sequential receipt number (ADLM-RCP-0001, mirroring invoice numbering).
InvoiceSchema.statics.nextReceiptNumber = async function () {
  const last = await this.findOne({ receiptSeq: { $ne: null } })
    .sort({ receiptSeq: -1 })
    .select("receiptSeq")
    .lean();
  const nextSeq = (last?.receiptSeq || 0) + 1;
  return {
    receiptSeq: nextSeq,
    receiptNumber: `ADLM-RCP-${String(nextSeq).padStart(4, "0")}`,
  };
};

// Stamp payment/receipt metadata the first time an invoice becomes paid.
// Mutates this (hydrated) doc; caller is responsible for saving.
InvoiceSchema.methods.applyPaidMetadata = async function () {
  if (String(this.status).toLowerCase() !== "paid") return;
  if (!this.paidAt) this.paidAt = new Date();
  if (!this.amountPaid) this.amountPaid = Number(this.total || 0);
  if (!this.receiptNumber) {
    const { receiptSeq, receiptNumber } = await this.constructor.nextReceiptNumber();
    this.receiptSeq = receiptSeq;
    this.receiptNumber = receiptNumber;
  }
};

export const Invoice =
  mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);
