// server/routes/admin.referrals.js
//
// Who referred whom, and whether it turned into a subscription.
//
// WHY THIS IS NOT ANSWERED BY THE PURCHASES QUEUE
//
// The queue carries `referredBy` on a row, and that was enough while the only
// question was "was this order referred?". It cannot answer the question the
// owner actually asked — "did the referred user subscribe?" — because a person
// who signed up on somebody's link and never bought anything has no order, so
// they never appear on a purchases screen at all. That silence reads as "no
// referrals", when it is half the picture: the half a referrer is waiting on.
//
// models/Referral.js was written for this. Its own comment says so:
//   ReferralSchema.index({ referrerUserId: 1, convertedAt: -1 });
//   // The admin list: newest first, and "converted only" without a scan.
// The index existed and the list did not.
//
// EVERY FIGURE COMES OUT OF THE REFERRAL DOCUMENTS
//
// Nothing is recomputed from purchases here. Conversion is claimed atomically
// in services/referrals.js by four separate paths (card, webhook, renewal cron,
// admin approval), and `convertedAt` is the single record of it. Counting
// purchases instead would disagree with the payouts.

import express from "express";
import { Referral } from "../models/Referral.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { referralListFilter, referralTotals } from "../util/referralQuery.js";

const router = express.Router();
router.use(requireAuth, requirePermission("adminhub"));

const LIMIT = 200;

/**
 * The referral list.
 *
 * ?converted=1 for the ones that paid, ?converted=0 for the ones that have not.
 * Both hit the indexes above rather than scanning.
 */
router.get("/", async (req, res) => {
  try {
    // Every rule about the filter — including that an unrecognised value lists
    // everything rather than nothing — is in util/referralQuery.js, tested.
    const where = referralListFilter(req.query);

    const [rows, counts] = await Promise.all([
      Referral.find(where).sort({ createdAt: -1 }).limit(LIMIT).lean(),
      // The totals are over ALL referrals, not the filtered page: a screen
      // showing "3 of 3 converted" because the filter is on would be a lie.
      Referral.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            converted: { $sum: { $cond: [{ $ifNull: ["$convertedAt", false] }, 1, 0] } },
            revenue: { $sum: { $ifNull: ["$convertedAmount", 0] } },
          },
        },
      ]),
    ]);

    const t = referralTotals(counts);

    res.json({
      ok: true,
      items: rows.map((r) => ({
        id: String(r._id),
        code: r.code,
        referrer: r.referrerEmail || "",
        referred: r.referredEmail || "",
        signupMethod: r.signupMethod || "unknown",
        signedUpAt: r.signedUpAt || r.createdAt || null,
        // The answer to the question this screen exists for.
        subscribed: Boolean(r.convertedAt),
        convertedAt: r.convertedAt || null,
        // Which of the four paths credited it, for when a number is questioned.
        convertedVia: r.convertedVia || "",
        amount: Number(r.convertedAmount) || 0,
        currency: r.convertedCurrency || "",
        // So a referrer can be told "they took HERON", not a bare yes.
        products: Array.isArray(r.convertedProducts) ? r.convertedProducts : [],
      })),
      totals: t,
      // Said rather than implied: a list capped at 200 that says nothing reads
      // as the whole thing.
      truncated: rows.length >= LIMIT,
      limit: LIMIT,
    });
  } catch (e) {
    console.error("[admin.referrals] list:", e);
    res.status(500).json({ error: "Could not read the referrals." });
  }
});

export default router;
