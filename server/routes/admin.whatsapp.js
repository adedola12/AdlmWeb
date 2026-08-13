import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { WhatsAppChat } from "../models/WhatsAppChat.js";

const router = express.Router();
router.use(requireAuth, requirePermission("whatsapp"));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * The nine working queues, defined here as Mongo filters.
 *
 * The bot already computes the `lists` array on every chat, so these could all
 * be `{ lists: name }`. They are written out instead because the board must
 * still be usable if the bot is mid-deploy or a tag pass failed — "Awaiting
 * Human" asking for the ops flag directly cannot be emptied by a bad tag write.
 */
const QUEUES = {
  "Hot Leads": { stage: "03-Hot" },
  "Awaiting Human": { ops: "x-NeedsHuman" },
  "Payment Problems": { ops: { $in: ["x-PaymentIssue", "x-Unhappy"] } },
  "Waitlist - CIVIQ": { stage: "05-Waitlist", products: "p-CIVIQ" },
  "Waitlist - ArchiCAD": { stage: "05-Waitlist", products: "p-ArchiCAD" },
  "Training Pipeline": { intent: "i-Training", stage: { $nin: ["04-Customer", "07-Lost"] } },
  Enterprise: { intent: "i-Enterprise" },
  "Follow-up Due": { follow_up_on: { $ne: null } },
  "Dormant - Re-engage": { stage: "06-Dormant" },
};

// Fields the board lists. Transcripts are deliberately excluded — they are the
// bulk of a document and nobody reads them from a list view.
const LIST_FIELDS =
  "phone name firm role language region stage intent products ops priority " +
  "lists next_action follow_up_on owner notes first_seen last_message " +
  "syncedToCrmAt crmContactPageId crmError tagError tagRejections taggedAt";

function buildFilter(q) {
  const filter = {};

  if (q.list && QUEUES[q.list]) Object.assign(filter, QUEUES[q.list]);
  if (q.stage) filter.stage = q.stage;
  if (q.priority) filter.priority = q.priority;
  if (q.owner) filter.owner = q.owner === "unassigned" ? "bot" : q.owner;
  if (q.product) filter.products = q.product;

  // "Follow-up Due" means due, not merely scheduled.
  if (q.list === "Follow-up Due") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    filter.follow_up_on = { $ne: null, $lte: endOfToday };
  }

  if (q.q) {
    const rx = new RegExp(String(q.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ phone: rx }, { name: rx }, { firm: rx }, { notes: rx }];
  }

  return filter;
}

/**
 * GET /admin/whatsapp/chats
 * Oldest first, because every one of these queues is a backlog: the chat that
 * has waited longest is the one costing the most.
 */
router.get(
  "/chats",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = buildFilter(req.query);

    const [items, total] = await Promise.all([
      WhatsAppChat.find(filter)
        .select(LIST_FIELDS)
        .sort({ last_message: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WhatsAppChat.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  })
);

/** Counts for the queue tabs, in one round trip rather than nine. */
router.get(
  "/queues",
  asyncHandler(async (_req, res) => {
    const names = Object.keys(QUEUES);
    const counts = await Promise.all(
      names.map((n) => WhatsAppChat.countDocuments(buildFilter({ list: n })))
    );
    res.json({ queues: names.map((name, i) => ({ name, count: counts[i] })) });
  })
);

/** One chat, transcript included — this is the view a human reads before replying. */
router.get(
  "/chats/:phone",
  asyncHandler(async (req, res) => {
    const doc = await WhatsAppChat.findOne({ phone: req.params.phone })
      .select("-context") // Claude-shaped blocks; useless to a human
      .lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  })
);

/**
 * PATCH /admin/whatsapp/chats/:phone
 *
 * The operational edits a human makes from the board. Deliberately narrow: the
 * bot owns classification, and letting the board rewrite arbitrary fields would
 * mean the next tag pass silently reverts whatever was typed.
 */
const OPS_FLAGS = ["x-NeedsHuman", "x-PaymentIssue", "x-Unhappy"];

router.patch(
  "/chats/:phone",
  asyncHandler(async (req, res) => {
    const { owner, stage, clearOps, note } = req.body || {};
    const set = {};
    const pull = {};

    if (typeof owner === "string") set.owner = owner.trim().slice(0, 80) || "bot";
    if (typeof stage === "string" && /^0[1-7]-/.test(stage)) set.stage = stage;
    if (typeof note === "string") set.notes = note.trim().slice(0, 1200);

    if (clearOps) {
      const flags = (Array.isArray(clearOps) ? clearOps : [clearOps]).filter((f) =>
        OPS_FLAGS.includes(f)
      );
      if (flags.length) pull.ops = { $in: flags };
    }

    if (!Object.keys(set).length && !Object.keys(pull).length) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(pull).length) update.$pull = pull;

    const doc = await WhatsAppChat.findOneAndUpdate({ phone: req.params.phone }, update, {
      returnDocument: "after",
    })
      .select(LIST_FIELDS)
      .lean();

    if (!doc) return res.status(404).json({ error: "Not found" });

    // `lists` is derived by the bot from ops/stage, so clearing a flag here
    // would leave the chat sitting in a queue it no longer belongs to until the
    // next message arrives. Recompute the two that a human edit can affect.
    const lists = new Set(doc.lists || []);
    if (!(doc.ops || []).includes("x-NeedsHuman")) lists.delete("Awaiting Human");
    if (!(doc.ops || []).some((o) => ["x-PaymentIssue", "x-Unhappy"].includes(o))) {
      lists.delete("Payment Problems");
    }
    if (doc.stage !== "03-Hot") lists.delete("Hot Leads");

    if ((doc.lists || []).length !== lists.size) {
      await WhatsAppChat.updateOne({ phone: req.params.phone }, { $set: { lists: [...lists] } });
      doc.lists = [...lists];
    }

    res.json(doc);
  })
);

/**
 * GET /admin/whatsapp/summary — the daily and weekly rollup from Part 8 of the
 * chat management instructions.
 */
router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const byField = (field, match = {}) =>
      WhatsAppChat.aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

    const [
      total,
      newToday,
      newThisWeek,
      byStage,
      byIntent,
      byPriority,
      byLanguage,
      byRegion,
      products,
      openP1,
      awaitingHuman,
      followUpsDue,
      oldestWaiting,
      crmSynced,
      tagFailures,
    ] = await Promise.all([
      WhatsAppChat.countDocuments({}),
      WhatsAppChat.countDocuments({ first_seen: { $gte: startOfToday } }),
      WhatsAppChat.countDocuments({ first_seen: { $gte: weekAgo } }),
      byField("stage"),
      byField("intent"),
      byField("priority"),
      byField("language"),
      byField("region"),
      WhatsAppChat.aggregate([
        { $unwind: "$products" },
        { $group: { _id: "$products", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      WhatsAppChat.countDocuments({ priority: "P1" }),
      WhatsAppChat.countDocuments({ ops: "x-NeedsHuman" }),
      WhatsAppChat.countDocuments({ follow_up_on: { $ne: null, $lte: endOfToday } }),
      WhatsAppChat.find({ ops: "x-NeedsHuman" })
        .select("phone name last_message")
        .sort({ last_message: 1 })
        .limit(5)
        .lean(),
      WhatsAppChat.countDocuments({ syncedToCrmAt: { $ne: null } }),
      WhatsAppChat.countDocuments({ tagError: { $nin: ["", null] } }),
    ]);

    res.json({
      generatedAt: now,
      totals: { total, newToday, newThisWeek, crmSynced },
      // These four are the "should be zero / should be small" numbers. Reported
      // as they are, because a board that flatters the week is worse than none.
      attention: { openP1, awaitingHuman, followUpsDue, tagFailures },
      oldestWaiting,
      breakdown: { byStage, byIntent, byPriority, byLanguage, byRegion, products },
    });
  })
);

export default router;
