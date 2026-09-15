// Closing orders that were never approved.
//
// An order sits `pending` until somebody approves it. Most are approved
// within a day; a few never are, because the transfer never arrived or the
// buyer changed their mind and said nothing. Those sit in the queue forever,
// and the queue is what the studio works from — so a register that is half
// dead orders is a register nobody trusts.
//
// After fifty days an unapproved order is closed and the buyer is told, with
// the steps to start again.
//
// WHAT IT WILL NOT TOUCH
//
// A paid order is never auto-closed, whatever its age. If money arrived and
// nobody approved it, that is a failure on this side and closing it would
// compound it — those are surfaced for a person to deal with instead.
//
// THE CAP EXISTS BECAUSE OF THE BACKLOG
//
// This rule was introduced when 30 orders were ALREADY past fifty days, the
// oldest at 290. Without a cap the first run would send thirty emails in one
// burst — to a domain that has just started warming, about orders up to ten
// months old. It drains a few a day instead, which is both kinder to the
// sender reputation and closer to how the rule will behave once the backlog
// is gone.

import { Purchase } from "../models/Purchase.js";
import { User } from "../models/User.js";
import { sendMail } from "./mailer.js";
import { purchaseAutoDeclined } from "./emailContent.js";

const DAY = 864e5;

export const STALE_AFTER_DAYS = Number(process.env.PURCHASE_STALE_DAYS || 50);

/** How many to close in one run. See the note above. */
export const STALE_CAP = Number(process.env.PURCHASE_STALE_CAP || 8);

const SITE = process.env.PUBLIC_SITE_URL || "https://adlmstudio.net";

/** What the buyer ordered, said in a few words. */
function describe(purchase) {
  const lines = purchase?.lines || [];
  if (!lines.length) return "";
  const first = lines[0];
  const name = first.name || first.productKey || "";
  const more = lines.length - 1;
  return more > 0 ? `${name} and ${more} other item${more === 1 ? "" : "s"}` : name;
}

/**
 * Close what has gone stale.
 *
 * @param {object}  opt
 * @param {boolean} opt.dryRun  list what would happen and change nothing
 * @param {number}  opt.cap     override the per-run cap
 */
export async function sweepStaleOrders({ dryRun = false, cap = STALE_CAP } = {}) {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * DAY);

  const stale = await Purchase.find({
    status: "pending",
    createdAt: { $lt: cutoff },
    // Paid but unapproved is somebody else's problem to look at, not this
    // job's to close. Both spellings, because `paid` is the flag and a
    // Paystack reference means money moved even if the flag was missed.
    paid: { $ne: true },
    paystackRef: { $in: [null, ""] },
  })
    .sort({ createdAt: 1 })
    .limit(Math.max(1, cap))
    .lean();

  // Counted separately so the report can say "and this many are waiting",
  // rather than implying the cap-sized batch is all there is.
  const total = await Purchase.countDocuments({
    status: "pending",
    createdAt: { $lt: cutoff },
    paid: { $ne: true },
    paystackRef: { $in: [null, ""] },
  });

  // The ones that DID pay and were never approved. Not touched, but the
  // number is worth putting in front of somebody.
  const paidButPending = await Purchase.countDocuments({
    status: "pending",
    createdAt: { $lt: cutoff },
    $or: [{ paid: true }, { paystackRef: { $nin: [null, ""] } }],
  });

  const closed = [];
  const failed = [];

  for (const p of stale) {
    const days = Math.floor((Date.now() - new Date(p.createdAt)) / DAY);
    const row = { id: String(p._id), email: p.email || "", days, total: p.totalAmount };

    if (dryRun) {
      closed.push(row);
      continue;
    }

    try {
      await Purchase.updateOne(
        { _id: p._id, status: "pending" },
        {
          $set: {
            status: "rejected",
            // Named so an admin reading the record knows no human decided
            // this, and can tell it apart from a rejection somebody made.
            decidedBy: "system — unapproved for " + STALE_AFTER_DAYS + " days",
            decidedAt: new Date(),
          },
        },
      );

      if (p.email) {
        const user = await User.findById(p.userId).select("firstName").lean();
        const { subject, html } = purchaseAutoDeclined({
          firstName: user?.firstName || "",
          ref: p._id ? `ADLM-${String(p._id).slice(-4).toUpperCase()}` : "",
          what: describe(p),
          total: p.totalAmount,
          currency: p.currency,
          days,
          href: `${SITE}/products`,
          whatsNewHref: `${SITE}/whats-new`,
        });
        await sendMail({
          to: p.email,
          subject,
          html,
          templateKey: "purchase.auto-declined",
        });
      }

      closed.push(row);
    } catch (err) {
      // The order is already closed at this point if the update went
      // through — a mail failure must not roll that back or the same order
      // gets closed again tomorrow and the buyer gets two notices.
      failed.push({ ...row, error: err?.message || String(err) });
      console.error(`[stale-orders] ${p._id}:`, err?.message || err);
    }
  }

  return {
    ok: true,
    dryRun,
    staleAfterDays: STALE_AFTER_DAYS,
    closed: closed.length,
    failed: failed.length,
    waiting: Math.max(0, total - closed.length),
    paidButPending,
    rows: closed,
    errors: failed,
  };
}
