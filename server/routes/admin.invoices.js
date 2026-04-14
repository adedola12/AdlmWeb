import express from "express";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { requireAuth, requireAdmin, verifyAccess } from "../middleware/auth.js";
import { Invoice } from "../models/Invoice.js";
import { sendMail } from "../util/mailer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logo path — try multiple locations
function getLogoPath() {
  const candidates = [
    path.resolve(__dirname, "../../client/src/assets/logo/invoiceLogo.png"),
    path.resolve(__dirname, "../../client/dist/assets/invoiceLogo.png"),
    path.resolve(__dirname, "../../client/public/invoiceLogo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

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

    const curr = inv.currency === "USD" ? "$" : "N";
    const fmtN = (n) => `${curr}${Number(n || 0).toLocaleString()}`;

    const L = 40;                       // left margin
    const PW = 595.28 - 80;             // usable page width
    const R = L + PW;                   // right edge

    // ── Decorative elements ──
    // Top-right circle
    doc.save().circle(490, -30, 85).lineWidth(1.5).strokeColor("#ddd").strokeOpacity(0.3).stroke().restore();
    // Bottom-right circle
    doc.save().circle(520, 830, 55).lineWidth(1.5).strokeColor("#ddd").strokeOpacity(0.25).stroke().restore();
    // Gray bar behind logo
    doc.save().roundedRect(0, 72, 160, 28, 14).fill("#fbfbfb").restore();

    // ── Decorative bars (5 small vertical bars) ──
    for (let i = 0; i < 5; i++) {
      doc.save().roundedRect(R - 55 + i * 14, 100, 5, 28, 2).fillOpacity(0.1).fill("#091E39").restore();
    }

    // ── Decorative dot grid (5×3) ──
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        doc.save().circle(R - 50 + c * 11, 155 + r * 11, 2.5).fillOpacity(0.12).fill("#091E39").restore();
      }
    }

    // ── Logo ──
    const logoPath = getLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, L, 38, { height: 28 });
      } catch { /* ignore missing logo */ }
    } else {
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#091E39").text("ADLM Studio", L, 42);
    }

    // ── Invoice title (top-right) ──
    doc.fontSize(30).font("Helvetica-Bold").fillColor("#091E39")
      .text("Invoice", 0, 36, { width: R, align: "right" });
    doc.fontSize(10).font("Helvetica").fillColor("#3e3e3e")
      .text(`NO: ${inv.invoiceNumber}`, 0, 70, { width: R, align: "right" });

    // ── Invoice To ──
    let y = 95;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#3e3e3e").text("INVOICE TO:", L, y);

    const toX = L + 80;
    doc.fontSize(10).font("Helvetica").fillColor("#3e3e3e");
    if (inv.clientName)         { doc.text(inv.clientName, toX, y); y += 14; }
    if (inv.clientOrganization) { doc.text(inv.clientOrganization, toX, y); y += 14; }
    if (inv.clientAddress)      { doc.text(inv.clientAddress, toX, y); y += 14; }

    // Date row
    y += 6;
    doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e");
    if (inv.invoiceDate) doc.text(`Date: ${dayjs(inv.invoiceDate).format("MMMM D, YYYY")}`, L, y);
    if (inv.dueDate)     doc.text(`Due: ${dayjs(inv.dueDate).format("MMMM D, YYYY")}`, L + 200, y);

    // ── Separator (gradient-like: thick navy fading to thin gray) ──
    y += 20;
    doc.save()
      .moveTo(L, y).lineTo(L + PW * 0.6, y).lineWidth(2).strokeColor("#091E39").stroke()
      .moveTo(L + PW * 0.6, y).lineTo(R, y).lineWidth(0.5).strokeColor("#ccc").stroke()
      .restore();
    y += 14;

    // ── Table ──
    const colSN = L;
    const colDesc = L + 38;
    const colQty = 340;
    const colUnit = 382;
    const colRate = 425;
    const colAmt = 485;
    const rowH = 30;

    // Header
    doc.save().roundedRect(L, y, PW, 26, 4).fill("#091E39").restore();
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
    doc.text("S/N",         colSN + 2,  y + 8, { width: 34, align: "center" });
    doc.text("DESCRIPTION", colDesc,     y + 8, { width: colQty - colDesc });
    doc.text("QTY.",        colQty,      y + 8, { width: 36, align: "center" });
    doc.text("UNIT",        colUnit,     y + 8, { width: 38, align: "center" });
    doc.text("RATE",        colRate,     y + 8, { width: 55, align: "right" });
    doc.text("AMOUNT",      colAmt,      y + 8, { width: R - colAmt, align: "right" });
    y += 26;

    // Rows
    for (let i = 0; i < (inv.items || []).length; i++) {
      const item = inv.items[i];
      if (y + rowH > 720) { doc.addPage(); y = 40; }

      const isGray = i % 2 === 1;
      doc.save().rect(L, y, PW, rowH).fill(isGray ? "#e5e5e5" : "#ffffff").restore();

      const clr = isGray ? "#091E39" : "#262626";
      doc.fontSize(9).font("Helvetica").fillColor(clr);
      doc.text(`${i + 1}.`,           colSN + 2, y + 9, { width: 34, align: "center" });
      doc.text(item.description || "—", colDesc,  y + 9, { width: colQty - colDesc - 4 });
      doc.text(String(item.qty || 1),  colQty,    y + 9, { width: 36, align: "center" });
      doc.text("Nr",                   colUnit,   y + 9, { width: 38, align: "center" });
      doc.text(fmtN(item.unitPrice),   colRate,   y + 9, { width: 55, align: "right" });
      doc.text(fmtN(item.total),       colAmt,    y + 9, { width: R - colAmt, align: "right" });
      y += rowH;
    }

    // ── Summary bar ──
    y += 8;
    const sumW = 230;
    const sumX = R - sumW;
    doc.save().roundedRect(sumX, y, sumW, 26, 4).fill("#091E39").restore();

    const discPctVal = Number(inv.discountPercent || 0);
    const taxPctVal  = Number(inv.taxPercent || 0);
    const discAmtVal = Number(inv.discountAmount || 0);
    const taxAmtVal  = Number(inv.taxAmount || 0);

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#fff");
    doc.text("Summary Total:", sumX + 14, y + 7, { width: 110 });
    doc.text(fmtN(inv.total),  sumX + 130, y + 7, { width: 90, align: "right" });
    y += 26;

    // Discount / tax detail
    if (discPctVal > 0 || taxPctVal > 0) {
      y += 5;
      doc.fontSize(9).font("Helvetica").fillColor("#555");
      doc.text(`Subtotal: ${fmtN(inv.subtotal)}`, sumX, y, { width: sumW, align: "right" }); y += 13;
      if (discPctVal > 0) {
        doc.text(`Discount (${discPctVal}%): -${fmtN(discAmtVal)}`, sumX, y, { width: sumW, align: "right" }); y += 13;
      }
      if (taxPctVal > 0) {
        doc.text(`Tax (${taxPctVal}%): +${fmtN(taxAmtVal)}`, sumX, y, { width: sumW, align: "right" }); y += 13;
      }
    }

    // ── Separator ──
    y += 12;
    doc.save()
      .moveTo(L, y).lineTo(L + PW * 0.6, y).lineWidth(2).strokeColor("#091E39").stroke()
      .moveTo(L + PW * 0.6, y).lineTo(R, y).lineWidth(0.5).strokeColor("#ccc").stroke()
      .restore();
    y += 16;

    // ── Payment details + QR code ──
    if (y + 90 > 740) { doc.addPage(); y = 40; }

    const payY = y;
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#091E39").text("Payment details:", L, y);
    y += 15;
    doc.fontSize(10).font("Helvetica").fillColor("#091E39");
    doc.text("Account no: 1634998770", L, y); y += 13;
    doc.text("Name: ADLM Studio", L, y); y += 13;
    doc.text("Bank: Access Bank", L, y);

    // QR code (right-aligned)
    if (qrDataUrl) {
      try {
        doc.image(qrDataUrl, R - 85, payY, { width: 75, height: 75 });
        doc.fontSize(7).font("Helvetica").fillColor("#888")
          .text("Authorized \u00B7 Scan to verify", R - 85, payY + 78, { width: 75, align: "center" });
      } catch { /* ignore */ }
    }

    y += 20;

    // ── Terms ──
    if (inv.terms) {
      if (y + 40 > 740) { doc.addPage(); y = 40; }
      y += 8;
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#091E39").text("Terms:", L, y);
      y += 15;
      doc.fontSize(10).font("Helvetica").fillColor("#091E39")
        .text(inv.terms, L, y, { width: PW * 0.6 });
      y += doc.heightOfString(inv.terms, { width: PW * 0.6 }) + 10;
    }

    // ── Notes ──
    if (inv.notes) {
      if (y + 30 > 740) { doc.addPage(); y = 40; }
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#091E39").text("Notes:", L, y);
      y += 15;
      doc.fontSize(10).font("Helvetica").fillColor("#091E39")
        .text(inv.notes, L, y, { width: PW * 0.6 });
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
