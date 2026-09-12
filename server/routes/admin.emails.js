// The messages the studio sends — readable, and changeable without a developer.
//
// His screen lists nine; ours lists what the code actually sends, declared in
// util/emailCatalogue.js. The register is that file, the send counts come from
// the log written inside sendMail, and the wording comes from an override row
// when one exists.
//
// WHY THE ORIGINAL IS SHOWN WHEN THERE IS NO OVERRIDE
//
// "Read it" has to show what a customer actually receives. If an override
// exists that is the thing; if not, it is the version in code. A screen that
// showed an empty box for every unedited message would be telling you the
// studio sends nothing, which is the opposite of true.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { EmailTemplate } from "../models/EmailTemplate.js";
import { EmailSend } from "../models/EmailSend.js";
import { MailEvent } from "../models/MailEvent.js";
import { User } from "../models/User.js";
import { EMAILS, byKey } from "../util/emailCatalogue.js";
import { PREVIEW } from "../util/emailContent.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";
import { verifyMail } from "../util/mailer.js";

const router = express.Router();
const hub = [requireAuth, requirePermission("adminhub")];
const DAY = 864e5;

router.get("/", ...hub, async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * DAY);
    const [overrides, counts] = await Promise.all([
      EmailTemplate.find({}).lean(),
      EmailSend.aggregate([
        { $match: { at: { $gte: since } } },
        { $group: { _id: "$key", n: { $sum: 1 }, failed: { $sum: { $cond: ["$ok", 0, 1] } } } },
      ]),
    ]);

    const over = new Map(overrides.map((o) => [o.key, o]));
    const sent = new Map(counts.map((c) => [c._id, c]));

    const items = EMAILS.map((e) => {
      const o = over.get(e.key);
      const c = sent.get(e.key);
      return {
        id: e.key,
        key: e.key,
        name: e.name,
        when: e.when,
        file: e.file,
        editable: e.editable,
        why: e.why || "",
        edited: !!o,
        editedBy: o?.updatedByEmail || "",
        editedAt: o?.updatedAt || null,
        sent30: c?.n || 0,
        // The flag column. A message failing to send is the one thing on this
        // screen worth interrupting somebody about.
        flag: c?.failed
          ? `${c.failed} failed to send in the last 30 days`
          : !e.editable
            ? ""
            : "",
      };
    });

    // Counting starts when the log does. Said on the screen rather than left
    // for somebody to conclude that nothing is being sent.
    const first = await EmailSend.findOne({}).sort({ at: 1 }).select("at").lean();
    res.json({ items, countingSince: first?.at || null, counts: { all: items.length } });
  } catch (err) {
    next(err);
  }
});

/** What a customer actually receives: the override if there is one. */
/**
 * Can the studio actually send anything?
 *
 * This exists because of how the last failure was found: the SMTP fallback had
 * stopped authenticating and nobody knew, because SMTP is only ever reached
 * once Resend has already failed. A fallback is invisible right up to the
 * moment it is the only thing left, and that is the worst possible moment to
 * discover it does not work.
 *
 * So it can be asked, on a screen, on an ordinary day. It reports every way
 * out and what each one said. It sends nothing.
 */
router.get("/health", ...hub, async (_req, res, next) => {
  try {
    res.json(await verifyMail());
  } catch (err) {
    next(err);
  }
});

/**
 * What came back.
 *
 * MUST stay above the "/:key" route below — registered after it, Express would
 * match "bounces" as a template key and answer 404 for a screen that exists.
 *
 * Two different numbers on purpose. `undeliverableAccounts` is the standing
 * total: how many addresses the studio has stopped mailing, which only ever
 * goes up until somebody corrects an address. The event list is the recent
 * flow: which ones failed lately and what their server actually said. A spike
 * in the second with no movement in the first means transient failures — a
 * provider having a bad week, not a list going stale — and those are very
 * different problems.
 */
router.get("/bounces", ...hub, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const [events, stopped, undeliverableAccounts, byType] = await Promise.all([
      MailEvent.find({}).sort({ at: -1 }).limit(limit).lean(),
      // The addresses the studio has actually stopped mailing — the list the
      // button acts on. Newest first, because the recent ones are the ones
      // somebody is still likely to be able to do something about.
      User.find({ emailUndeliverable: true })
        .select("email firstName lastName emailUndeliverableAt emailUndeliverableReason emailUndeliverableDetail")
        .sort({ emailUndeliverableAt: -1 })
        .limit(limit)
        .lean(),
      User.countDocuments({ emailUndeliverable: true }),
      MailEvent.aggregate([{ $group: { _id: "$type", n: { $sum: 1 } } }]),
    ]);

    res.json({
      undeliverableAccounts,
      stopped: stopped.map((u) => ({
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        at: u.emailUndeliverableAt,
        reason: u.emailUndeliverableReason,
        detail: u.emailUndeliverableDetail,
      })),
      last90Days: Object.fromEntries(byType.map((r) => [r._id || "unknown", r.n])),
      events,
      note: "Events are kept for 90 days. The stopped list is the standing state and does not expire.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Start sending to this address again.
 *
 * The only way back. A bounce is applied by machine and nothing un-applies it:
 * SES will not tell us a mailbox has been repaired, because nobody tells SES
 * either. So somebody has to say so, which is what this is — a person
 * asserting, usually after actually speaking to the customer, that the address
 * works now.
 *
 * WHAT IT DOES NOT TOUCH
 *
 * The marketing and video preferences. Those record what the PERSON wants, and
 * this button is about what their SERVER can do — two different facts that
 * happen to have the same effect on whether mail goes out. Somebody who
 * unsubscribed in March and whose mailbox broke in June should come back from
 * this still unsubscribed, and they do, because the bounce never wrote to
 * their preferences in the first place (see util/mailFeedback.js).
 *
 * Audited, because it is one admin overriding a machine's decision about a
 * customer, and if the address is in fact still dead it is a decision that
 * costs the studio's reputation with every send that follows.
 */
router.post("/bounces/clear", ...hub, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Which address?" });

    const user = await User.findOne({ email }).select("_id email emailUndeliverable").lean();
    if (!user) return res.status(404).json({ error: "No account has that address." });

    if (!user.emailUndeliverable) {
      // Not an error — the screen may simply be a few seconds stale, or two
      // admins may have pressed it at once. Saying so plainly beats a 400 that
      // reads like a fault.
      return res.json({ ok: true, email, alreadySending: true });
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailUndeliverable: false,
          emailUndeliverableAt: null,
          emailUndeliverableReason: "",
          emailUndeliverableDetail: "",
        },
      },
    );

    await writeAudit({
      actorId: req.user?._id,
      actorEmail: req.user?.email,
      action: "email.undeliverable.clear",
      status: 200,
      ...reqAuditContext(req),
      meta: { email },
    });

    // The event rows stay. They are the evidence that this address failed
    // before, which is exactly what somebody needs if it fails again — a
    // second bounce after a manual clear is a different conversation from a
    // first one.
    res.json({ ok: true, email });
  } catch (err) {
    next(err);
  }
});

router.get("/:key", ...hub, async (req, res, next) => {
  try {
    const e = byKey.get(req.params.key);
    if (!e) return res.status(404).json({ error: "No such message" });
    const o = await EmailTemplate.findOne({ key: e.key }).lean();

    // What the message actually says, rendered with plausible values.
    //
    // The screen used to describe where the wording lived — "it is in
    // routes/auth.js" — which answers a developer's question, not the one
    // somebody opening this screen has. They want to read the mail. So the
    // original is rendered here and returned alongside any edit, and a person
    // can see both without leaving the drawer.
    let original = null;
    try {
      const make = PREVIEW[e.key];
      if (make) {
        const r = make();
        original = { subject: r.subject, html: r.html };
      }
    } catch (previewErr) {
      // A template that throws on sample values is a bug worth knowing about,
      // but it must not take the whole screen down with it.
      console.error(`[admin.emails] preview failed for ${e.key}:`, previewErr?.message);
    }

    res.json({
      key: e.key,
      name: e.name,
      when: e.when,
      file: e.file,
      editable: e.editable,
      why: e.why || "",
      edited: !!o,
      subject: o?.subject || "",
      html: o?.html || "",
      original,
      // What is actually going out today: the edit if there is one, the
      // original otherwise. Saves the screen re-deriving the same rule.
      live: {
        subject: o?.subject || original?.subject || "",
        html: o?.html || original?.html || "",
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put("/:key", ...hub, async (req, res, next) => {
  try {
    const e = byKey.get(req.params.key);
    if (!e) return res.status(404).json({ error: "No such message" });
    if (!e.editable) {
      // 403 and the reason, not a silent no-op: the screen shows why, and the
      // refusal is a decision rather than something missing.
      return res.status(403).json({ error: e.why || "This message cannot be edited." });
    }

    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "").trim();
    if (!subject || !html) {
      return res.status(400).json({ error: "A message needs both a subject and a body." });
    }

    await EmailTemplate.findOneAndUpdate(
      { key: e.key },
      { $set: { subject, html, updatedByEmail: req.user?.email || "" } },
      { upsert: true, new: true },
    );

    // Rewriting what every customer reads is worth a line in the log.
    await writeAudit({
      actorId: req.user?._id,
      actorEmail: req.user?.email,
      action: "email.template.edit",
      status: 200,
      ...reqAuditContext(req),
      meta: { key: e.key, subject },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Put the code version back by removing the override. */
router.delete("/:key", ...hub, async (req, res, next) => {
  try {
    const e = byKey.get(req.params.key);
    if (!e) return res.status(404).json({ error: "No such message" });
    await EmailTemplate.deleteOne({ key: e.key });
    await writeAudit({
      actorId: req.user?._id,
      actorEmail: req.user?.email,
      action: "email.template.revert",
      status: 200,
      ...reqAuditContext(req),
      meta: { key: e.key },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
