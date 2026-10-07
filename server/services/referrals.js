// Capturing a referral, and crediting it once.
//
// Two jobs, deliberately separated, because they happen minutes or months
// apart and on completely different code paths.
//
// CAPTURE runs at account creation. There are exactly two places an account is
// made — the password signup and the social callback — so both call
// recordReferral. A referral captured in only one of them loses every Google
// and Microsoft signup, which on this site is most of them.
//
// CREDIT runs at the first payment. There are FOUR paths from unpaid to paid
// and they are not interchangeable:
//
//   card verify        the buyer returning to the thank-you page
//   the webhook        Paystack telling us, possibly more than once
//   admin approval     a bank transfer or invoice order — this one never sets
//                      `paid`, so anything keyed on that field silently drops
//                      every non-card customer
//   the renewal cron   which must NOT credit: a renewal is a new Purchase every
//                      cycle, and paying a referrer monthly for ever is not
//                      what anybody means by a referral
//
// Both of the first two race on purpose. So the credit is an atomic conditional
// update rather than a read followed by a write.

import { Referral } from "../models/Referral.js";
import { User } from "../models/User.js";
import { newReferralCode, normaliseReferralCode, referralLink } from "../util/referralCode.js";

const str = (v) => String(v || "").trim();

/**
 * The signed-in user's own code, made on first ask and kept thereafter.
 *
 * Stored on the user so the same person always hands out the same link — a code
 * that changed between conversations would be worse than none, because the ones
 * already sent would stop working.
 */
export async function getOrCreateReferralCode(userId) {
  const u = await User.findById(userId, { referralCode: 1, email: 1 }).lean();
  if (!u) return null;
  if (u.referralCode) return u.referralCode;

  // Retry on the unique index rather than checking first: two of the user's own
  // tabs can ask at the same moment.
  for (let i = 0; i < 5; i += 1) {
    const code = newReferralCode();
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, $or: [{ referralCode: { $exists: false } }, { referralCode: "" }, { referralCode: null }] },
        { $set: { referralCode: code } },
        { new: true, projection: { referralCode: 1 } },
      );
      // Somebody else won: re-read and use theirs.
      if (!updated) {
        const again = await User.findById(userId, { referralCode: 1 }).lean();
        if (again?.referralCode) return again.referralCode;
        continue;
      }
      return updated.referralCode;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Code collided with another user's. Draw again.
    }
  }
  return null;
}

/** The whole answer Ada needs: the code, the link, and how it is doing. */
export async function referralSummary(userId) {
  const code = await getOrCreateReferralCode(userId);
  if (!code) return null;
  const [signups, converted] = await Promise.all([
    Referral.countDocuments({ referrerUserId: userId }),
    Referral.countDocuments({ referrerUserId: userId, convertedAt: { $ne: null } }),
  ]);
  return { code, link: referralLink(code), signups, converted };
}

/**
 * Attach a new account to whoever referred it.
 *
 * Never throws: a referral is an attribution, and losing one must never stop
 * somebody creating an account. Every reason to refuse is returned rather than
 * raised, so the caller can log it without a try/catch around signup.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function recordReferral({ code, newUser, signupMethod = "unknown" } = {}) {
  try {
    const c = normaliseReferralCode(code);
    if (!c) return { ok: false, reason: "no-code" };
    if (!newUser?._id) return { ok: false, reason: "no-user" };

    const referrer = await User.findOne({ referralCode: c }, { _id: 1, email: 1 }).lean();
    if (!referrer) return { ok: false, reason: "unknown-code" };

    // The obvious abuse: sign up on your own link. Nothing stops somebody
    // making a second account, but self-referral in one step should not pay.
    if (String(referrer._id) === String(newUser._id)) {
      return { ok: false, reason: "self-referral" };
    }

    await Referral.create({
      code: c,
      referrerUserId: referrer._id,
      referrerEmail: referrer.email || "",
      referredUserId: newUser._id,
      referredEmail: newUser.email || "",
      signupMethod,
    });
    return { ok: true };
  } catch (err) {
    // 11000 is the unique index on referredUserId: this person is already
    // somebody's referral. That is the index doing its job, not a fault.
    if (err?.code === 11000) return { ok: false, reason: "already-referred" };
    console.error("[referrals] capture failed:", err?.message || err);
    return { ok: false, reason: "error" };
  }
}

/**
 * Credit a referral the first time its person pays.
 *
 * ATOMIC. `{referredUserId, convertedAt: null}` → `$set` returns the document
 * to exactly one caller; every later call, every webhook re-delivery and the
 * loser of the thank-you-page race all get null and do nothing.
 *
 * A renewal never credits: `isRenewal` purchases are a new document each cycle.
 *
 * @returns {Promise<object|null>} the referral just credited, or null
 */
export async function creditReferral(purchase, via) {
  try {
    if (!purchase?.userId) return null;
    if (purchase.isRenewal === true) return null;
    if (via === "renewal") return null;

    const products = (Array.isArray(purchase.lines) ? purchase.lines : [])
      .map((l) => str(l?.productKey))
      .filter(Boolean);

    return await Referral.findOneAndUpdate(
      { referredUserId: purchase.userId, convertedAt: null },
      {
        $set: {
          convertedAt: new Date(),
          convertedVia: via || "card",
          convertedPurchaseId: purchase._id || null,
          convertedAmount: Number(purchase.totalAmount) || 0,
          convertedCurrency: str(purchase.currency),
          convertedProducts: products,
        },
      },
      { new: true },
    );
  } catch (err) {
    // Crediting must never fail a payment. The money is the customer's
    // business; the attribution is ours.
    console.error("[referrals] credit failed:", err?.message || err);
    return null;
  }
}

/** Who referred this user, for the admin row beside an order. */
export async function referrerOf(userId) {
  if (!userId) return null;
  return Referral.findOne(
    { referredUserId: userId },
    { referrerEmail: 1, code: 1, convertedAt: 1, signedUpAt: 1 },
  ).lean();
}
