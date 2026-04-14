import mongoose from "mongoose";

const InvoiceItemSchema = new mongoose.Schema(
  {
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
    clientName: { type: String, trim: true, default: "" },
    clientEmail: { type: String, trim: true, lowercase: true, default: "" },
    clientPhone: { type: String, trim: true, default: "" },
    clientAddress: { type: String, trim: true, default: "" },
    clientOrganization: { type: String, trim: true, default: "" },

    // Line items
    items: { type: [InvoiceItemSchema], default: [] },

    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    subtotal: { type: Number, default: 0 },
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

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" },

    // Counter for auto-generation
    seq: { type: Number },
  },
  { timestamps: true }
);

InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ createdAt: -1 });

export const Invoice =
  mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);
