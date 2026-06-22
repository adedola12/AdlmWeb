import express from "express";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import dayjs from "dayjs";
import { requireAuth, requirePermission, verifyAccess } from "../middleware/auth.js";
import { Proposal } from "../models/Proposal.js";
import { Product } from "../models/Product.js";
import { TrainingLocation } from "../models/TrainingLocation.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { attachUSDList } from "../util/fx.js";
import { sendMail } from "../util/mailer.js";
import { syncProposalToNotion } from "../util/notion.js";

const router = express.Router();

/* -------------------- auth (mirrors admin.invoices.js) -------------------- */
router.use((req, res, next) => {
  // PDF download opens in a new tab — accept token via query/cookie/header.
  if (req.path.endsWith("/pdf")) {
    const qToken = req.query.token || "";
    const cToken =
      req.cookies?.at || req.cookies?.accessToken || req.cookies?.token || "";
    const auth = req.headers.authorization || "";
    const hToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const token = qToken || cToken || hToken;
    if (token) {
      try {
        req.user = verifyAccess(token);
        const role = String(req.user?.role || "").toLowerCase();
        if (role === "admin" || role === "mini_admin") return next();
      } catch {
        /* fall through to standard auth */
      }
    }
    return requireAuth(req, res, () => requireAdminOrMini(req, res, next));
  }
  return requireAuth(req, res, () => requireAdminOrMini(req, res, next));
});

// Anyone holding the "proposals" admin area (admin / mini-admin / custom role).
const requireAdminOrMini = requirePermission("proposals");

const isFullAdmin = (req) =>
  String(req.user?.role || "").toLowerCase() === "admin";

// Mini admins only see proposals they created; full admins see everything.
const ownershipFilter = (req) =>
  isFullAdmin(req) ? {} : { createdBy: req.user?._id };

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const clamp = (n) => Math.min(Math.max(Number(n || 0), 0), 100);

/* -------------------- defaults (from the proposal template) -------------------- */
const DEFAULT_TIERS = [
  {
    name: "Starter",
    audience: "Small QS teams · ~5–10 surveyors",
    price: "₦1.5M / year",
    features: [
      "Core suite seats (HERON + RateGen)",
      "Team onboarding training",
      "Standard BOQ templates",
      "Email & remote support",
      "Quarterly rate updates",
    ],
    recommended: false,
  },
  {
    name: "Growth",
    audience: "Established firms · ~10–25 surveyors",
    price: "₦3M / year",
    features: [
      "Full suite (QUIV + HERON + MEP + RateGen)",
      "Onboarding + annual refresh + new-staff training",
      "Firm-wide standardisation layer",
      "Priority support with SLA",
      "Quarterly rate updates",
    ],
    recommended: true,
  },
  {
    name: "Enterprise",
    audience: "Large firms / multi-office · 25+ surveyors",
    price: "₦5M+ / year",
    features: [
      "Unlimited-team suite deployment",
      "Bespoke training calendar",
      "Custom standards & rate libraries",
      "Dedicated account support",
      "Roadmap input & early access",
    ],
    recommended: false,
  },
];

const DEFAULT_EXEC_SUMMARY =
  "Across the Nigerian built environment, an estimated 95% of QS and construction practice is still carried out manually. The firms that move first to a structured digital workflow win on tender speed, pricing accuracy, and client confidence.\n\n" +
  "ADLM Studio proposes a single annual partnership that takes your firm's entire quantity surveying function digital and keeps it there — combining purpose-built QS software, structured team training, a firm-wide standardisation layer, and continuous support and market-rate updates. This is a managed transformation programme designed to compound in value every year.";

const DEFAULT_TERMS =
  "This proposal is valid until the date stated above. Programmes may be invoiced annually or quarterly by agreement. Final tier and seat count are confirmed after the workflow audit. Payment by bank transfer to ADLM Studio · Access Bank · 1634998770.";

/* -------------------- helpers -------------------- */
async function nextProposalNumber() {
  const last = await Proposal.findOne().sort({ seq: -1 }).select("seq").lean();
  const nextSeq = (last?.seq || 0) + 1;
  return {
    seq: nextSeq,
    proposalNumber: `ADLM-PROP-${String(nextSeq).padStart(4, "0")}`,
  };
}

function computeTotals(items, discountPercent = 0, taxPercent = 0) {
  const subtotal = (items || []).reduce(
    (s, it) => s + Number(it.total || 0),
    0,
  );
  const discPct = clamp(discountPercent);
  const taxPct = clamp(taxPercent);
  const discountAmount = Math.round((subtotal * discPct) / 100 * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * taxPct) / 100 * 100) / 100;
  const total = Math.max(afterDiscount + taxAmount, 0);
  return { subtotal, discountAmount, taxAmount, total };
}

async function resolveUserId(email) {
  if (!email) return null;
  const u = await User.findOne(
    { email: email.trim().toLowerCase() },
    { _id: 1 },
  ).lean();
  return u?._id || null;
}

function computeTrainingRange(locations) {
  const ngn = (locations || [])
    .map((l) => Number(l.trainingCostNGN || 0))
    .filter((n) => n > 0);
  const usd = (locations || [])
    .map((l) => Number(l.trainingCostUSD || 0))
    .filter((n) => n > 0);
  return {
    minNGN: ngn.length ? Math.min(...ngn) : 0,
    maxNGN: ngn.length ? Math.max(...ngn) : 0,
    minUSD: usd.length ? Math.min(...usd) : 0,
    maxUSD: usd.length ? Math.max(...usd) : 0,
    locationsCount: (locations || []).length,
  };
}

const normalizeSuite = (arr) =>
  (Array.isArray(arr) ? arr : []).map((r) => ({
    productKey: String(r.productKey || "").trim(),
    name: String(r.name || "").trim(),
    whatItDoes: String(r.whatItDoes || "").trim(),
    platform: String(r.platform || "").trim(),
    listPrice: String(r.listPrice || "").trim(),
  }));

const normalizeTiers = (arr) =>
  (Array.isArray(arr) ? arr : []).map((t) => ({
    name: String(t.name || "").trim(),
    audience: String(t.audience || "").trim(),
    price: String(t.price || "").trim(),
    features: Array.isArray(t.features)
      ? t.features.map((f) => String(f || "").trim()).filter(Boolean)
      : [],
    recommended: !!t.recommended,
  }));

const normalizeItems = (arr) =>
  (Array.isArray(arr) ? arr : []).map((it) => ({
    source: String(it.source || "").trim(),
    description: String(it.description || "").trim(),
    term: String(it.term || "").trim(),
    qty: Number(it.qty || 1),
    unitPrice: Number(it.unitPrice || 0),
    total: Number(it.total || 0),
  }));

const normalizeTrainingRange = (r) => ({
  minNGN: Number(r?.minNGN || 0),
  maxNGN: Number(r?.maxNGN || 0),
  minUSD: Number(r?.minUSD || 0),
  maxUSD: Number(r?.maxUSD || 0),
  locationsCount: Number(r?.locationsCount || 0),
});

// The founder / main-account counter-sign seal — a stable unique code stored
// once in the global Setting. Auto-generated on first use.
async function getFounderCounterSign() {
  let s = await Setting.findOne({ key: "global" });
  if (!s) {
    s = await Setting.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { upsert: true, new: true },
    );
  }
  const updates = {};
  if (!s.founderSignatureCode) {
    updates.founderSignatureCode =
      "ADLM-CS-" + crypto.randomBytes(6).toString("hex").toUpperCase();
  }
  if (!s.founderSignatureName) {
    updates.founderSignatureName = "Adedolapo Quasim · Founder, ADLM Studio";
  }
  if (Object.keys(updates).length) {
    await Setting.updateOne({ key: "global" }, { $set: updates });
    Object.assign(s, updates);
  }
  return { code: s.founderSignatureCode, name: s.founderSignatureName };
}

// Identity of the signed-in admin preparing the proposal.
async function getPreparerIdentity(req) {
  let name = "";
  let email = String(req.user?.email || "");
  try {
    const u = await User.findById(req.user?._id, {
      firstName: 1,
      lastName: 1,
      username: 1,
      email: 1,
    }).lean();
    if (u) {
      name =
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.username ||
        u.email ||
        "";
      email = u.email || email;
    }
  } catch {
    /* fall back to token fields */
  }
  return { name: name || email || "ADLM Admin", email };
}

/* -------------------- routes -------------------- */

// Live catalog for the proposal builder — products + training price range.
router.get(
  "/catalog",
  asyncHandler(async (req, res) => {
    const [rawProducts, locations, settings] = await Promise.all([
      Product.find({ isPublished: true })
        .sort({ sort: -1, createdAt: -1 })
        .lean(),
      TrainingLocation.find({ isActive: true }).sort({ name: 1 }).lean(),
      Setting.findOne({ key: "global" }).lean(),
    ]);
    const products = await attachUSDList(rawProducts);
    const vatActive =
      !!settings?.vatEnabled && !!settings?.vatApplyToInvoices;
    res.json({
      ok: true,
      products,
      locations,
      trainingRange: computeTrainingRange(locations),
      tiers: DEFAULT_TIERS,
      narrative: {
        execSummary: DEFAULT_EXEC_SUMMARY,
        terms: DEFAULT_TERMS,
      },
      defaultTaxPercent: vatActive ? clamp(settings?.vatPercent || 0) : 0,
    });
  }),
);

// Client autocomplete (registered users) — same as invoices.
router.get(
  "/user-suggest",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ users: [] });
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");
    const users = await User.find(
      { $or: [{ email: rx }, { firstName: rx }, { lastName: rx }, { username: rx }] },
      { email: 1, firstName: 1, lastName: 1, username: 1, whatsapp: 1 },
    )
      .limit(10)
      .lean();
    res.json({
      users: users.map((u) => ({
        _id: u._id,
        email: u.email,
        name:
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.username ||
          "",
        phone: u.whatsapp || "",
      })),
    });
  }),
);

// List
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { ...ownershipFilter(req) };
    if (req.query.status) filter.status = req.query.status;
    const proposals = await Proposal.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ ok: true, proposals });
  }),
);

// Get one
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const proposal = await Proposal.findOne({
      _id: req.params.id,
      ...ownershipFilter(req),
    }).lean();
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });
    res.json({ ok: true, proposal });
  }),
);

// Create
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { seq, proposalNumber } = await nextProposalNumber();
    const items = normalizeItems(req.body.items);
    const discPct = clamp(req.body.discountPercent);

    let taxPct;
    if (
      req.body.taxPercent === undefined ||
      req.body.taxPercent === null ||
      req.body.taxPercent === ""
    ) {
      const settings = await Setting.findOne({ key: "global" }).lean();
      const vatActive =
        !!settings?.vatEnabled && !!settings?.vatApplyToInvoices;
      taxPct = vatActive ? clamp(settings?.vatPercent || 0) : 0;
    } else {
      taxPct = clamp(req.body.taxPercent);
    }

    const { subtotal, discountAmount, taxAmount, total } = computeTotals(
      items,
      discPct,
      taxPct,
    );
    const clientEmail = (req.body.clientEmail || "").trim().toLowerCase();
    const clientUserId = await resolveUserId(clientEmail);
    const preparer = await getPreparerIdentity(req);
    const counterSign = await getFounderCounterSign();

    const proposal = await Proposal.create({
      proposalNumber,
      seq,
      proposalDate: req.body.proposalDate || new Date(),
      validUntil: req.body.validUntil || null,
      clientFirm: (req.body.clientFirm || "").trim(),
      clientContact: (req.body.clientContact || "").trim(),
      clientTitle: (req.body.clientTitle || "").trim(),
      clientEmail,
      clientPhone: (req.body.clientPhone || "").trim(),
      clientAddress: (req.body.clientAddress || "").trim(),
      clientUserId: clientUserId || undefined,
      clientCategory: (req.body.clientCategory || "Lead").trim(),
      preparedBy: (req.body.preparedBy || "").trim() || undefined,
      currency: ["NGN", "USD"].includes(req.body.currency)
        ? req.body.currency
        : "NGN",
      suite: normalizeSuite(req.body.suite),
      tiers: normalizeTiers(req.body.tiers),
      trainingRange: normalizeTrainingRange(req.body.trainingRange),
      items,
      subtotal,
      discountPercent: discPct,
      discountAmount,
      taxPercent: taxPct,
      taxAmount,
      total,
      execSummary: (req.body.execSummary || "").trim(),
      terms: (req.body.terms || "").trim(),
      notes: (req.body.notes || "").trim(),
      status: req.body.status || "draft",
      createdBy: req.user._id,
      preparer,
      counterSign,
    });

    // Auto-sync to the Notion CRM (best-effort; never blocks the save).
    const notion = await syncProposalToNotion(proposal);
    proposal.notion = notion;
    proposal.markModified("notion");
    await proposal.save();

    res.json({ ok: true, proposal });
  }),
);

// Update
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const proposal = await Proposal.findOne({
      _id: req.params.id,
      ...ownershipFilter(req),
    });
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });

    const strFields = [
      "clientFirm",
      "clientContact",
      "clientTitle",
      "clientPhone",
      "clientAddress",
      "clientCategory",
      "preparedBy",
      "execSummary",
      "terms",
      "notes",
    ];
    for (const f of strFields) {
      if (req.body[f] !== undefined)
        proposal[f] = String(req.body[f] || "").trim();
    }
    if (req.body.clientEmail !== undefined)
      proposal.clientEmail = String(req.body.clientEmail || "")
        .trim()
        .toLowerCase();
    if (req.body.proposalDate !== undefined)
      proposal.proposalDate = req.body.proposalDate || new Date();
    if (req.body.validUntil !== undefined)
      proposal.validUntil = req.body.validUntil || null;
    if (
      req.body.currency !== undefined &&
      ["NGN", "USD"].includes(req.body.currency)
    )
      proposal.currency = req.body.currency;
    if (req.body.status !== undefined) proposal.status = req.body.status;
    if (req.body.suite !== undefined)
      proposal.suite = normalizeSuite(req.body.suite);
    if (req.body.tiers !== undefined)
      proposal.tiers = normalizeTiers(req.body.tiers);
    if (req.body.trainingRange !== undefined)
      proposal.trainingRange = normalizeTrainingRange(req.body.trainingRange);
    if (req.body.items !== undefined)
      proposal.items = normalizeItems(req.body.items);
    if (req.body.discountPercent !== undefined)
      proposal.discountPercent = clamp(req.body.discountPercent);
    if (req.body.taxPercent !== undefined)
      proposal.taxPercent = clamp(req.body.taxPercent);

    const { subtotal, discountAmount, taxAmount, total } = computeTotals(
      proposal.items,
      proposal.discountPercent,
      proposal.taxPercent,
    );
    proposal.subtotal = subtotal;
    proposal.discountAmount = discountAmount;
    proposal.taxAmount = taxAmount;
    proposal.total = total;

    if (req.body.clientEmail !== undefined || !proposal.clientUserId) {
      const uid = await resolveUserId(proposal.clientEmail);
      proposal.clientUserId = uid || proposal.clientUserId || undefined;
    }

    // Backfill signing identity on proposals created before this existed.
    if (!proposal.preparer || !proposal.preparer.name) {
      proposal.preparer = await getPreparerIdentity(req);
      proposal.markModified("preparer");
    }
    if (!proposal.counterSign || !proposal.counterSign.code) {
      proposal.counterSign = await getFounderCounterSign();
      proposal.markModified("counterSign");
    }

    const notion = await syncProposalToNotion(proposal);
    proposal.notion = notion;
    proposal.markModified("notion");
    await proposal.save();

    res.json({ ok: true, proposal });
  }),
);

// Delete
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const proposal = await Proposal.findOne({
      _id: req.params.id,
      ...ownershipFilter(req),
    });
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });
    await proposal.deleteOne();
    res.json({ ok: true });
  }),
);

// Server-generated PDF
router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const proposal = await Proposal.findOne({
      _id: req.params.id,
      ...ownershipFilter(req),
    }).lean();
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });
    const buf = await buildProposalPdfBuffer(proposal);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${proposal.proposalNumber}.pdf"`,
    );
    res.send(buf);
  }),
);

// Send to client — email with the proposal PDF attached
const WEB_URL =
  String(
    process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "",
  ).trim() || "http://localhost:5173";

router.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const proposal = await Proposal.findOne({
      _id: req.params.id,
      ...ownershipFilter(req),
    });
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });
    if (!proposal.clientEmail)
      return res
        .status(400)
        .json({ error: "Client email is required to send proposal" });

    const pdfBuf = await buildProposalPdfBuffer(proposal.toObject());
    const curr = proposal.currency === "USD" ? "$" : "₦";
    const firm = proposal.clientFirm || "your firm";
    const greeting = proposal.clientContact || proposal.clientFirm || "there";
    const validStr = proposal.validUntil
      ? dayjs(proposal.validUntil).format("MMMM D, YYYY")
      : "";

    await sendMail({
      to: proposal.clientEmail,
      subject: `Digital Transformation Proposal ${proposal.proposalNumber} — ADLM Studio`,
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0D2240">
          <div style="background:#0D2240;padding:22px 24px;border-radius:8px 8px 0 0">
            <span style="color:#fff;font-size:18px;font-weight:700">ADLM Studio</span>
            <span style="color:#F07020;font-size:13px;font-weight:600;float:right;margin-top:5px">Digital Transformation Proposal</span>
          </div>
          <div style="padding:24px;border:1px solid #e3e8ef;border-top:none;border-radius:0 0 8px 8px">
            <p>Dear ${greeting},</p>
            <p>Thank you for the opportunity to support ${firm}'s digital transformation.
               Please find attached our proposal <b>${proposal.proposalNumber}</b> covering ADLM's
               QS software suite, team training, firm-wide standardisation, and ongoing support.</p>
            <div style="margin:16px 0;padding:14px 16px;background:#f6f8fb;border-radius:8px;font-size:13px;line-height:1.7">
              <b>Proposal No.:</b> ${proposal.proposalNumber}<br/>
              <b>Prepared for:</b> ${firm}<br/>
              <b>Investment:</b> ${curr}${Number(proposal.total || 0).toLocaleString()}
              ${validStr ? `<br/><b>Valid until:</b> ${validStr}` : ""}
            </div>
            <p>The full proposal is attached as a PDF. You can also view it online:</p>
            <p>
              <a href="${WEB_URL}/proposal/${proposal.shareToken}"
                 style="display:inline-block;padding:10px 24px;background:#0D2240;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
                View Proposal Online
              </a>
            </p>
            <div style="margin-top:18px;font-size:13px;line-height:1.7">
              <b>Payment details</b><br/>
              ADLM Studio · Access Bank · 1634998770
            </div>
            <p style="margin-top:16px;font-size:12px;color:#5b6b80">
              Questions? Reply to this email or reach us at hello@adlmstudio.net.
            </p>
          </div>
          <div style="text-align:center;padding:12px;font-size:11px;color:#99a">
            &copy; ${new Date().getFullYear()} ADLM Studio &mdash; adlmstudio.net
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${proposal.proposalNumber}.pdf`,
          content: pdfBuf.toString("base64"),
        },
      ],
    });

    if (proposal.status === "draft") proposal.status = "sent";
    const notion = await syncProposalToNotion(proposal);
    proposal.notion = notion;
    proposal.markModified("notion");
    await proposal.save();

    res.json({ ok: true, message: "Proposal emailed to client." });
  }),
);

/* ============================================================
   PDF rendering — on-brand multi-page A4 proposal (PDFKit)
   ============================================================ */
const NAVY = "#0D2240";
const BLUE = "#1E6BCC";
const ORANGE = "#F07020";
const SKY = "#40B0E0";
const MUTED = "#5b6b80";
const LINE = "#e3e8ef";
const WASH = "#f6f8fb";
const INK = "#33445c";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 50; // content margin
const CW = PAGE_W - M * 2; // content width

// Helvetica (WinAnsi) cannot render the Naira glyph — use a text prefix.
const pdfSafe = (s) => String(s == null ? "" : s).replace(/₦/g, "NGN ");
const money = (n, currency) =>
  `${currency === "USD" ? "$" : "NGN "}${Number(n || 0).toLocaleString(
    "en-NG",
    { maximumFractionDigits: 2 },
  )}`;

async function buildProposalPdfBuffer(proposal) {
  const p = proposal || {};

  // Pre-render the two authentication QR codes (PDFKit drawing is sync).
  const verifyUrl = p.shareToken
    ? `${WEB_URL}/proposal/${p.shareToken}`
    : WEB_URL;
  const csCode = p?.counterSign?.code || "";
  const qrs = {};
  try {
    qrs.preparer = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1 });
  } catch {
    /* QR optional */
  }
  try {
    qrs.counterSign = await QRCode.toDataURL(
      csCode ? `${verifyUrl}?cs=${encodeURIComponent(csCode)}` : verifyUrl,
      { width: 150, margin: 1 },
    );
  } catch {
    /* QR optional */
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      renderProposalPdf(doc, p, qrs);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function sectionKicker(doc, text, y) {
  doc
    .fillColor(BLUE)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(pdfSafe(text).toUpperCase(), M, y, { characterSpacing: 1.5 });
}

function sectionTitle(doc, text, y) {
  doc.save().rect(M, y, 6, 20).fill(ORANGE).restore();
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(pdfSafe(text), M + 14, y + 1, { width: CW - 14 });
}

function renderProposalPdf(doc, p, qrs = {}) {
  const currency = p.currency === "USD" ? "USD" : "NGN";
  const firm = p.clientFirm || "Your Firm";

  /* ---------- PAGE 1 — COVER ---------- */
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);

  // wordmark
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(24)
    .text("ADLM", M, 62, { continued: true })
    .fillColor(ORANGE)
    .text(" Studio");
  doc
    .fillColor("#7d92b4")
    .font("Helvetica")
    .fontSize(7.5)
    .text("ACADEMY FOR DIGITAL LEARNING & MASTERY", M, 92, {
      characterSpacing: 2,
    });

  doc
    .fillColor(SKY)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("QS & BIM DIGITAL TRANSFORMATION", M, 250, {
      characterSpacing: 2.5,
    });
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(31)
    .text(`Transforming How ${pdfSafe(firm)} Delivers Quantity Surveying`, M, 272, {
      width: CW,
      lineGap: 2,
    });
  doc
    .fillColor("#aebfd6")
    .font("Helvetica")
    .fontSize(11)
    .text(
      "A proposal to move your QS team from manual practice to a standardised, always-current digital workflow — powered by ADLM's QS software suite, training, and ongoing support.",
      M,
      doc.y + 14,
      { width: CW - 70, lineGap: 2 },
    );

  // client card
  const cardY = 470;
  doc.save().roundedRect(M, cardY, CW, 132, 12).fill("#16315a").restore();
  const colW = (CW - 48) / 2;
  const cell = (label, value, cx, cy) => {
    doc
      .fillColor(SKY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(label.toUpperCase(), cx, cy, { characterSpacing: 1.5 });
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .text(pdfSafe(value || "—"), cx, cy + 13, { width: colW });
  };
  cell("Prepared For", firm, M + 24, cardY + 22);
  cell(
    "Attention",
    [p.clientContact, p.clientTitle].filter(Boolean).join(" — "),
    M + 24 + colW,
    cardY + 22,
  );
  cell(
    "Prepared By",
    p.preparedBy || "Adedolapo Quasim · Founder, ADLM Studio",
    M + 24,
    cardY + 76,
  );
  cell(
    "Proposal No.",
    `${p.proposalNumber || ""}  ·  ${dayjs(p.proposalDate || new Date()).format("MMM D, YYYY")}`,
    M + 24 + colW,
    cardY + 76,
  );

  doc
    .fillColor("#8fa4c4")
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Academy for Digital Learning & Mastery Studios  ·  RC 7440343  ·  Lagos, Nigeria  ·  adlmstudio.net",
      M,
      PAGE_H - 60,
      { width: CW },
    );

  /* ---------- PAGE 2 — EXECUTIVE SUMMARY ---------- */
  doc.addPage();
  let y = 60;
  sectionKicker(doc, "01 — Executive Summary", y);
  sectionTitle(doc, "Why this matters now", y + 16);
  y += 52;
  const execText =
    p.execSummary && p.execSummary.trim()
      ? p.execSummary
      : "ADLM Studio proposes a single annual partnership that takes your firm's entire quantity surveying function digital and keeps it there.";
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(11)
    .text(pdfSafe(execText), M, y, { width: CW, lineGap: 3 });
  y = doc.y + 24;

  sectionKicker(doc, "02 — The Challenge", y);
  sectionTitle(doc, "What manual QS practice costs a firm", y + 16);
  y += 56;
  const challenges = [
    ["SLOW TENDERS", "Manual take-offs and BOQ preparation stretch tender turnaround from days into weeks."],
    ["INCONSISTENT OUTPUT", "Every QS works differently — no firm-wide standard, formats or rate basis."],
    ["PRICING RISK", "Rates fall out of date in months; one mispriced tender can erase a project's margin."],
    ["KEY-PERSON RISK", "Knowledge lives in individuals, not systems — exposure when staff turn over."],
  ];
  const cardW = (CW - 14) / 2;
  challenges.forEach(([head, body], i) => {
    const cx = M + (i % 2) * (cardW + 14);
    const cy = y + Math.floor(i / 2) * 96;
    doc
      .save()
      .roundedRect(cx, cy, cardW, 84, 10)
      .fill(WASH)
      .restore();
    doc
      .fillColor(ORANGE)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(head, cx + 14, cy + 14, { characterSpacing: 0.5 });
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9.5)
      .text(body, cx + 14, cy + 30, { width: cardW - 28, lineGap: 1.5 });
  });

  /* ---------- PAGE 3 — THE ADLM SOLUTION ---------- */
  doc.addPage();
  y = 60;
  sectionKicker(doc, "03 — The ADLM Solution", y);
  sectionTitle(doc, "One integrated QS digital backbone", y + 16);
  y += 50;
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      "Our software suite shares a single live rate engine, so every take-off across your firm prices from the same, continuously updated basis.",
      M,
      y,
      { width: CW, lineGap: 2 },
    );
  y = doc.y + 16;

  // suite table
  const suite =
    Array.isArray(p.suite) && p.suite.length
      ? p.suite
      : [{ name: "ADLM QS Suite", whatItDoes: "Quantity take-off & BOQ automation", platform: "", listPrice: "" }];
  const cols = [
    { w: 100, label: "PRODUCT" },
    { w: 235, label: "WHAT IT DOES" },
    { w: 95, label: "PLATFORM" },
    { w: CW - 100 - 235 - 95, label: "LIST PRICE" },
  ];
  // header
  doc.save().rect(M, y, CW, 24).fill(NAVY).restore();
  let cx = M;
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
  cols.forEach((c, i) => {
    doc.text(c.label, cx + 8, y + 8, {
      width: c.w - 12,
      align: i === 3 ? "right" : "left",
    });
    cx += c.w;
  });
  y += 24;
  // rows
  suite.forEach((row, idx) => {
    const rowText = pdfSafe(row.whatItDoes || "");
    const descH = doc
      .font("Helvetica")
      .fontSize(9)
      .heightOfString(rowText, { width: cols[1].w - 12 });
    const rowH = Math.max(descH + 14, 30);
    if (y + rowH > PAGE_H - 220) {
      doc.addPage();
      y = 60;
    }
    if (idx % 2 === 1)
      doc.save().rect(M, y, CW, rowH).fill("#fafbfd").restore();
    cx = M;
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(pdfSafe(row.name || "—"), cx + 8, y + 7, { width: cols[0].w - 12 });
    cx += cols[0].w;
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(rowText || "—", cx + 8, y + 7, { width: cols[1].w - 12 });
    cx += cols[1].w;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(pdfSafe(row.platform || "—"), cx + 8, y + 7, {
        width: cols[2].w - 12,
      });
    cx += cols[2].w;
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(pdfSafe(row.listPrice || "—"), cx + 8, y + 7, {
        width: cols[3].w - 12,
        align: "right",
      });
    doc
      .save()
      .moveTo(M, y + rowH)
      .lineTo(M + CW, y + rowH)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke()
      .restore();
    y += rowH;
  });

  // physical training range callout
  y += 22;
  if (y > PAGE_H - 150) {
    doc.addPage();
    y = 60;
  }
  const tr = p.trainingRange || {};
  const minV = currency === "USD" ? tr.minUSD : tr.minNGN;
  const maxV = currency === "USD" ? tr.maxUSD : tr.maxNGN;
  let rangeLine;
  if (Number(minV) > 0 && Number(maxV) > 0) {
    rangeLine =
      Number(minV) === Number(maxV)
        ? `Per-location investment: ${money(minV, currency)}`
        : `Per-location investment ranges from ${money(minV, currency)} to ${money(maxV, currency)}`;
    if (tr.locationsCount)
      rangeLine += ` across ${tr.locationsCount} training location${tr.locationsCount === 1 ? "" : "s"}.`;
  } else {
    rangeLine =
      "Hands-on training is delivered at ADLM regional centres; per-location pricing confirmed on scheduling.";
  }
  const calloutH = 78;
  doc
    .save()
    .roundedRect(M, y, CW, calloutH, 10)
    .fillAndStroke(WASH, LINE)
    .restore();
  doc.save().rect(M, y, 6, calloutH).fill(SKY).restore();
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Physical Training & On-site Deployment", M + 20, y + 14);
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(9.5)
    .text(pdfSafe(rangeLine), M + 20, y + 32, {
      width: CW - 40,
      lineGap: 2,
    });

  /* ---------- PAGE 4 — PROGRAMME TIERS ---------- */
  doc.addPage();
  y = 60;
  sectionKicker(doc, "04 — The Transformation Programme", y);
  sectionTitle(doc, "Annual partnership tiers", y + 16);
  y += 56;
  const tiers =
    Array.isArray(p.tiers) && p.tiers.length ? p.tiers : DEFAULT_TIERS;
  const tierW = (CW - 24) / 3;
  const tierH = 360;
  tiers.slice(0, 3).forEach((t, i) => {
    const tx = M + i * (tierW + 12);
    const featured = !!t.recommended;
    doc
      .save()
      .roundedRect(tx, y, tierW, tierH, 12)
      .fillAndStroke("#ffffff", featured ? ORANGE : LINE)
      .restore();
    if (featured) {
      doc
        .save()
        .roundedRect(tx + 14, y + 14, 78, 16, 8)
        .fill(ORANGE)
        .restore();
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("RECOMMENDED", tx + 14, y + 19, {
          width: 78,
          align: "center",
          characterSpacing: 1,
        });
    }
    let ty = y + (featured ? 40 : 18);
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(pdfSafe(t.name || "").toUpperCase(), tx + 14, ty, {
        width: tierW - 28,
      });
    ty += 20;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(pdfSafe(t.audience || ""), tx + 14, ty, { width: tierW - 28 });
    ty += 26;
    doc
      .fillColor(featured ? ORANGE : BLUE)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(pdfSafe(t.price || ""), tx + 14, ty, { width: tierW - 28 });
    ty += 30;
    (t.features || []).forEach((f) => {
      doc.save().circle(tx + 17, ty + 4, 2.2).fill(SKY).restore();
      const fh = doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(8.5)
        .heightOfString(pdfSafe(f), { width: tierW - 40 });
      doc.text(pdfSafe(f), tx + 26, ty, { width: tierW - 40, lineGap: 1 });
      ty += Math.max(fh, 12) + 5;
    });
  });
  y += tierH + 16;
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Programmes may be invoiced annually or quarterly by agreement. Tier and seat count confirmed after the workflow audit.",
      M,
      y,
      { width: CW },
    );

  /* ---------- PAGE 5 — QUOTATION ---------- */
  doc.addPage();
  y = 60;
  sectionKicker(doc, "05 — Investment & Quotation", y);
  sectionTitle(doc, "Quotation", y + 16);
  y += 52;

  // meta
  const meta = [
    ["BILLED TO", firm],
    ["PROPOSAL NO.", p.proposalNumber || "—"],
    ["DATE ISSUED", dayjs(p.proposalDate || new Date()).format("MMMM D, YYYY")],
    [
      "VALID UNTIL",
      p.validUntil ? dayjs(p.validUntil).format("MMMM D, YYYY") : "—",
    ],
  ];
  meta.forEach(([label, value], i) => {
    const mx = M + (i % 2) * (CW / 2);
    const my = y + Math.floor(i / 2) * 36;
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(label, mx, my, { characterSpacing: 1 });
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .text(pdfSafe(value), mx, my + 11, { width: CW / 2 - 16 });
  });
  y += 84;

  // items table
  const qc = [
    { w: CW - 95 - 55 - 95, label: "DESCRIPTION", align: "left" },
    { w: 95, label: "TERM", align: "left" },
    { w: 55, label: "QTY", align: "center" },
    { w: 95, label: "AMOUNT", align: "right" },
  ];
  doc.save().rect(M, y, CW, 24).fill(NAVY).restore();
  cx = M;
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
  qc.forEach((c) => {
    doc.text(c.label, cx + 8, y + 8, { width: c.w - 12, align: c.align });
    cx += c.w;
  });
  y += 24;

  const items = Array.isArray(p.items) ? p.items : [];
  items.forEach((it, idx) => {
    const descH = doc
      .font("Helvetica")
      .fontSize(9)
      .heightOfString(pdfSafe(it.description || "—"), { width: qc[0].w - 12 });
    const rowH = Math.max(descH + 14, 28);
    if (y + rowH > PAGE_H - 290) {
      doc.addPage();
      y = 60;
    }
    if (idx % 2 === 1)
      doc.save().rect(M, y, CW, rowH).fill("#fafbfd").restore();
    cx = M;
    doc
      .fillColor(NAVY)
      .font("Helvetica")
      .fontSize(9)
      .text(pdfSafe(it.description || "—"), cx + 8, y + 7, {
        width: qc[0].w - 12,
      });
    cx += qc[0].w;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(pdfSafe(it.term || "—"), cx + 8, y + 7, { width: qc[1].w - 12 });
    cx += qc[1].w;
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(String(it.qty || 1), cx + 8, y + 7, {
        width: qc[2].w - 12,
        align: "center",
      });
    cx += qc[2].w;
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(money(it.total, currency), cx + 8, y + 7, {
        width: qc[3].w - 12,
        align: "right",
      });
    doc
      .save()
      .moveTo(M, y + rowH)
      .lineTo(M + CW, y + rowH)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke()
      .restore();
    y += rowH;
  });
  if (!items.length) {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text("No line items.", M + 8, y + 8);
    y += 28;
  }

  // totals
  y += 12;
  const totW = 230;
  const totX = M + CW - totW;
  const totRow = (label, value, opts = {}) => {
    if (opts.bar) {
      doc.save().roundedRect(totX, y, totW, 26, 4).fill(NAVY).restore();
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(label, totX + 12, y + 8);
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(value, totX, y + 8, { width: totW - 12, align: "right" });
      y += 26;
    } else {
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(9.5)
        .text(label, totX + 4, y);
      doc.text(value, totX, y, { width: totW - 4, align: "right" });
      y += 16;
    }
  };
  totRow("Subtotal", money(p.subtotal, currency));
  if (Number(p.discountPercent) > 0)
    totRow(
      `Discount (${p.discountPercent}%)`,
      `- ${money(p.discountAmount, currency)}`,
    );
  if (Number(p.taxPercent) > 0)
    totRow(`VAT (${p.taxPercent}%)`, `+ ${money(p.taxAmount, currency)}`);
  y += 4;
  totRow("Total Due", money(p.total, currency), { bar: true });

  // payment box
  y += 22;
  const payH = 56;
  doc
    .save()
    .roundedRect(M, y, CW, payH, 10)
    .fillAndStroke("#f2f7fd", BLUE)
    .restore();
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Payment", M + 16, y + 12);
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      `Bank transfer to ADLM Studio  ·  Access Bank  ·  1634998770. Please use ${p.proposalNumber || "the proposal number"} as the payment reference.`,
      M + 16,
      y + 27,
      { width: CW - 32, lineGap: 1.5 },
    );
  y += payH + 22;

  // acceptance — client signature + ADLM authentication QR codes
  if (y > PAGE_H - 175) {
    doc.addPage();
    y = 60;
  }
  const halfW = (CW - 40) / 2;
  const rightX = M + halfW + 40;

  // left — client signature line
  doc
    .save()
    .moveTo(M, y + 50)
    .lineTo(M + halfW, y + 50)
    .lineWidth(1.5)
    .strokeColor(NAVY)
    .stroke()
    .restore();
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      pdfSafe(`Authorised for ${firm} — name, signature & date`),
      M,
      y + 56,
      { width: halfW },
    );

  // right — ADLM authentication: preparer + founder counter-sign QR codes
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("AUTHORISED — ADLM STUDIO", rightX, y, { characterSpacing: 0.5 });
  const qrSize = 52;
  const qrGap = 22;
  const qrY = y + 14;
  if (qrs?.preparer) {
    try {
      doc.image(qrs.preparer, rightX, qrY, { width: qrSize, height: qrSize });
    } catch {
      /* QR optional */
    }
  }
  if (qrs?.counterSign) {
    try {
      doc.image(qrs.counterSign, rightX + qrSize + qrGap, qrY, {
        width: qrSize,
        height: qrSize,
      });
    } catch {
      /* QR optional */
    }
  }
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(6.5);
  doc.text("PREPARED & SENT BY", rightX, qrY + qrSize + 5, {
    width: qrSize + qrGap,
  });
  doc.text("FOUNDER COUNTER-SIGN", rightX + qrSize + qrGap, qrY + qrSize + 5, {
    width: qrSize + 40,
  });
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(7.5);
  doc.text(pdfSafe(p.preparer?.name || "ADLM Admin"), rightX, qrY + qrSize + 14, {
    width: qrSize + qrGap,
  });
  doc.text(
    pdfSafe(p.counterSign?.name || "ADLM Studio"),
    rightX + qrSize + qrGap,
    qrY + qrSize + 14,
    { width: qrSize + 40 },
  );
  doc
    .fillColor(MUTED)
    .font("Helvetica-Oblique")
    .fontSize(6.5)
    .text("Scan either code to verify this proposal online.", rightX, qrY + qrSize + 34, {
      width: halfW,
    });
  y = qrY + qrSize + 48;

  // terms footer
  if (p.terms && p.terms.trim() && y < PAGE_H - 80) {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(pdfSafe(p.terms), M, y, { width: CW, lineGap: 1.5 });
  }
}

export default router;
export { buildProposalPdfBuffer };
