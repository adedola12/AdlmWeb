// server/util/receiptPdf.js
// Shared receipt (paid-acknowledgement) PDF renderer, used by both the admin
// invoice routes and the client-facing /me invoice routes so the receipt looks
// identical wherever it is downloaded from.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import dayjs from "dayjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logo path — try multiple locations (mirrors admin.invoices.js)
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

// Renders a "paid" acknowledgement receipt onto a PDFKit document. Mirrors the
// brand styling of the invoice PDF but stamped PAID and framed as a receipt.
export function renderReceipt(doc, inv, qrDataUrl) {
  const L = 40;                       // left margin
  const PW = 595.28 - 80;             // usable page width
  const R = L + PW;                   // right edge

  const curr = inv.currency === "USD" ? "$" : "N";
  const fmtN = (n) => `${curr}${Number(n || 0).toLocaleString()}`;
  const amountPaid = Number(inv.amountPaid || inv.total || 0);

  // ── Decorative elements (match invoice) ──
  doc.save().circle(490, -30, 85).lineWidth(1.5).strokeColor("#ddd").strokeOpacity(0.3).stroke().restore();
  doc.save().circle(520, 830, 55).lineWidth(1.5).strokeColor("#ddd").strokeOpacity(0.25).stroke().restore();

  // ── Logo ──
  const logoPath = getLogoPath();
  if (logoPath) {
    try { doc.image(logoPath, L, 38, { height: 28 }); } catch { /* ignore */ }
  } else {
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#091E39").text("ADLM Studio", L, 42);
  }

  // ── Receipt title (top-right) ──
  doc.fontSize(30).font("Helvetica-Bold").fillColor("#091E39")
    .text("Receipt", 0, 36, { width: R, align: "right" });
  doc.fontSize(10).font("Helvetica").fillColor("#3e3e3e")
    .text(`NO: ${inv.receiptNumber || "—"}`, 0, 70, { width: R, align: "right" });

  // ── PAID badge ──
  const badgeW = 78, badgeH = 24, badgeX = R - badgeW, badgeY = 88;
  doc.save().roundedRect(badgeX, badgeY, badgeW, badgeH, 12).fill("#12855050").restore();
  doc.save().roundedRect(badgeX, badgeY, badgeW, badgeH, 12).lineWidth(1).strokeColor("#0f766e").stroke().restore();
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#0f766e")
    .text("PAID", badgeX, badgeY + 6, { width: badgeW, align: "center" });

  // ── Received From ──
  let y = 95;
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#3e3e3e").text("RECEIVED FROM:", L, y);

  const toX = L + 95;
  doc.fontSize(10).font("Helvetica").fillColor("#3e3e3e");
  if (inv.clientName)         { doc.text(inv.clientName, toX, y); y += 14; }
  if (inv.clientOrganization) { doc.text(inv.clientOrganization, toX, y); y += 14; }
  if (inv.clientAddress)      { doc.text(inv.clientAddress, toX, y); y += 14; }
  if (inv.clientEmail)        { doc.text(inv.clientEmail, toX, y); y += 14; }

  // ── Payment meta rows ──
  y += 6;
  doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e");
  const payDate = inv.paidAt ? dayjs(inv.paidAt).format("MMMM D, YYYY") : "—";
  doc.text(`Payment date: ${payDate}`, L, y);
  doc.text(`Invoice: ${inv.invoiceNumber || "—"}`, L + 200, y);
  y += 14;
  doc.text(`Method: ${inv.paymentMethod || "—"}`, L, y);
  if (inv.paymentReference) doc.text(`Ref: ${inv.paymentReference}`, L + 200, y);
  y += 14;

  // ── Separator ──
  y += 6;
  doc.save()
    .moveTo(L, y).lineTo(L + PW * 0.6, y).lineWidth(2).strokeColor("#091E39").stroke()
    .moveTo(L + PW * 0.6, y).lineTo(R, y).lineWidth(0.5).strokeColor("#ccc").stroke()
    .restore();
  y += 14;

  // ── Table (same columns as invoice) ──
  const colSN = L;
  const colDesc = L + 38;
  const colQty = 340;
  const colUnit = 382;
  const colRate = 425;
  const colAmt = 485;
  const rowH = 30;

  doc.save().roundedRect(L, y, PW, 26, 4).fill("#091E39").restore();
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
  doc.text("S/N",         colSN + 2,  y + 8, { width: 34, align: "center" });
  doc.text("DESCRIPTION", colDesc,     y + 8, { width: colQty - colDesc });
  doc.text("QTY.",        colQty,      y + 8, { width: 36, align: "center" });
  doc.text("UNIT",        colUnit,     y + 8, { width: 38, align: "center" });
  doc.text("RATE",        colRate,     y + 8, { width: 55, align: "right" });
  doc.text("AMOUNT",      colAmt,      y + 8, { width: R - colAmt, align: "right" });
  y += 26;

  for (let i = 0; i < (inv.items || []).length; i++) {
    const item = inv.items[i];
    if (y + rowH > 720) { doc.addPage(); y = 40; }
    const isGray = i % 2 === 1;
    doc.save().rect(L, y, PW, rowH).fill(isGray ? "#e5e5e5" : "#ffffff").restore();
    const clr = isGray ? "#091E39" : "#262626";
    doc.fontSize(9).font("Helvetica").fillColor(clr);
    doc.text(`${i + 1}.`,            colSN + 2, y + 9, { width: 34, align: "center" });
    doc.text(item.description || "—", colDesc,  y + 9, { width: colQty - colDesc - 4 });
    doc.text(String(item.qty || 1),  colQty,    y + 9, { width: 36, align: "center" });
    doc.text("Nr",                   colUnit,   y + 9, { width: 38, align: "center" });
    doc.text(fmtN(item.unitPrice),   colRate,   y + 9, { width: 55, align: "right" });
    doc.text(fmtN(item.total),       colAmt,    y + 9, { width: R - colAmt, align: "right" });
    y += rowH;
  }

  // ── Amount Paid bar (green) ──
  y += 8;
  const sumW = 230;
  const sumX = R - sumW;
  doc.save().roundedRect(sumX, y, sumW, 26, 4).fill("#0f766e").restore();
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#fff");
  doc.text("Amount Paid:", sumX + 14, y + 7, { width: 110 });
  doc.text(fmtN(amountPaid), sumX + 130, y + 7, { width: 90, align: "right" });
  y += 26;

  // Discount / tax detail (context for the paid total)
  const discPctVal = Number(inv.discountPercent || 0);
  const taxPctVal  = Number(inv.taxPercent || 0);
  if (discPctVal > 0 || taxPctVal > 0) {
    y += 5;
    doc.fontSize(9).font("Helvetica").fillColor("#555");
    doc.text(`Subtotal: ${fmtN(inv.subtotal)}`, sumX, y, { width: sumW, align: "right" }); y += 13;
    if (discPctVal > 0) {
      doc.text(`Discount (${discPctVal}%): -${fmtN(inv.discountAmount)}`, sumX, y, { width: sumW, align: "right" }); y += 13;
    }
    if (taxPctVal > 0) {
      doc.text(`Tax (${taxPctVal}%): +${fmtN(inv.taxAmount)}`, sumX, y, { width: sumW, align: "right" }); y += 13;
    }
  }

  // ── Separator ──
  y += 12;
  doc.save()
    .moveTo(L, y).lineTo(L + PW * 0.6, y).lineWidth(2).strokeColor("#091E39").stroke()
    .moveTo(L + PW * 0.6, y).lineTo(R, y).lineWidth(0.5).strokeColor("#ccc").stroke()
    .restore();
  y += 16;

  // ── Thank-you note + QR ──
  if (y + 90 > 740) { doc.addPage(); y = 40; }
  const noteY = y;
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f766e")
    .text("Payment received with thanks.", L, y);
  y += 16;
  doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e")
    .text(
      "This receipt confirms that the amount above has been received in full for the referenced invoice.",
      L, y, { width: PW * 0.6 },
    );

  if (qrDataUrl) {
    try {
      doc.image(qrDataUrl, R - 85, noteY, { width: 75, height: 75 });
      doc.fontSize(7).font("Helvetica").fillColor("#888")
        .text("Authorized · Scan to verify", R - 85, noteY + 78, { width: 75, align: "center" });
    } catch { /* ignore */ }
  }

  // ── Footer ──
  doc.fontSize(8).font("Helvetica").fillColor("#999")
    .text(`© ${new Date().getFullYear()} ADLM Studio — www.adlmstudio.net`, L, 780, { width: PW, align: "center" });
}

// Generate a QR data URL for the receipt (fails soft to empty string).
export async function receiptQrDataUrl() {
  try {
    return await QRCode.toDataURL("https://www.adlmstudio.net", { width: 80, margin: 1 });
  } catch {
    return "";
  }
}

// Build the receipt PDF as a Buffer (used for email attachment).
export async function receiptToBuffer(inv) {
  const qrDataUrl = await receiptQrDataUrl();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      renderReceipt(doc, inv, qrDataUrl);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
