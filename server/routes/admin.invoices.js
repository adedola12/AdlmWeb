import express from "express";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import { requireAuth, requireAdmin, verifyAccess } from "../middleware/auth.js";
import { Invoice } from "../models/Invoice.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();

// Most routes require admin auth
router.use((req, res, next) => {
  // Allow ?token= query param for PDF download (browser opens new tab)
  if (req.query.token && req.path.endsWith("/pdf")) {
    try {
      req.user = verifyAccess(req.query.token);
      const role = String(req.user?.role || "").toLowerCase();
      if (role !== "admin" && role !== "mini_admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      return next();
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  // Default: standard auth
  return requireAuth(req, res, () => requireAdmin(req, res, next));
});

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Auto-generate next invoice number
async function nextInvoiceNumber() {
  const last = await Invoice.findOne()
    .sort({ seq: -1 })
    .select("seq")
    .lean();
  const nextSeq = (last?.seq || 0) + 1;
  return {
    seq: nextSeq,
    invoiceNumber: `ADLM-INV-${String(nextSeq).padStart(4, "0")}`,
  };
}

function computeTotals(items, discount = 0, tax = 0) {
  const subtotal = (items || []).reduce(
    (sum, it) => sum + Number(it.total || 0),
    0,
  );
  const total = Math.max(subtotal - Number(discount || 0) + Number(tax || 0), 0);
  return { subtotal, total };
}

// List invoices
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const invoices = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ ok: true, invoices });
  }),
);

// Get single
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    return res.json({ ok: true, invoice: inv });
  }),
);

// Create
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { seq, invoiceNumber } = await nextInvoiceNumber();

    const items = (req.body.items || []).map((it) => ({
      description: String(it.description || "").trim(),
      qty: Number(it.qty || 1),
      unitPrice: Number(it.unitPrice || 0),
      total: Number(it.total || 0),
    }));

    const { subtotal, total } = computeTotals(
      items,
      req.body.discount,
      req.body.tax,
    );

    const inv = await Invoice.create({
      invoiceNumber,
      seq,
      invoiceDate: req.body.invoiceDate || new Date(),
      dueDate: req.body.dueDate || null,
      clientName: (req.body.clientName || "").trim(),
      clientEmail: (req.body.clientEmail || "").trim().toLowerCase(),
      clientPhone: (req.body.clientPhone || "").trim(),
      clientAddress: (req.body.clientAddress || "").trim(),
      clientOrganization: (req.body.clientOrganization || "").trim(),
      items,
      currency: ["NGN", "USD"].includes(req.body.currency)
        ? req.body.currency
        : "NGN",
      subtotal,
      discount: Number(req.body.discount || 0),
      tax: Number(req.body.tax || 0),
      total,
      terms: (req.body.terms || "").trim(),
      notes: (req.body.notes || "").trim(),
      status: req.body.status || "draft",
      createdBy: req.user._id,
      purchaseId: req.body.purchaseId || undefined,
    });

    return res.json({ ok: true, invoice: inv });
  }),
);

// Update
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const fields = [
      "invoiceDate", "dueDate",
      "clientName", "clientEmail", "clientPhone", "clientAddress", "clientOrganization",
      "currency", "discount", "tax", "terms", "notes", "status",
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (f === "discount" || f === "tax") {
          inv[f] = Number(req.body[f] || 0);
        } else {
          inv[f] = req.body[f];
        }
      }
    }

    if (req.body.items !== undefined) {
      inv.items = (req.body.items || []).map((it) => ({
        description: String(it.description || "").trim(),
        qty: Number(it.qty || 1),
        unitPrice: Number(it.unitPrice || 0),
        total: Number(it.total || 0),
      }));
    }

    const { subtotal, total } = computeTotals(inv.items, inv.discount, inv.tax);
    inv.subtotal = subtotal;
    inv.total = total;

    await inv.save();
    return res.json({ ok: true, invoice: inv });
  }),
);

// Delete (draft only)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.status !== "draft") {
      return res
        .status(400)
        .json({ error: "Only draft invoices can be deleted" });
    }
    await inv.deleteOne();
    return res.json({ ok: true });
  }),
);

// Generate PDF
router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${inv.invoiceNumber}.pdf"`,
    );
    doc.pipe(res);

    const leftCol = 50;
    const rightCol = 350;
    const pageWidth = 595.28 - 100; // A4 width minus margins

    // ── Header ──
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor("#1a2b4a")
      .text("ADLM Studio", leftCol, 50);

    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor("#e96830")
      .text("Invoice", rightCol + 50, 50, { align: "right", width: 150 });

    // Company details
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#555")
      .text("ADLM Studio", leftCol, 80)
      .text("Lagos, Nigeria", leftCol, 92)
      .text("hello@adlmstudio.net", leftCol, 104)
      .text("www.adlmstudio.net", leftCol, 116);

    // Invoice meta
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#333")
      .text(`Invoice #: ${inv.invoiceNumber}`, rightCol, 80)
      .text(
        `Date: ${dayjs(inv.invoiceDate).format("MMMM D, YYYY")}`,
        rightCol,
        94,
      );

    if (inv.dueDate) {
      doc.text(
        `Due: ${dayjs(inv.dueDate).format("MMMM D, YYYY")}`,
        rightCol,
        108,
      );
    }

    // ── Bill To ──
    let y = 150;

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#1a2b4a")
      .text("Bill To:", leftCol, y);

    y += 16;
    doc.fontSize(9).font("Helvetica").fillColor("#333");

    if (inv.clientOrganization)
      doc.text(inv.clientOrganization, leftCol, y), (y += 13);
    if (inv.clientName) doc.text(inv.clientName, leftCol, y), (y += 13);
    if (inv.clientEmail) doc.text(inv.clientEmail, leftCol, y), (y += 13);
    if (inv.clientPhone) doc.text(inv.clientPhone, leftCol, y), (y += 13);
    if (inv.clientAddress) doc.text(inv.clientAddress, leftCol, y), (y += 13);

    // ── Line items table ──
    y = Math.max(y + 15, 240);

    // Header row
    const colDesc = leftCol;
    const colQty = 320;
    const colUnit = 380;
    const colTotal = 460;

    doc
      .rect(leftCol, y, pageWidth, 22)
      .fill("#1a2b4a");

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#fff")
      .text("Description", colDesc + 6, y + 6)
      .text("Qty", colQty, y + 6, { width: 50, align: "center" })
      .text("Unit Price", colUnit, y + 6, { width: 70, align: "right" })
      .text("Total", colTotal, y + 6, { width: 80, align: "right" });

    y += 22;
    const curr = inv.currency === "USD" ? "$" : "\u20A6";

    for (const item of inv.items || []) {
      const rowH = 20;

      if (y + rowH > 750) {
        doc.addPage();
        y = 50;
      }

      doc
        .rect(leftCol, y, pageWidth, rowH)
        .fill(inv.items.indexOf(item) % 2 === 0 ? "#f8f9fa" : "#fff");

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#333")
        .text(item.description || "—", colDesc + 6, y + 5, {
          width: colQty - colDesc - 12,
        })
        .text(String(item.qty || 1), colQty, y + 5, {
          width: 50,
          align: "center",
        })
        .text(
          `${curr}${Number(item.unitPrice || 0).toLocaleString()}`,
          colUnit,
          y + 5,
          { width: 70, align: "right" },
        )
        .text(
          `${curr}${Number(item.total || 0).toLocaleString()}`,
          colTotal,
          y + 5,
          { width: 80, align: "right" },
        );

      y += rowH;
    }

    // ── Totals ──
    y += 10;

    const totalX = colUnit;
    const totalW = colTotal + 80 - colUnit;

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#555")
      .text("Subtotal:", totalX, y, { width: 70, align: "right" })
      .text(
        `${curr}${Number(inv.subtotal || 0).toLocaleString()}`,
        colTotal,
        y,
        { width: 80, align: "right" },
      );

    y += 15;
    if (inv.discount > 0) {
      doc
        .text("Discount:", totalX, y, { width: 70, align: "right" })
        .text(
          `-${curr}${Number(inv.discount).toLocaleString()}`,
          colTotal,
          y,
          { width: 80, align: "right" },
        );
      y += 15;
    }

    if (inv.tax > 0) {
      doc
        .text("Tax:", totalX, y, { width: 70, align: "right" })
        .text(`${curr}${Number(inv.tax).toLocaleString()}`, colTotal, y, {
          width: 80,
          align: "right",
        });
      y += 15;
    }

    // Total line
    doc
      .moveTo(totalX, y)
      .lineTo(colTotal + 80, y)
      .strokeColor("#1a2b4a")
      .lineWidth(1)
      .stroke();

    y += 6;
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#1a2b4a")
      .text("Total:", totalX, y, { width: 70, align: "right" })
      .text(`${curr}${Number(inv.total || 0).toLocaleString()}`, colTotal, y, {
        width: 80,
        align: "right",
      });

    // ── Terms ──
    y += 40;
    if (inv.terms) {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#1a2b4a")
        .text("Terms & Conditions", leftCol, y);

      y += 16;
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#555")
        .text(inv.terms, leftCol, y, { width: pageWidth });

      y += doc.heightOfString(inv.terms, { width: pageWidth }) + 10;
    }

    // ── Notes ──
    if (inv.notes) {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#1a2b4a")
        .text("Notes", leftCol, y);

      y += 16;
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#555")
        .text(inv.notes, leftCol, y, { width: pageWidth });
    }

    // Footer
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#999")
      .text(
        `\u00A9 ${new Date().getFullYear()} ADLM Studio \u2014 All rights reserved.`,
        leftCol,
        760,
        { width: pageWidth, align: "center" },
      );

    doc.end();
  }),
);

// Send invoice to client via email
router.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    if (!inv.clientEmail) {
      return res
        .status(400)
        .json({ error: "Client email is required to send invoice" });
    }

    const curr = inv.currency === "USD" ? "$" : "\u20A6";

    await sendMail({
      to: inv.clientEmail,
      subject: `Invoice ${inv.invoiceNumber} from ADLM Studio`,
      html: `
        <p>Dear ${inv.clientName || inv.clientOrganization || "Client"},</p>
        <p>Please find your invoice details below:</p>
        <p>
          <b>Invoice #:</b> ${inv.invoiceNumber}<br/>
          <b>Date:</b> ${dayjs(inv.invoiceDate).format("MMMM D, YYYY")}<br/>
          ${inv.dueDate ? `<b>Due:</b> ${dayjs(inv.dueDate).format("MMMM D, YYYY")}<br/>` : ""}
          <b>Total:</b> ${curr}${Number(inv.total || 0).toLocaleString()}
        </p>
        <p>For full details, please contact us or check your account.</p>
        <p>— ADLM Studio</p>
      `,
    });

    if (inv.status === "draft") {
      inv.status = "sent";
      await inv.save();
    }

    return res.json({ ok: true, message: "Invoice sent to client" });
  }),
);

export default router;
