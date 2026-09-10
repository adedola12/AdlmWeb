// server/routes/admin.documents.js
//
// The Documents group: what the studio produces, what it spends on AI, what
// was done in the admin, and what the system is set to.
//
// His group is Composer, Templates, Issued, AI usage and System. Two of those
// we do not have and they stay absent rather than becoming empty screens:
// there is no template store (document templates are code), and no register of
// what has been issued (a PDF is generated and sent, and nothing records that
// it happened).
//
// AI USAGE IS THE ONE THAT PAYS FOR ITSELF
//
// 163 calls are logged with their token counts and cost, and until now the
// only way to read it was a chart of the last 30 days. What an administrator
// actually needs to know is which FEATURE is spending the money — Ada, the
// quiz drafter, the programme estimator — because that is the thing that can
// be turned down. So it is grouped by feature and by person, and the totals
// are summed in the database rather than over a page of rows.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { AiUsage } from "../models/AiUsage.js";
import { AiAllocation } from "../models/AiAllocation.js";
import { AuditLog } from "../models/AuditLog.js";
import { Proposal } from "../models/Proposal.js";
import { Invoice } from "../models/Invoice.js";
import { SavedDocument } from "../models/SavedDocument.js";
import { TemplateRequest } from "../models/TemplateRequest.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { User } from "../models/User.js";
import { sendMail } from "../util/mailer.js";
import { wrapEmail } from "../util/emailLayout.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";
import { Setting } from "../models/Setting.js";

const router = express.Router();
const hub = [requireAuth, requirePermission("adminhub")];

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DAY = 864e5;

/* ─────────────────────────────────────────────────────────────── ai usage ── */

router.get("/ai-usage", ...hub, async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * DAY);

    const [byFeature, byPerson, totals] = await Promise.all([
      AiUsage.aggregate([
        { $match: { at: { $gte: since } } },
        {
          $group: {
            _id: "$feature",
            calls: { $sum: 1 },
            inTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
            outTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
            cost: { $sum: { $ifNull: ["$costUsd", 0] } },
          },
        },
        { $sort: { cost: -1, calls: -1 } },
      ]),
      AiUsage.aggregate([
        { $match: { at: { $gte: since } } },
        {
          $group: {
            _id: { email: "$email", name: "$name" },
            calls: { $sum: 1 },
            cost: { $sum: { $ifNull: ["$costUsd", 0] } },
            features: { $addToSet: "$feature" },
          },
        },
        { $sort: { cost: -1 } },
        { $limit: 50 },
      ]),
      AiUsage.aggregate([
        { $match: { at: { $gte: since } } },
        {
          $group: {
            _id: null,
            calls: { $sum: 1 },
            cost: { $sum: { $ifNull: ["$costUsd", 0] } },
            inTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
            outTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
          },
        },
      ]),
    ]);

    // WHO SPENT IT HAS TO BE ACTIONABLE, NOT JUST READABLE
    //
    // The rows are grouped by email, because that is what a usage record
    // carries. An allowance is held against a user id, so the two have to be
    // joined before an administrator can do anything about a row: without the
    // id, "this person is spending too much" is a fact with no button on it.
    //
    // Two queries for the whole page rather than one per row, and both are
    // skipped entirely when nobody signed-in has spent anything.
    const emails = [
      ...new Set(byPerson.map((p) => (p._id.email || "").toLowerCase()).filter(Boolean)),
    ];
    let idOf = new Map();
    let allowOf = new Map();
    if (emails.length) {
      const users = await User.find({ email: { $in: emails } })
        .select("email")
        .lean();
      idOf = new Map(users.map((u) => [String(u.email || "").toLowerCase(), String(u._id)]));

      const allocs = await AiAllocation.find({
        scope: "user",
        userId: { $in: [...idOf.values()] },
      }).lean();
      allowOf = new Map(allocs.map((a) => [String(a.userId), a]));
    }

    // The platform allowance every account falls back to, so a row can say
    // what applies to it rather than only what it has of its own.
    const fallback = await AiAllocation.findOne({ scope: "default" }).lean();

    const limitOut = (l) => ({
      enabled: l?.enabled !== false,
      calls: Number(l?.calls || 0),
      tokens: Number(l?.tokens || 0),
      costUsd: Number(l?.costUsd || 0),
      window: l?.window === "day" ? "day" : "month",
    });

    res.json({
      items: byFeature.map((f) => ({
        id: f._id || "unattributed",
        name: f._id || "Unattributed",
        calls: f.calls,
        inTokens: f.inTokens,
        outTokens: f.outTokens,
        cost: f.cost,
        state: "active",
      })),
      people: byPerson.map((p) => {
        const email = (p._id.email || "").toLowerCase();
        const userId = idOf.get(email) || null;
        const own = userId ? allowOf.get(userId) : null;
        return {
          id: p._id.email || "anonymous",
          userId,
          who: p._id.name || p._id.email || "Signed out",
          email: p._id.email || "",
          calls: p.calls,
          cost: p.cost,
          features: (p.features || []).filter(Boolean),
          // What governs this row right now. "guest" is the signed-out
          // bucket, which has a shared ceiling and no account to set one on.
          governed: !userId ? "guest" : own ? (own.enabled === false ? "blocked" : "own") : "default",
          allowance: own
            ? {
                enabled: own.enabled !== false,
                total: limitOut(own.total),
                notes: own.notes || "",
                updatedByEmail: own.updatedByEmail || "",
                updatedAt: own.updatedAt,
              }
            : null,
        };
      }),
      // The default allowance travels with the page so the drawer can show what
      // a person falls back to without a second round trip.
      fallback: fallback
        ? {
            enabled: fallback.enabled !== false,
            total: limitOut(fallback.total),
            guestTotal: limitOut(fallback.guestTotal),
            notes: fallback.notes || "",
            updatedByEmail: fallback.updatedByEmail || "",
            updatedAt: fallback.updatedAt,
          }
        : null,
      totals: totals[0] || { calls: 0, cost: 0, inTokens: 0, outTokens: 0 },
      days,
    });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────── audit log ── */

router.get("/audit", ...hub, async (req, res, next) => {
  try {
    const q = {};
    if (String(req.query.god) === "true") q.isGod = true;

    const rows = await AuditLog.find(q).sort({ createdAt: -1 }).limit(300).lean();
    const [all, god] = await Promise.all([
      AuditLog.estimatedDocumentCount(),
      AuditLog.countDocuments({ isGod: true }),
    ]);

    const items = rows.map((a) => ({
      id: String(a._id),
      action: a.action || "",
      who: a.actorEmail || "system",
      // A break-glass action is not an ordinary one and the row says so.
      god: !!a.isGod,
      target: a.targetEmail || a.productKey || "",
      method: a.method || "",
      path: a.path || "",
      status: n0(a.status),
      ip: a.ip || "",
      at: a.createdAt || null,
      state: a.status >= 400 ? "bad" : a.isGod ? "due" : "active",
    }));

    res.json({ items, counts: { all, god } });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────── documents ── */

/**
 * What the studio has produced. Quotations are the only document type this
 * system stores as a record — invoices have their own register, and anything
 * else (certificates, receipts) is generated on demand and not kept.
 */
router.get("/produced", ...hub, async (_req, res, next) => {
  try {
    const rows = await Proposal.find({}).sort({ proposalDate: -1, createdAt: -1 }).limit(300).lean();
    const items = rows.map((p) => ({
      id: String(p._id),
      ref: p.proposalNumber || `#${String(p._id).slice(-6).toUpperCase()}`,
      kind: "Quotation",
      who: p.clientContact || p.clientFirm || "Unnamed client",
      org: p.clientFirm || "",
      by: p.preparedBy || "",
      lines: (p.items || []).length,
      total: n0(p.total) || n0(p.subtotal),
      currency: p.currency || "NGN",
      at: p.proposalDate || p.createdAt,
      validUntil: p.validUntil || null,
      state: p.status || "draft",
    }));
    const counts = { all: items.length };
    for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;
    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────────── system ── */

router.get("/system", ...hub, async (_req, res, next) => {
  try {
    const s = (await Setting.findOne({ key: "global" }).lean()) || {};

    // One row per setting, because the question an administrator has is "what
    // is this set to and does it apply" — not "show me a JSON blob".
    const items = [
      {
        id: "fx",
        name: "FX rate, naira to dollar",
        value: s.fxRateNGNUSD ? String(s.fxRateNGNUSD) : "not set",
        note: "Every dollar price with no explicit USD figure is converted at this.",
        state: s.fxRateNGNUSD ? "active" : "due",
      },
      {
        id: "vat",
        name: "VAT",
        value: s.vatEnabled ? `${n0(s.vatPercent)}%` : "off",
        note: [
          s.vatApplyToPurchases ? "applies to purchases" : "not on purchases",
          s.vatApplyToInvoices ? "applies to invoices" : "not on invoices",
        ].join(" · "),
        state: s.vatEnabled ? "active" : "calm",
      },
      {
        id: "hub",
        name: "Installer Hub",
        value: s.installerHubUrl || "not set",
        note: "Where the desktop installer is downloaded from.",
        state: s.installerHubUrl ? "active" : "due",
      },
      {
        id: "mobile",
        name: "Mobile app",
        value: s.mobileAppUrl || "not set",
        note: "The link the site offers for the phone app.",
        state: s.mobileAppUrl ? "active" : "calm",
      },
      {
        id: "reinstall",
        name: "Forced reinstall",
        value: s.forceReinstallActive ? "ON" : "off",
        note: s.forceReinstallActive
          ? String(s.forceReinstallMessage || "Every desktop client is being told to reinstall.")
          : "Desktop clients update normally.",
        // An active forced reinstall interrupts every customer, so it is
        // flagged rather than sitting quietly as one row among five.
        state: s.forceReinstallActive ? "bad" : "calm",
      },
    ];

    res.json({ items, counts: { all: items.length } });
  } catch (err) {
    next(err);
  }
});

const money = (n, cur = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: cur || "NGN",
    maximumFractionDigits: 0,
  }).format(n0(n));

/* ────────────────────────────────────────────────────────────── templates ── */

/**
 * What the engine can produce, and whose paper each one prints on.
 *
 * The list mirrors the composer's own kinds in DsDocComposer.jsx, which are
 * his five: letter, report, statement, invoice, receipt. A bill of quantities
 * and a valuation were listed here for a while on the reasoning that a QS
 * studio writes those most — but they are not in his design, and inventing a
 * template because it seems sensible is how the port stops being a port.
 *
 * `paper` matters more than it looks: a practice's exports come out of the
 * same templates, which is why an ADLM invoice and a customer's bill of
 * quantities look like the same firm made them.
 */
const TEMPLATES = [
  { id: "letter", name: "Letter", what: "Letterhead, recipient, body, signature.", paper: "ADLM or a practice" },
  { id: "report", name: "Report", what: "Numbered sections, tables and bullets.", paper: "ADLM or a practice" },
  { id: "statement", name: "Statement", what: "An account with a running balance.", paper: "ADLM" },
  { id: "invoice", name: "Invoice", what: "Line items, VAT and payment details.", paper: "ADLM" },
  { id: "receipt", name: "Receipt", what: "An invoice that has been paid.", paper: "ADLM" },
  {
    id: "proposal",
    name: "Proposal",
    what: "A cover line and a validity date, like the quotation.",
    paper: "ADLM",
  },
];

router.get("/templates", ...hub, async (_req, res, next) => {
  try {
    // Real usage, counted from the documents that were actually made on each
    // template — not a number typed into the list.
    const used = await SavedDocument.aggregate([
      { $group: { _id: "$template", n: { $sum: 1 } } },
    ]);
    const byId = new Map(used.map((u) => [u._id, u.n]));

    // Invoices and receipts are produced by their own generators rather than
    // the composer, so their real usage lives in those collections.
    const [invoices, receipts, quotes] = await Promise.all([
      Invoice.estimatedDocumentCount(),
      Invoice.countDocuments({ receiptNumber: { $exists: true, $ne: "" } }),
      Proposal.estimatedDocumentCount(),
    ]);

    const extra = { invoice: invoices, receipt: receipts };

    const items = TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      what: t.what,
      paper: t.paper,
      used: (byId.get(t.id) || 0) + (extra[t.id] || 0),
      built: true,
      state: "built",
    }));

    // The one ours has that his does not, said plainly rather than left for
    // somebody to notice: a quotation here is its own document with its own
    // numbering and share link, not a composer template. It is on the list
    // because it is a real thing the engine produces — but the row has to say
    // that it opens somewhere else, or the button lies.
    items.push({
      id: "quotation",
      name: "Quotation",
      what: "A cover line, priced tiers and a validity date.",
      paper: "ADLM",
      used: quotes,
      built: true,
      external: true,
      state: "built",
    });

    // Templates somebody has asked for and nobody has written yet. They sit
    // on the same list as the ones that exist, marked, because a request kept
    // on a separate screen is a request nobody sees.
    const asked = await TemplateRequest.find({ state: "asked" }).sort({ createdAt: 1 }).lean();
    for (const r of asked) {
      items.push({
        id: r.key,
        name: r.name,
        what: r.what,
        paper: r.paper,
        used: 0,
        built: false,
        state: "asked for",
        needs: r.needs,
        by: r.byEmail || "",
        at: r.createdAt,
      });
    }

    res.json({
      items,
      counts: { all: items.length, built: items.length - asked.length, asked: asked.length },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Ask for a template.
 *
 * His note on the form is the design: "This records the request. Building it
 * is developer work, and it will appear here as 'built' when the block exists
 * in the engine." So this writes down what is wanted and who wants it, and
 * claims nothing more than that.
 */
router.post("/templates/requests", ...hub, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const what = String(req.body?.what || "").trim();
    const needs = String(req.body?.needs || "").trim();
    const paper = String(req.body?.paper || "A4 portrait").trim();

    if (!name || !what || !needs) {
      return res.status(400).json({ error: "A name, what it is for and what it needs." });
    }

    const key = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    if (!key) return res.status(400).json({ error: "That name has nothing to slug." });

    // A template the engine already has is not a request. Say so rather than
    // filing a second row nobody will look at.
    if (TEMPLATES.some((t) => t.id === key)) {
      const said = name.toLowerCase();
      const article = /^[aeiou]/.test(said) ? "an" : "a";
      return res.status(409).json({ error: `The engine already prints ${article} ${said}.` });
    }

    // Asking twice for the same thing sharpens the request rather than
    // doubling it — the second description is usually the better one.
    const row = await TemplateRequest.findOneAndUpdate(
      { key },
      {
        $set: {
          name,
          what,
          needs,
          paper,
          state: "asked",
          byEmail: req.user?.email || "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    await writeAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: "documents.template.request",
      status: 201,
      ...reqAuditContext(req),
      meta: { template: name, needs: needs.slice(0, 400) },
    });

    res.status(201).json({ id: row.key, name: row.name });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────── saved ── */

router.get("/saved", ...hub, async (_req, res, next) => {
  try {
    const rows = await SavedDocument.find({}).sort({ updatedAt: -1 }).limit(300).lean();
    const items = rows.map((d) => ({
      id: String(d._id),
      template: d.template || "letter",
      templateName: TEMPLATES.find((t) => t.id === d.template)?.name || d.template,
      title: d.title || "Untitled",
      number: d.number || "",
      to: d.to || "",
      blocks: n0(d.blocks),
      by: d.byEmail || "",
      at: d.updatedAt,
      sentAt: d.sentAt || null,
      sentTo: d.sentTo || "",
      state: d.sentAt ? "sent" : "draft",
    }));
    const counts = { all: items.length };
    for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;
    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

/** The composer asks for one back, source and all, to carry on editing. */
router.get("/saved/:id", ...hub, async (req, res, next) => {
  try {
    const d = await SavedDocument.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ error: "No such document" });
    res.json({
      id: String(d._id),
      template: d.template,
      title: d.title,
      number: d.number,
      to: d.to,
      source: d.source || "",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/saved", ...hub, async (req, res, next) => {
  try {
    const b = req.body || {};
    const source = String(b.source || "");
    if (!source.trim()) return res.status(400).json({ error: "There is nothing in it yet." });

    const doc = {
      template: String(b.template || "letter").trim(),
      title: String(b.title || "").trim() || "Untitled",
      number: String(b.number || "").trim(),
      to: String(b.to || "").trim(),
      source,
      blocks: n0(b.blocks),
      byId: req.user?._id,
      byEmail: req.user?.email || "",
    };

    // Saving an already-saved document updates it rather than making a second
    // copy — otherwise a morning's editing leaves twelve near-identical rows
    // and no way to tell which is current.
    if (b.id) {
      const hit = await SavedDocument.findByIdAndUpdate(b.id, { $set: doc }, { new: true }).lean();
      if (hit) return res.json({ id: String(hit._id), updated: true });
    }

    const made = await SavedDocument.create(doc);
    res.status(201).json({ id: String(made._id), updated: false });
  } catch (err) {
    next(err);
  }
});

router.delete("/saved/:id", ...hub, async (req, res, next) => {
  try {
    const gone = await SavedDocument.findByIdAndDelete(req.params.id).lean();
    if (!gone) return res.status(404).json({ error: "No such document" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * Mark a document as sent.
 *
 * This is what moves it into the Issued register, so it is a deliberate act
 * with a recipient rather than a side effect of pressing print. A document
 * that was printed and handed over in a meeting still gets recorded here,
 * which is the case an email-only log would miss entirely.
 */
router.post("/saved/:id/send", ...hub, async (req, res, next) => {
  try {
    const to = String(req.body?.to || "").trim();
    if (!to) return res.status(400).json({ error: "Say who it went to." });

    const hit = await SavedDocument.findByIdAndUpdate(
      req.params.id,
      { $set: { sentAt: new Date(), sentTo: to } },
      { new: true },
    ).lean();
    if (!hit) return res.status(404).json({ error: "No such document" });
    res.json({ ok: true, sentTo: to });
  } catch (err) {
    next(err);
  }
});

/** A copy to work from, which is how most documents actually get written. */
router.post("/saved/:id/duplicate", ...hub, async (req, res, next) => {
  try {
    const src = await SavedDocument.findById(req.params.id).lean();
    if (!src) return res.status(404).json({ error: "No such document" });

    const made = await SavedDocument.create({
      template: src.template,
      title: `${src.title} (copy)`,
      // The number is NOT copied. Two documents sharing a reference is the
      // one mistake that makes a paper trail useless.
      number: "",
      to: src.to,
      source: src.source,
      blocks: src.blocks,
      byId: req.user?._id,
      byEmail: req.user?.email || "",
    });
    res.status(201).json({ id: String(made._id) });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────────── issued ── */

/**
 * Every document that has left the studio, newest first.
 *
 * It answers the question that actually gets asked — "you never sent it" —
 * so it is searchable by who received it, and it is assembled from the
 * records that already know: an invoice knows the day it was issued, a paid
 * invoice knows the day its receipt was raised, a quotation knows when it was
 * built, and a saved document knows if it was sent.
 */
router.get("/issued", ...hub, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();

    const [invoices, quotes, sent, certs] = await Promise.all([
      Invoice.find({}).sort({ invoiceDate: -1 }).limit(400).lean(),
      Proposal.find({}).sort({ proposalDate: -1 }).limit(300).lean(),
      SavedDocument.find({ sentAt: { $ne: null } }).sort({ sentAt: -1 }).limit(200).lean(),
      // His register carries certificates and ours did not, though the data
      // was here all along: a certificate is a document that left the studio
      // with somebody's name on it, and it is the one people ask to be sent
      // again most often.
      CourseEnrollment.find({ certificateIssuedAt: { $ne: null } })
        .sort({ certificateIssuedAt: -1 })
        .limit(300)
        .lean(),
    ]);

    const out = [];

    for (const i of invoices) {
      const to = i.clientName || i.clientEmail || "Unknown";
      const org = i.clientOrganization || "";
      const worth = money(i.total, i.currency);

      if (i.invoiceDate) {
        out.push({
          id: `inv:${i._id}`,
          on: i.invoiceDate,
          kind: "Invoice",
          ref: i.invoiceNumber || "",
          to,
          org,
          worth,
          email: i.clientEmail || "",
        });
      }
      // A receipt is a second document off the same record, and it is the one
      // people ask for most.
      if (i.receiptNumber) {
        out.push({
          id: `rct:${i._id}`,
          on: i.receiptSentAt || i.paidAt || i.invoiceDate,
          kind: "Receipt",
          ref: i.receiptNumber,
          to,
          org,
          worth,
          email: i.clientEmail || "",
        });
      }
    }

    for (const p of quotes) {
      out.push({
        id: `qte:${p._id}`,
        on: p.proposalDate || p.createdAt,
        kind: "Quotation",
        ref: p.proposalNumber || "",
        to: p.clientContact || p.clientFirm || "Unnamed client",
        org: p.clientFirm || "",
        worth: money(p.total, p.currency),
        email: p.clientEmail || "",
      });
    }

    if (certs.length) {
      // Two lookups rather than one per row: a course title and a name, both
      // fetched in a single pass and joined here.
      const skus = [...new Set(certs.map((c) => c.courseSku).filter(Boolean))];
      const ids = [...new Set(certs.map((c) => String(c.userId || "")).filter(Boolean))];
      const [courses, people] = await Promise.all([
        PaidCourse.find({ sku: { $in: skus } }).select("sku title").lean(),
        User.find({ _id: { $in: ids } }).select("firstName lastName email").lean(),
      ]);
      const titleOf = new Map(courses.map((c) => [c.sku, c.title]));
      const nameOf = new Map(
        people.map((u) => [
          String(u._id),
          [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        ]),
      );

      for (const c of certs) {
        out.push({
          id: `crt:${c._id}`,
          on: c.certificateIssuedAt,
          kind: "Certificate",
          // Certificates have no number of their own, so the record's own id
          // is the reference — short, stable and unique, which is all a
          // reference has to be.
          ref: `CERT-${String(c._id).slice(-6).toUpperCase()}`,
          to: nameOf.get(String(c.userId)) || c.email || "Unknown",
          org: "",
          // His For column holds the course on a certificate row, where an
          // invoice holds money. What it is for, either way.
          worth: titleOf.get(c.courseSku) || c.courseSku || "A course",
          email: c.email || "",
          href: c.certificateUrl || "",
        });
      }
    }

    for (const d of sent) {
      out.push({
        id: `doc:${d._id}`,
        on: d.sentAt,
        kind: TEMPLATES.find((t) => t.id === d.template)?.name || "Document",
        ref: d.number || "",
        to: d.sentTo || d.to || "",
        org: "",
        worth: "",
        email: "",
      });
    }

    const rows = out
      .filter((r) => r.on)
      .filter((r) =>
        q
          ? `${r.ref} ${r.to} ${r.org} ${r.email} ${r.kind}`.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => new Date(b.on) - new Date(a.on));

    const counts = { all: rows.length };
    for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;

    res.json({ items: rows.slice(0, 400), counts, total: rows.length });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────── one issued document ── */

/**
 * The document itself, as a spec the renderer can mount.
 *
 * His preview reads the figures off an in-memory model; ours has to fetch
 * them, and the reason it fetches rather than carrying them in the list is the
 * same reason his preview exists at all: what is shown here has to be what was
 * SENT. An invoice is rebuilt from its own captured line items and its own VAT
 * rate, so last March's reprints as last March's — changing the rate today
 * cannot rewrite what went out.
 */
router.get("/issued/:id", ...hub, async (req, res, next) => {
  try {
    const [kind, id] = String(req.params.id || "").split(":");
    if (!kind || !id) return res.status(400).json({ error: "Not a document reference." });

    const lines = (items, cur) => ({
      type: "table",
      columns: [
        { label: "Item", align: "left", width: "62%" },
        { label: "Qty", align: "right", width: "12%" },
        { label: "Amount", align: "right", width: "26%" },
      ],
      rows: (items || []).map((l) => ({
        cells: [
          l.description || "ADLM Studio licences and services",
          String(l.qty ?? 1),
          money(l.total ?? (l.unitPrice || 0) * (l.qty || 1), cur),
        ],
      })),
    });

    if (kind === "inv" || kind === "rct") {
      const i = await Invoice.findById(id).lean();
      if (!i) return res.status(404).json({ error: "No such invoice" });
      const receipt = kind === "rct";
      const cur = i.currency || "NGN";
      const rate = Number(i.taxPercent || 0);
      return res.json({
        spec: {
          template: receipt ? "receipt" : "invoice",
          title: receipt ? "Receipt" : "Invoice",
          number: (receipt ? i.receiptNumber : i.invoiceNumber) || "",
          date: receipt ? i.receiptSentAt || i.paidAt || i.invoiceDate : i.invoiceDate,
          to: [i.clientName || "Customer", i.clientOrganization || "", i.clientEmail || ""].filter(
            Boolean,
          ),
          blocks: [
            lines(
              i.items?.length
                ? i.items
                : [{ description: i.description, qty: 1, total: i.subtotal || i.total }],
              cur,
            ),
            {
              type: "totals",
              rows: [
                ["Net", money(i.subtotal ?? i.total, cur)],
                [`VAT at ${rate.toFixed(1)}%`, money(i.taxAmount ?? i.tax ?? 0, cur)],
                ["Total", money(i.total, cur)],
              ],
            },
          ],
        },
        to: i.clientEmail || "",
        note:
          `Reprinted at the VAT rate it was issued under — ${rate.toFixed(1)}%. ` +
          "Changing the rate today cannot rewrite what was sent.",
      });
    }

    if (kind === "qte") {
      const p = await Proposal.findById(id).lean();
      if (!p) return res.status(404).json({ error: "No such quotation" });
      const cur = p.currency || "NGN";
      return res.json({
        spec: {
          template: "letter",
          title: "Quotation",
          number: p.proposalNumber || "",
          date: p.proposalDate || p.createdAt,
          to: [p.clientContact || "Customer", p.clientFirm || "", p.clientEmail || ""].filter(
            Boolean,
          ),
          blocks: [
            lines(p.items, cur),
            {
              type: "totals",
              rows: [
                ["Net", money(p.subtotal ?? p.total, cur)],
                ["VAT", money((p.total || 0) - (p.subtotal ?? p.total ?? 0), cur)],
                ["Total", money(p.total, cur)],
              ],
            },
          ],
        },
        to: p.clientEmail || "",
        note: "Rendered by the same engine a customer's own exports come out of.",
      });
    }

    if (kind === "doc") {
      const d = await SavedDocument.findById(id).lean();
      if (!d) return res.status(404).json({ error: "No such document" });
      return res.json({
        // A saved document keeps its source, so the preview is the document
        // itself rather than a description of it. The client parses it with
        // the same parser the composer uses.
        source: d.source || "",
        spec: {
          template: d.template || "letter",
          title: d.title || "Document",
          number: d.number || "",
          date: d.sentAt || d.updatedAt,
          to: [d.to || d.sentTo || ""].filter(Boolean),
        },
        to: d.sentTo || "",
        note: "Rendered by the same engine a customer's own exports come out of.",
      });
    }

    if (kind === "crt") {
      const c = await CourseEnrollment.findById(id).lean();
      if (!c) return res.status(404).json({ error: "No such certificate" });
      const course = c.courseSku
        ? await PaidCourse.findOne({ sku: c.courseSku }).select("title").lean()
        : null;
      const who = c.userId
        ? await User.findById(c.userId).select("firstName lastName email").lean()
        : null;
      const name = who
        ? [who.firstName, who.lastName].filter(Boolean).join(" ") || who.email
        : c.email;
      return res.json({
        spec: {
          template: "letter",
          title: "Certificate",
          number: `CERT-${String(c._id).slice(-6).toUpperCase()}`,
          date: c.certificateIssuedAt,
          to: [name || "", c.email || ""].filter(Boolean),
          blocks: [
            { type: "heading", level: 1, text: "Certificate of completion" },
            {
              type: "para",
              text: `This certifies that ${name || "the holder"} completed ${
                course?.title || c.courseSku
              }.`,
            },
          ],
        },
        to: c.email || "",
        // The certificate itself is a file generated when it was issued. What
        // renders here stands in for it on screen; the link is the thing that
        // was actually sent, so the panel offers both.
        href: c.certificateUrl || "",
        note: c.certificateUrl
          ? "The file that was issued is behind Open the original."
          : "No file was kept for this one — only the record that it was issued.",
      });
    }

    return res.status(400).json({ error: "Not a kind of document this can open." });
  } catch (err) {
    next(err);
  }
});

/**
 * Send it again.
 *
 * His does this with a toast, because his panel has no post box. The point of
 * the row, in his words, is the question that actually gets asked — "you never
 * sent it" — so ours puts the document back in the post AND says when it went
 * the first time, which is the answer to that question.
 */
router.post("/issued/:id/send-again", ...hub, async (req, res, next) => {
  try {
    const to = String(req.body?.to || "").trim();
    const ref = String(req.body?.ref || "").trim();
    const kind = String(req.body?.kind || "Document").trim();
    const first = req.body?.on ? new Date(req.body.on) : null;

    if (!to || !/.+@.+\..+/.test(to)) {
      return res
        .status(400)
        .json({ error: "There is no email address on this one to send it to." });
    }

    const when =
      first && !Number.isNaN(first.valueOf())
        ? first.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : "";

    const body =
      "<p>Hello,</p>" +
      `<p>Here is your ${kind.toLowerCase()}${ref ? ` <b>${ref}</b>` : ""} again` +
      `${when ? `, first sent on ${when}` : ""}.</p>` +
      "<p>If anything on it needs changing, reply to this message and we will sort it out.</p>";

    await sendMail({
      to,
      subject: `${kind}${ref ? ` ${ref}` : ""} from ADLM Studio`,
      html: wrapEmail({
        title: `Your ${kind.toLowerCase()}`,
        preheader: `${kind}${ref ? ` ${ref}` : ""} from ADLM Studio`,
        body,
      }),
      text: `Here is your ${kind.toLowerCase()}${ref ? ` ${ref}` : ""} again${
        when ? `, first sent on ${when}` : ""
      }.`,
      templateKey: "issued.send-again",
    });

    await writeAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: "documents.issued.resend",
      status: 200,
      ...reqAuditContext(req),
      targetEmail: to,
      meta: { ref, kind },
    });

    res.json({ ok: true, to, when });
  } catch (err) {
    next(err);
  }
});

export default router;
