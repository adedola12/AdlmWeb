import express from "express";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { requireAuth, requireAdmin, verifyAccess } from "../middleware/auth.js";
import { Invoice } from "../models/Invoice.js";
import { User } from "../models/User.js";
import { Setting } from "../models/Setting.js";
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
  // PDF download: try multiple auth methods since browser opens a new tab
  if (req.path.endsWith("/pdf")) {
    // Method 1: ?token= query param
    const qToken = req.query.token || "";
    // Method 2: cookie (browser sends cookies on same-origin navigation)
    const cToken =
      req.cookies?.at || req.cookies?.accessToken || req.cookies?.token || "";
    // Method 3: standard Authorization header
    const auth = req.headers.authorization || "";
    const hToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    const token = qToken || cToken || hToken;
    if (token) {
      try {
        req.user = verifyAccess(token);
        const role = String(req.user?.role || "").toLowerCase();
        if (role === "admin" || role === "mini_admin") {
          return next();
        }
      } catch {
        // token expired or invalid — fall through to standard auth
      }
    }
    // Fall through: try standard requireAuth chain
    return requireAuth(req, res, () => requireAdminOrMini(req, res, next));
  }
  // Default: standard auth — allow both admin and mini_admin
  return requireAuth(req, res, () => requireAdminOrMini(req, res, next));
});

// Allow both admin and mini_admin roles
function requireAdminOrMini(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role === "admin" || role === "mini_admin") return next();
  return res.status(403).json({ error: "Forbidden" });
}

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

// Helper: find registered user by email
async function resolveUserId(email) {
  if (!email) return null;
  const u = await User.findOne(
    { email: email.trim().toLowerCase() },
    { _id: 1 },
  ).lean();
  return u?._id || null;
}

// Suggest users by email or name (for autocomplete in invoice form)
router.get(
  "/user-suggest",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ users: [] });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");

    const users = await User.find(
      {
        $or: [
          { email: rx },
          { firstName: rx },
          { lastName: rx },
          { username: rx },
        ],
      },
      { email: 1, firstName: 1, lastName: 1, username: 1, whatsapp: 1 },
    )
      .limit(10)
      .lean();

    return res.json({
      users: users.map((u) => ({
        _id: u._id,
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "",
        phone: u.whatsapp || "",
      })),
    });
  }),
);

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

    // Default taxPercent from global VAT setting when caller didn't specify.
    // An explicit 0 from the admin form still wins (tax can be opted out per invoice).
    let taxPct;
    if (req.body.taxPercent === undefined || req.body.taxPercent === null || req.body.taxPercent === "") {
      const settings = await Setting.findOne({ key: "global" }).lean();
      const vatActive = !!settings?.vatEnabled && !!settings?.vatApplyToInvoices;
      taxPct = vatActive ? Math.min(Math.max(Number(settings?.vatPercent || 0), 0), 100) : 0;
    } else {
      taxPct = Math.min(Math.max(Number(req.body.taxPercent || 0), 0), 100);
    }

    const { subtotal, discountAmount, taxAmount, total } = computeTotals(
      items, discPct, taxPct,
    );

    const clientEmail = (req.body.clientEmail || "").trim().toLowerCase();
    const clientUserId = await resolveUserId(clientEmail);

    const inv = await Invoice.create({
      invoiceNumber,
      seq,
      invoiceDate: req.body.invoiceDate || new Date(),
      dueDate: req.body.dueDate || null,
      clientUserId: clientUserId || undefined,
      clientName: (req.body.clientName || "").trim(),
      clientEmail,
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

    // Re-resolve clientUserId if email changed
    if (req.body.clientEmail !== undefined || !inv.clientUserId) {
      const uid = await resolveUserId(inv.clientEmail);
      inv.clientUserId = uid || inv.clientUserId || undefined;
    }

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

// Re-link ALL invoices (re-resolve clientUserId from email for every invoice)
router.post(
  "/relink-users",
  asyncHandler(async (_req, res) => {
    const all = await Invoice.find({
      clientEmail: { $exists: true, $ne: "" },
    }).lean();

    let linked = 0;
    let updated = 0;
    for (const inv of all) {
      const uid = await resolveUserId(inv.clientEmail);
      if (uid) {
        const currentId = inv.clientUserId ? String(inv.clientUserId) : null;
        if (currentId !== String(uid)) {
          await Invoice.updateOne(
            { _id: inv._id },
            { $set: { clientUserId: uid } },
          );
          updated++;
        }
        linked++;
      }
    }

    return res.json({
      ok: true,
      message: `Checked ${all.length} invoices: ${linked} matched to users, ${updated} newly linked.`,
    });
  }),
);

// Send invoice to client via email
const WEB_URL =
  String(process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "").trim() ||
  "http://localhost:5173";

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

    // Resolve user — might have been created after invoice was made
    if (!inv.clientUserId) {
      const uid = await resolveUserId(inv.clientEmail);
      if (uid) {
        inv.clientUserId = uid;
      }
    }

    const isRegistered = !!inv.clientUserId;
    const curr = inv.currency === "USD" ? "$" : "N";
    const clientGreeting = inv.clientName || inv.clientOrganization || "Client";
    const dashboardUrl = `${WEB_URL}/dashboard`;
    const signupUrl = `${WEB_URL}/register`;

    // Build line items table for email
    const itemsHtml = (inv.items || [])
      .map(
        (it, i) =>
          `<tr style="border-bottom:1px solid #eee">
            <td style="padding:6px 8px;font-size:13px">${i + 1}.</td>
            <td style="padding:6px 8px;font-size:13px">${it.description || "—"}</td>
            <td style="padding:6px 8px;font-size:13px;text-align:center">${it.qty || 1}</td>
            <td style="padding:6px 8px;font-size:13px;text-align:right">${curr}${Number(it.unitPrice || 0).toLocaleString()}</td>
            <td style="padding:6px 8px;font-size:13px;text-align:right;font-weight:600">${curr}${Number(it.total || 0).toLocaleString()}</td>
          </tr>`,
      )
      .join("");

    const accountSection = isRegistered
      ? `<p style="margin-top:20px">
           You can view this invoice and track its status from your dashboard:
         </p>
         <p>
           <a href="${dashboardUrl}" style="display:inline-block;padding:10px 24px;background:#091E39;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
             View on Dashboard
           </a>
         </p>`
      : `<div style="margin-top:20px;padding:16px;background:#f0f7ff;border-radius:8px;border:1px solid #c5ddf5">
           <p style="margin:0 0 8px;font-weight:600;color:#091E39">Create your ADLM Studio account</p>
           <p style="margin:0 0 12px;font-size:13px;color:#333">
             Sign up to view invoices, track payments, and access your software subscriptions — all from your personal dashboard.
           </p>
           <a href="${signupUrl}" style="display:inline-block;padding:10px 24px;background:#E86A27;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
             Sign Up Now
           </a>
         </div>`;

    await sendMail({
      to: inv.clientEmail,
      subject: `Invoice ${inv.invoiceNumber} from ADLM Studio`,
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#262626">
          <div style="background:#091E39;padding:20px 24px;border-radius:8px 8px 0 0">
            <span style="color:#fff;font-size:18px;font-weight:700">ADLM Studio</span>
            <span style="color:#E86A27;font-size:18px;font-weight:700;float:right">Invoice</span>
          </div>
          <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
            <p>Dear ${clientGreeting},</p>
            <p>Please find your invoice details below:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#091E39;color:#fff">
                <th style="padding:8px;text-align:left;font-size:12px">#</th>
                <th style="padding:8px;text-align:left;font-size:12px">Description</th>
                <th style="padding:8px;text-align:center;font-size:12px">Qty</th>
                <th style="padding:8px;text-align:right;font-size:12px">Rate</th>
                <th style="padding:8px;text-align:right;font-size:12px">Amount</th>
              </tr>
              ${itemsHtml}
            </table>
            <div style="text-align:right;font-size:14px;line-height:1.8">
              <div>Subtotal: <b>${curr}${Number(inv.subtotal || 0).toLocaleString()}</b></div>
              ${Number(inv.discountPercent || 0) > 0 ? `<div style="color:#c0392b">Discount (${inv.discountPercent}%): -${curr}${Number(inv.discountAmount || 0).toLocaleString()}</div>` : ""}
              ${Number(inv.taxPercent || 0) > 0 ? `<div>Tax (${inv.taxPercent}%): +${curr}${Number(inv.taxAmount || 0).toLocaleString()}</div>` : ""}
              <div style="font-size:18px;font-weight:700;color:#091E39;border-top:2px solid #091E39;padding-top:8px;margin-top:8px">
                Total: ${curr}${Number(inv.total || 0).toLocaleString()}
              </div>
            </div>
            <div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:6px;font-size:13px">
              <b>Invoice #:</b> ${inv.invoiceNumber}<br/>
              <b>Date:</b> ${dayjs(inv.invoiceDate).format("MMMM D, YYYY")}<br/>
              ${inv.dueDate ? `<b>Due:</b> ${dayjs(inv.dueDate).format("MMMM D, YYYY")}<br/>` : ""}
            </div>
            <div style="margin-top:16px;font-size:13px">
              <b>Payment details:</b><br/>
              Account no: 1634998770<br/>
              Name: ADLM Studio<br/>
              Bank: Access Bank
            </div>
            ${accountSection}
            ${inv.terms ? `<div style="margin-top:16px;font-size:12px;color:#555"><b>Terms:</b><br/>${inv.terms.replace(/\n/g, "<br/>")}</div>` : ""}
          </div>
          <div style="text-align:center;padding:12px;font-size:11px;color:#999">
            &copy; ${new Date().getFullYear()} ADLM Studio &mdash; www.adlmstudio.net
          </div>
        </div>
      `,
    });

    if (inv.status === "draft") {
      inv.status = "sent";
    }
    await inv.save();

    return res.json({
      ok: true,
      isRegistered,
      message: isRegistered
        ? "Invoice sent — client can also view it on their dashboard."
        : "Invoice sent — client was invited to sign up on ADLM Studio.",
    });
  }),
);

export default router;
