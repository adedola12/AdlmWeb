// Close accounts that never confirmed their email (2026-09-18).
//
// Runs daily after the expiry job (scheduled.js). An account is CLOSED
// (disabled, never deleted) when all of these hold:
//
//   * its email is still unconfirmed;
//   * it had its 14 days: 14 days since the one reminder
//     (emailVerifyReminderAt), or, for an account created after the confirm
//     screen shipped, 14 days since its last code was sent;
//   * it is a plain customer account (no staff role or permissions);
//   * it holds no live licence and has never made a purchase.
//
// Accounts created before the confirm screen existed are never closed on the
// strength of the codes they were sent then, because they had no screen to
// type them into; they are only closed after the reminder.
//
// Reversible: an admin clears `disabled` and the account works again.

import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";

export const CONFIRM_DAYS = 14;
// The day the confirm screen went live on adlmstudio.net.
export const CONFIRM_SCREEN_LIVE = new Date("2026-09-19T00:00:00Z");

const DAY = 864e5;

function liveLicence(entitlements, now) {
  return (Array.isArray(entitlements) ? entitlements : []).some(
    (e) =>
      e &&
      String(e.status || "").toLowerCase() === "active" &&
      (!e.expiresAt || new Date(e.expiresAt).getTime() > now),
  );
}

/** Pure: does this account's own record put it past its 14 days? */
export function dueToClose(u, { now = Date.now(), purchased = false } = {}) {
  if (!u || u.emailVerified === true || u.disabled) return false;
  if (String(u.role || "user").toLowerCase() !== "user") return false;
  if (Array.isArray(u.permissions) && u.permissions.length) return false;
  if (purchased || liveLicence(u.entitlements, now)) return false;
  const cut = now - CONFIRM_DAYS * DAY;
  const reminded = u.emailVerifyReminderAt && new Date(u.emailVerifyReminderAt).getTime() <= cut;
  const newSignup =
    u.createdAt &&
    new Date(u.createdAt).getTime() >= CONFIRM_SCREEN_LIVE.getTime() &&
    u.emailVerifySentAt &&
    new Date(u.emailVerifySentAt).getTime() <= cut;
  return Boolean(reminded || newSignup);
}

export async function runUnconfirmedSweep({ now = new Date(), dryRun = false } = {}) {
  const cut = new Date(now.getTime() - CONFIRM_DAYS * DAY);
  const candidates = await User.find(
    {
      emailVerified: { $ne: true },
      disabled: { $ne: true },
      $or: [
        { emailVerifyReminderAt: { $lte: cut } },
        { createdAt: { $gte: CONFIRM_SCREEN_LIVE }, emailVerifySentAt: { $lte: cut } },
      ],
    },
    { email: 1, role: 1, emailVerified: 1, disabled: 1, entitlements: 1, createdAt: 1, emailVerifySentAt: 1, emailVerifyReminderAt: 1 },
  ).lean();

  const closed = [];
  for (const u of candidates) {
    const purchased = !!(await Purchase.exists({ userId: u._id }));
    if (!dueToClose(u, { now: now.getTime(), purchased })) continue;
    closed.push(String(u._id));
    if (!dryRun) {
      await User.updateOne(
        { _id: u._id, emailVerified: { $ne: true } },
        { $set: { disabled: true, disabledReason: "email-unconfirmed", disabledAt: now } },
      );
    }
  }
  return { ok: true, dryRun, candidates: candidates.length, closed: closed.length };
}
