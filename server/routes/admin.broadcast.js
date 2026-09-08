import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Broadcast, BroadcastRecipient, hashRecipient } from "../models/Broadcast.js";
import { sendMail } from "../util/mailer.js";

/**
 * Admin broadcast mail.
 *
 * There was no way to mail the customer base. The only fleet-wide control was
 * POST /admin/settings/force-reinstall, which is not a notification at all: it
 * revokes every device binding and bumps refreshVersion on every user, signing
 * the whole fleet out and forcing re-activation. Announcements therefore either
 * went unsent or cost every customer a re-activation.
 *
 * Shape of this one:
 *   POST /admin/broadcast/preview   count the audience, send nothing
 *   POST /admin/broadcast           materialise the recipient ledger (draft)
 *   POST /admin/broadcast/:key/send send one bounded batch, repeatable
 *   GET  /admin/broadcast/:key      progress
 *   GET  /admin/broadcast           recent broadcasts
 *
 * Sending is deliberately three steps, not one. Preview is free and answers
 * "how many people am I about to mail". Creating writes the ledger but sends
 * nothing, so the audience can be inspected before a single message leaves.
 * Only /send actually mails, and only a bounded batch per call.
 */

const router = express.Router();

function requireAdminOnly(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

// Mailing the customer base is not a mini-admin action.
router.use(requireAuth, requireAdminOnly);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const MAX_BATCH = 200;
const DEFAULT_BATCH = 50;

/** Messages per second. Resend and SMTP both throttle; default is deliberately timid. */
function ratePerSecond() {
  const n = Number.parseInt(process.env.BROADCAST_RATE_PER_SEC || "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 2;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Turns an audience string into a Mongo query.
 *
 * Every audience requires a verified address — an unverified one is as likely
 * to be a typo as a person — and every audience honours emailPrefs.marketing.
 * A broadcast is the definition of the bulk mail that flag exists to refuse;
 * the transactional paths that legitimately ignore it (receipts, licence
 * activations, resets) do not come through here.
 */
function audienceQuery(audience) {
  const base = {
    email: { $ne: "" },
    emailVerified: true,
    "emailPrefs.marketing": { $ne: false },
  };

  if (audience === "all") return base;

  if (audience === "entitled") {
    return { ...base, "entitlements.status": "active" };
  }

  const m = /^product:([a-z0-9._-]+)$/i.exec(audience || "");
  if (m) {
    return {
      ...base,
      entitlements: {
        $elemMatch: { productKey: m[1].toLowerCase(), status: "active" },
      },
    };
  }

  return null;
}

router.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const audience = String(req.body?.audience || "all").trim();
    const query = audienceQuery(audience);
    if (!query) {
      return res.status(400).json({ error: 'audience must be "all", "entitled" or "product:<key>"' });
    }

    const [total, optedOut, unverified, sample] = await Promise.all([
      User.countDocuments(query),
      // Shown so the number that will not be mailed is visible up front,
      // rather than surfacing later as "why did only 300 of 400 get it".
      User.countDocuments({ email: { $ne: "" }, "emailPrefs.marketing": false }),
      User.countDocuments({ email: { $ne: "" }, emailVerified: { $ne: true } }),
      User.find(query, { email: 1 }).limit(5).lean(),
    ]);

    res.json({
      audience,
      recipients: total,
      excluded: { marketingOptOut: optedOut, unverifiedEmail: unverified },
      sample: sample.map((u) => u.email),
      note: "Nothing was sent. POST /admin/broadcast to build the ledger, then /send.",
    });
  }),
);

// Create (or return) a broadcast and materialise its recipient ledger.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const key = String(req.body?.key || "").trim();
    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "").trim();
    const audience = String(req.body?.audience || "all").trim();

    if (!key) return res.status(400).json({ error: "key is required (idempotency key)" });
    if (!subject) return res.status(400).json({ error: "subject is required" });
    if (!html) return res.status(400).json({ error: "html is required" });

    const query = audienceQuery(audience);
    if (!query) {
      return res.status(400).json({ error: 'audience must be "all", "entitled" or "product:<key>"' });
    }

    let broadcast = await Broadcast.findOne({ key });
    if (!broadcast) {
      broadcast = await Broadcast.create({
        key,
        subject,
        html,
        audience,
        createdBy: req.user?.email || "",
      });
    } else if (broadcast.status !== "draft") {
      // Editing the words of a broadcast that has already gone out to some
      // people would leave two different messages under one key.
      return res.status(409).json({
        error: `Broadcast "${key}" is already ${broadcast.status}; use a new key to send a different message.`,
      });
    }

    // Enrol in pages so a large audience does not need to be held in memory.
    const cursor = User.find(query, { email: 1 }).lean().cursor();
    let enrolled = 0;
    let already = 0;
    let batch = [];

    const flush = async () => {
      if (!batch.length) return;
      try {
        const r = await BroadcastRecipient.insertMany(batch, { ordered: false });
        enrolled += r.length;
      } catch (err) {
        // Duplicate-key errors are the unique index doing its job on a re-run:
        // those addresses are already enrolled, which is exactly the outcome
        // wanted. Anything else is a real failure.
        enrolled += err?.result?.result?.nInserted ?? err?.insertedDocs?.length ?? 0;
        const dups = (err?.writeErrors || []).filter((e) => e?.err?.code === 11000 || e?.code === 11000);
        already += dups.length;
        if ((err?.writeErrors || []).length !== dups.length) throw err;
      }
      batch = [];
    };

    for await (const u of cursor) {
      const email = String(u.email || "").trim().toLowerCase();
      if (!email) continue;
      batch.push({
        broadcastKey: key,
        userId: u._id,
        email,
        emailHash: hashRecipient(email),
      });
      if (batch.length >= 500) await flush();
    }
    await flush();

    const [total, pending] = await Promise.all([
      BroadcastRecipient.countDocuments({ broadcastKey: key }),
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "pending" }),
    ]);

    res.json({
      ok: true,
      key,
      subject,
      audience,
      status: broadcast.status,
      enrolled,
      alreadyEnrolled: already,
      total,
      pending,
      note: "Nothing has been sent. POST /admin/broadcast/" + key + "/send to begin.",
    });
  }),
);

// Send one bounded batch. Safe to call repeatedly until pending reaches zero.
router.post(
  "/:key/send",
  asyncHandler(async (req, res) => {
    const key = String(req.params.key || "").trim();
    const broadcast = await Broadcast.findOne({ key });
    if (!broadcast) return res.status(404).json({ error: `No broadcast "${key}"` });

    const limit = Math.min(
      Math.max(Number.parseInt(req.body?.limit ?? DEFAULT_BATCH, 10) || DEFAULT_BATCH, 1),
      MAX_BATCH,
    );

    if (broadcast.status === "draft") {
      broadcast.status = "sending";
      broadcast.startedAt = new Date();
      await broadcast.save();
    }

    const due = await BroadcastRecipient.find({ broadcastKey: key, status: "pending" })
      .limit(limit)
      .lean();

    const gap = 1000 / ratePerSecond();
    let sent = 0;
    let failed = 0;

    for (const r of due) {
      // Claim the row BEFORE mailing, marking it failed-in-flight. If the
      // Lambda dies between the claim and the send, the row is left failed
      // rather than pending, so a resume cannot mail this address again on a
      // guess — someone has to ask for it via /retry-failed. Erring toward a
      // missed message rather than a duplicate is the right way round: the
      // first is a support question, the second is a customer wondering why
      // they were mailed twice.
      const claim = await BroadcastRecipient.findOneAndUpdate(
        { _id: r._id, status: "pending" },
        { $set: { status: "failed", error: "in flight" }, $inc: { attempts: 1 } },
      );
      if (!claim) continue; // another call took it

      try {
        await sendMail({ to: r.email, subject: broadcast.subject, html: broadcast.html });
        await BroadcastRecipient.updateOne(
          { _id: r._id },
          { $set: { status: "sent", error: "", sentAt: new Date() } },
        );
        sent += 1;
      } catch (err) {
        await BroadcastRecipient.updateOne(
          { _id: r._id },
          { $set: { status: "failed", error: String(err?.message || err).slice(0, 500) } },
        );
        failed += 1;
      }

      await sleep(gap);
    }

    const [pending, totalSent, totalFailed, total] = await Promise.all([
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "pending" }),
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "sent" }),
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "failed" }),
      BroadcastRecipient.countDocuments({ broadcastKey: key }),
    ]);

    if (pending === 0 && broadcast.status === "sending") {
      broadcast.status = "done";
      broadcast.finishedAt = new Date();
      await broadcast.save();
    }

    res.json({
      ok: true,
      key,
      batchSent: sent,
      batchFailed: failed,
      pending,
      totals: { total, sent: totalSent, failed: totalFailed },
      status: pending === 0 ? "done" : "sending",
      note: pending > 0 ? `Call again to send the next ${Math.min(pending, limit)}.` : "Complete.",
    });
  }),
);

// Retry the ones that failed, without touching anyone already sent.
router.post(
  "/:key/retry-failed",
  asyncHandler(async (req, res) => {
    const key = String(req.params.key || "").trim();
    const r = await BroadcastRecipient.updateMany(
      { broadcastKey: key, status: "failed" },
      { $set: { status: "pending", error: "" } },
    );
    res.json({ ok: true, key, requeued: r.modifiedCount ?? 0 });
  }),
);

router.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const key = String(req.params.key || "").trim();
    const broadcast = await Broadcast.findOne({ key }).lean();
    if (!broadcast) return res.status(404).json({ error: `No broadcast "${key}"` });

    const [total, sent, failed, pending] = await Promise.all([
      BroadcastRecipient.countDocuments({ broadcastKey: key }),
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "sent" }),
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "failed" }),
      BroadcastRecipient.countDocuments({ broadcastKey: key, status: "pending" }),
    ]);

    res.json({ ...broadcast, totals: { total, sent, failed, pending } });
  }),
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await Broadcast.find({}).sort({ createdAt: -1 }).limit(25).lean();
    res.json({ items });
  }),
);

// Exposed for tests. audienceQuery decides who receives a mass mailing, so its
// behaviour is pinned rather than trusted.
export const __test = { audienceQuery };

export default router;
