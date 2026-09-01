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
import { EMAILS, byKey } from "../util/emailCatalogue.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";

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
router.get("/:key", ...hub, async (req, res, next) => {
  try {
    const e = byKey.get(req.params.key);
    if (!e) return res.status(404).json({ error: "No such message" });
    const o = await EmailTemplate.findOne({ key: e.key }).lean();
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
