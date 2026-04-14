import express from "express";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import QRCode from "qrcode";
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

function computeTotals(items, discountPercent = 0, taxPercent = 0) {
  const subtotal = (items || []).reduce(
    (sum, it) => sum + Number(it.total || 0),
    0,
  );
  const discPct = Math.min(Math.max(Number(discountPercent || 0), 0), 100);
  const taxPct = Math.min(Math.max(Number(taxPercent || 0), 0), 100);

  const discountAmount = Math.round((subtotal * discPct) / 100 * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * taxPct) / 100 * 100) / 100;
  const total = Math.max(afterDiscount + taxAmount, 0);

  return { subtotal, discountAmount, taxAmount, total };
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
      source: String(it.source || "").trim(),
      description: String(it.description || "").trim(),
      qty: Number(it.qty || 1),
      unitPrice: Number(it.unitPrice || 0),
      total: Number(it.total || 0),
    }));

    const discPct = Math.min(Math.max(Number(req.body.discountPercent || 0), 0), 100);
    const taxPct = Math.min(Math.max(Number(req.body.taxPercent || 0), 0), 100);
    const { subtotal, discountAmount, taxAmount, total } = computeTotals(
      items, discPct, taxPct,
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
      discountPercent: discPct,
      discountAmount,
      taxPercent: taxPct,
      taxAmount,
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
      "currency", "discountPercent", "taxPercent", "terms", "notes", "status",
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (f === "discountPercent" || f === "taxPercent") {
          inv[f] = Math.min(Math.max(Number(req.body[f] || 0), 0), 100);
        } else {
          inv[f] = req.body[f];
        }
      }
    }

    if (req.body.items !== undefined) {
      inv.items = (req.body.items || []).map((it) => ({
        source: String(it.source || "").trim(),
        description: String(it.description || "").trim(),
        qty: Number(it.qty || 1),
        unitPrice: Number(it.unitPrice || 0),
        total: Number(it.total || 0),
      }));
    }

    const { subtotal, discountAmount, taxAmount, total } = computeTotals(
      inv.items, inv.discountPercent, inv.taxPercent,
    );
    inv.subtotal = subtotal;
    inv.discountAmount = discountAmount;
    inv.taxAmount = taxAmount;
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

// Generate PDF — Figma-matched ADLM invoice design
router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    // Generate QR code as data URL
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL("https://www.adlmstudio.net", {
        width: 80, margin: 1,
      });
    } catch { /* ignore */ }

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${inv.invoiceNumber}.pdf"`,
    );
    doc.pipe(res);

    const leftCol = 40;
    const rightCol = 350;
    const pageWidth = 595.28 - 80; // A4 width minus margins

    const curr = inv.currency === "USD" ? "$" : "\u20A6";
    const fmtN = (n) => `${curr}${Number(n || 0).toLocaleString()}`;

    // ── Header: ADLM Studio + Invoice ──
    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor("#091E39")
      .text("ADLM Studio", leftCol, 40);

    doc
      .fontSize(28)
      .font("Helvetica-Bold")
      .fillColor("#091E39")
      .text("Invoice", rightCol, 36, { align: "right", width: pageWidth - rightCol + leftCol });

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#3e3e3e")
      .text(`NO: ${inv.invoiceNumber}`, rightCol, 68, { align: "right", width: pageWidth - rightCol + leftCol });

    // ── Invoice To ──
    let y = 90;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#3e3e3e")
      .text("INVOICE TO:", leftCol, y);

    const toX = leftCol + 75;
    doc.fontSize(10).font("Helvetica").fillColor("#3e3e3e");
    if (inv.clientName) doc.text(inv.clientName, toX, y), (y += 14);
    if (inv.clientOrganization) doc.text(inv.clientOrganization, toX, y), (y += 14);
    if (inv.clientAddress) doc.text(inv.clientAddress, toX, y), (y += 14);
    if (inv.clientEmail) doc.text(inv.clientEmail, toX, y), (y += 14);
    if (inv.clientPhone) doc.text(inv.clientPhone, toX, y), (y += 14);

    // Date line
    y += 4;
    doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e");
    if (inv.invoiceDate)
      doc.text(`Date: ${dayjs(inv.invoiceDate).format("MMMM D, YYYY")}`, leftCol, y);
    if (inv.dueDate)
      doc.text(`Due: ${dayjs(inv.dueDate).format("MMMM D, YYYY")}`, leftCol + 200, y);

    // ── Separator ──
    y += 18;
    doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).strokeColor("#d0d0d0").lineWidth(0.5).stroke();
    y += 10;

    // ── Line items table ──
    const colSN = leftCol;
    const colDesc = leftCol + 35;
    const colQty = 330;
    const colUnit = 370;
    const colRate = 415;
    const colAmt = 475;
    const tableW = pageWidth;
    const rowH = 28;

    // Header row
    doc.roundedRect(leftCol, y, tableW, 24, 4).fill("#091E39");

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
    doc.text("S/N", colSN + 4, y + 7, { width: 30, align: "center" });
    doc.text("DESCRIPTION", colDesc, y + 7, { width: colQty - colDesc });
    doc.text("QTY.", colQty, y + 7, { width: 35, align: "center" });
    doc.text("UNIT", colUnit, y + 7, { width: 40, align: "center" });
    doc.text("RATE", colRate, y + 7, { width: 55, align: "right" });
    doc.text("AMOUNT", colAmt, y + 7, { width: 65, align: "right" });
    y += 24;

    // Data rows
    for (let i = 0; i < (inv.items || []).length; i++) {
      const item = inv.items[i];
      if (y + rowH > 720) { doc.addPage(); y = 40; }

      const bg = i % 2 === 1 ? "#e5e5e5" : "#ffffff";
      const clr = i % 2 === 1 ? "#091E39" : "#262626";

      doc.rect(leftCol, y, tableW, rowH).fill(bg);

      doc.fontSize(9).font("Helvetica").fillColor(clr);
      doc.text(`${i + 1}.`, colSN + 4, y + 8, { width: 30, align: "center" });
      doc.text(item.description || "—", colDesc, y + 8, { width: colQty - colDesc - 5 });
      doc.text(String(item.qty || 1), colQty, y + 8, { width: 35, align: "center" });
      doc.text("Nr", colUnit, y + 8, { width: 40, align: "center" });
      doc.text(fmtN(item.unitPrice), colRate, y + 8, { width: 55, align: "right" });
      doc.text(fmtN(item.total), colAmt, y + 8, { width: 65, align: "right" });
      y += rowH;
    }

    // ── Summary bar ──
    y += 6;
    const summaryW = 220;
    const summaryX = leftCol + tableW - summaryW;
    doc.roundedRect(summaryX, y, summaryW, 24, 4).fill("#091E39");

    const discPctVal = Number(inv.discountPercent || 0);
    const taxPctVal = Number(inv.taxPercent || 0);
    const discAmtVal = Number(inv.discountAmount || 0);
    const taxAmtVal = Number(inv.taxAmount || 0);

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
    doc.text("Summary Total:", summaryX + 12, y + 7, { width: 100 });
    doc.text(fmtN(inv.total), summaryX + 120, y + 7, { width: 88, align: "right" });
    y += 24;

    // Discount/tax detail (if any)
    if (discPctVal > 0 || taxPctVal > 0) {
      y += 4;
      doc.fontSize(8).font("Helvetica").fillColor("#555");
      doc.text(`Subtotal: ${fmtN(inv.subtotal)}`, summaryX, y, { width: summaryW, align: "right" });
      y += 12;
      if (discPctVal > 0) {
        doc.text(`Discount (${discPctVal}%): -${fmtN(discAmtVal)}`, summaryX, y, { width: summaryW, align: "right" });
        y += 12;
      }
      if (taxPctVal > 0) {
        doc.text(`Tax (${taxPctVal}%): +${fmtN(taxAmtVal)}`, summaryX, y, { width: summaryW, align: "right" });
        y += 12;
      }
    }

    // ── Separator ──
    y += 10;
    doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).strokeColor("#d0d0d0").lineWidth(0.5).stroke();
    y += 14;

    // ── Payment details + QR code ──
    if (y + 80 > 720) { doc.addPage(); y = 40; }

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#091E39").text("Payment details:", leftCol, y);
    y += 14;
    doc.fontSize(9).font("Helvetica").fillColor("#091E39");
    doc.text("Account no: 1634998770", leftCol, y); y += 12;
    doc.text("Name: ADLM Studio", leftCol, y); y += 12;
    doc.text("Bank: Access Bank", leftCol, y);

    // QR code on the right
    if (qrDataUrl) {
      try {
        doc.image(qrDataUrl, leftCol + pageWidth - 80, y - 36, { width: 70, height: 70 });
        doc.fontSize(6).font("Helvetica").fillColor("#999")
          .text("Scan to verify", leftCol + pageWidth - 80, y + 38, { width: 70, align: "center" });
      } catch { /* ignore */ }
    }

    y += 24;

    // ── Terms ──
    if (inv.terms) {
      if (y + 40 > 740) { doc.addPage(); y = 40; }
      y += 8;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#091E39").text("Terms:", leftCol, y);
      y += 14;
      doc.fontSize(9).font("Helvetica").fillColor("#091E39")
        .text(inv.terms, leftCol, y, { width: pageWidth * 0.6 });
      y += doc.heightOfString(inv.terms, { width: pageWidth * 0.6 }) + 8;
    }

    // ── Notes ──
    if (inv.notes) {
      if (y + 30 > 740) { doc.addPage(); y = 40; }
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#091E39").text("Notes:", leftCol, y);
      y += 14;
      doc.fontSize(9).font("Helvetica").fillColor("#091E39")
        .text(inv.notes, leftCol, y, { width: pageWidth * 0.6 });
    }

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
