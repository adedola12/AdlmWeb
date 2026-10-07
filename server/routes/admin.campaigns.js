// Marketing email: draft it, test it on yourself, then send it.
//
// THIS IS THE ONLY MAIL NOBODY CAN TAKE BACK
//
// Everything else the studio sends answers something a customer just did,
// goes to one address, and is wrong in a way that affects one person. This
// goes to hundreds at once on somebody's decision. So the shape of the whole
// feature is built around that asymmetry:
//
//   - it is a saved record before it is a send, so "what did we send in
//     August, and to whom" has an answer;
//   - the audience is a closed list of five, not a query builder, because a
//     free query over the user collection is how somebody mails everybody by
//     accident at three in the morning;
//   - a test send to one address is a separate, encouraged step;
//   - sending twice is refused outright.
//
// WHO IS SKIPPED, AND WHY IT IS COUNTED
//
// Opted out and unverified addresses are dropped at send time rather than
// filtered out of the audience earlier. That way the screen can say "300
// people, 40 of whom have opted out" instead of quietly showing 260 and
// leaving somebody to wonder where the rest went. A campaign that reached 40
// of 300 is a fact about consent worth seeing, not a failure to hide.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Campaign } from "../models/Campaign.js";
import { Product } from "../models/Product.js";
import { sendMail } from "../util/mailer.js";
import { marketingMessage } from "../util/emailContent.js";
import { reqAuditContext } from "../util/audit.js";
import {
  runCampaignSend,
  mongoStore as campaignStore,
  ROUTE_BUDGET_MS,
  LOCK_MARGIN_MS,
} from "../util/campaignSend.js";
import {
  AUDIENCES,
  resolveAudience,
  audienceSizes,
  unsubscribeUrl,
} from "../util/campaigns.js";

const router = express.Router();
const hub = [requireAuth, requirePermission("adminhub")];

// How fast a campaign goes out, and the send itself, live in
// util/campaignSend.js, shared with the scheduled sweeper that finishes a send
// this route could not.

const shape = (c) => ({
  id: String(c._id),
  subject: c.subject,
  preheader: c.preheader || "",
  heading: c.heading || "",
  body: c.body || "",
  ctaLabel: c.ctaLabel || "",
  ctaHref: c.ctaHref || "",
  audience: c.audience,
  productKey: c.productKey || "",
  status: c.status,
  stats: c.stats || {},
  testSentTo: c.testSentTo || "",
  testSentAt: c.testSentAt || null,
  sentAt: c.sentAt || null,
  sentByEmail: c.sentByEmail || "",
  error: c.error || "",
  at: c.createdAt,
});

/* ────────────────────────────────────────────────────────────────── the list ── */

router.get("/", ...hub, async (_req, res, next) => {
  try {
    const [rows, sizes, products] = await Promise.all([
      Campaign.find({}).sort({ createdAt: -1 }).limit(200).lean(),
      audienceSizes(),
      Product.find({ isPublished: true }).select("key name").sort({ name: 1 }).lean(),
    ]);

    const items = rows.map(shape);
    const counts = { all: items.length };
    for (const i of items) counts[i.status] = (counts[i.status] || 0) + 1;

    res.json({
      items,
      counts,
      audiences: AUDIENCES.map((a) => ({ ...a, size: sizes[a.key] ?? null })),
      products: products.map((p) => ({ key: p.key, name: p.name })),
    });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────────── drafting ── */

function readDraft(b = {}) {
  return {
    subject: String(b.subject || "").trim(),
    preheader: String(b.preheader || "").trim(),
    heading: String(b.heading || "").trim(),
    body: String(b.body || "").trim(),
    ctaLabel: String(b.ctaLabel || "").trim(),
    ctaHref: String(b.ctaHref || "").trim(),
    audience: String(b.audience || "everyone"),
    productKey: String(b.productKey || "").trim().toLowerCase(),
  };
}

function complain(d) {
  if (!d.subject) return "It needs a subject — that is the only part most people will read.";
  if (!d.body) return "It needs something to say.";
  if (d.ctaHref && !/^https?:\/\//i.test(d.ctaHref)) {
    return "The button link needs to start with http:// or https://.";
  }
  if (d.ctaLabel && !d.ctaHref) return "The button has a label but nowhere to go.";
  if (d.audience === "product" && !d.productKey) return "Choose which product's holders.";
  return null;
}

router.post("/", ...hub, async (req, res, next) => {
  try {
    const d = readDraft(req.body);
    const bad = complain(d);
    if (bad) return res.status(400).json({ error: bad });
    const made = await Campaign.create(d);
    res.status(201).json({ id: String(made._id) });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", ...hub, async (req, res, next) => {
  try {
    const c = await Campaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "No such campaign" });
    // A sent campaign is a record of what went out. Editing it would make the
    // record disagree with the mail sitting in three hundred inboxes.
    if (c.status === "sent" || c.status === "sending") {
      return res.status(409).json({
        error: "This has already been sent, so it cannot be edited. Duplicate it instead.",
      });
    }
    const d = readDraft(req.body);
    const bad = complain(d);
    if (bad) return res.status(400).json({ error: bad });
    await Campaign.updateOne({ _id: c._id }, { $set: d });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", ...hub, async (req, res, next) => {
  try {
    const c = await Campaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "No such campaign" });
    if (c.status === "sent") {
      return res.status(409).json({
        error: "A sent campaign is the record of what went out. It stays.",
      });
    }
    await Campaign.deleteOne({ _id: c._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────── preview and test ── */

/** What it will look like, with the sender's own name in the greeting. */
router.get("/:id/preview", ...hub, async (req, res, next) => {
  try {
    const c = await Campaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "No such campaign" });
    const r = marketingMessage({
      firstName: req.user?.firstName || "there",
      subject: c.subject,
      preheader: c.preheader,
      heading: c.heading,
      body: c.body,
      ctaLabel: c.ctaLabel,
      ctaHref: c.ctaHref,
      unsubscribeUrl: unsubscribeUrl(req.user?._id || "sample"),
    });

    const audience = await resolveAudience(c.audience, c.productKey).countDocuments();
    res.json({ subject: r.subject, html: r.html, audience });
  } catch (err) {
    next(err);
  }
});

/** Send it to one address — normally your own — before sending it to everyone. */
router.post("/:id/test", ...hub, async (req, res, next) => {
  try {
    const c = await Campaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "No such campaign" });

    const to = String(req.body?.to || req.user?.email || "").trim().toLowerCase();
    if (!to) return res.status(400).json({ error: "Say where to send it." });

    const r = marketingMessage({
      firstName: req.user?.firstName || "there",
      subject: c.subject,
      preheader: c.preheader,
      heading: c.heading,
      body: c.body,
      ctaLabel: c.ctaLabel,
      ctaHref: c.ctaHref,
      unsubscribeUrl: unsubscribeUrl(req.user?._id || "sample"),
    });

    await sendMail({ to, subject: r.subject, html: r.html, templateKey: "marketing.test" });
    await Campaign.updateOne(
      { _id: c._id },
      { $set: { testSentTo: to, testSentAt: new Date() } },
    );
    res.json({ ok: true, to });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────────── the send ── */

router.post("/:id/send", ...hub, async (req, res, next) => {
  try {
    const c = await Campaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "No such campaign" });

    // Sending twice is the mistake with no undo, so it is refused at the
    // record rather than guarded in the UI: a double-clicked button, a
    // retried request and a second admin all arrive here.
    if (c.status === "sent") {
      return res.status(409).json({ error: "This has already been sent." });
    }
    if (c.status === "sending") {
      return res.status(409).json({ error: "This is going out now." });
    }

    // Somebody has to have read it once. A campaign sent without ever being
    // looked at in a real client is how a broken link reaches everybody.
    if (!c.testSentAt) {
      return res.status(400).json({
        error: "Send yourself a test first — this is the one mail that cannot be taken back.",
      });
    }

    const people = await campaignStore.audience(c);

    // The move to "sending" is one conditional update, so two requests that
    // both got past the checks above cannot both start a send. It also takes
    // the lock the sweeper respects, until this run's deadline has passed.
    const startedAt = Date.now();
    const deadlineAt = startedAt + ROUTE_BUDGET_MS;
    const lockUntil = new Date(deadlineAt + LOCK_MARGIN_MS);
    const started = await Campaign.findOneAndUpdate(
      { _id: c._id, status: { $nin: ["sent", "sending"] } },
      {
        $set: {
          status: "sending",
          sendStartedAt: new Date(startedAt),
          sentByEmail: req.user?.email || "",
          sentById: req.user?._id || null,
          sweepLockedUntil: lockUntil,
          failedIds: [],
          auditedAt: null,
          stats: {
            audience: people.length,
            sent: 0,
            skippedOptedOut: 0,
            skippedUnverified: 0,
            failed: 0,
          },
        },
      },
      { new: true },
    ).lean();
    if (!started) {
      return res.status(409).json({ error: "This is going out now." });
    }

    // Answer now, send in the background. A request held open for the whole
    // send is a gateway timeout and an admin who does not know whether it
    // worked. On Lambda the background work is not promised to finish, which
    // is why the send lives in util/campaignSend.js: whatever this run does not
    // get through, the scheduled sweeper picks up from the EmailSend ledger,
    // and nobody already mailed is mailed again.
    res.json({ ok: true, started: people.length });

    try {
      await runCampaignSend(started, {
        deadlineAt,
        people,
        auditContext: reqAuditContext(req),
      });
    } catch (err) {
      console.error(`[campaign ${c._id}] send stopped:`, err?.message || err);
    } finally {
      await campaignStore.releaseLock(c._id, lockUntil).catch(() => {});
    }
  } catch (err) {
    if (res.headersSent) console.error(`[campaign ${req.params.id}]`, err?.message || err);
    else next(err);
  }
});

export default router;
