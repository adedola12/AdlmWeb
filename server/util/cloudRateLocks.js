// A rate set on the website survives a plugin re-save.
//
// The owner's rule (1 Oct 2026): QUIV measures, the cloud prices. A bill line
// whose rate the QS picked from Rate Gen or typed into the rate cell carries
// rateLockedAt (see deriveBillRates.isRateApplied). The plugins rebuild the
// whole bill on every save and their payload has no rateLockedAt field, so a
// re-save used to drop the lock - and with it the protection against the bill
// rate being re-derived from the budget the plugin had just uploaded. The QS's
// rate reverted to the plugin's without anyone being told.
//
// carryCloudRateLocks puts the cloud's rate and lock back on an incoming line
// that does not speak about the lock at all (the field is absent). A payload
// that sends rateLockedAt explicitly - the website's own save, which can set
// or clear it - is left exactly as sent. Lines pair on their bill code. Pure
// (no DB / mongoose).

import { isRateApplied } from "./deriveBillRates.js";

const norm = (v) => String(v ?? "").trim().toLowerCase();

/**
 * @param {Array} stored   the project's bill lines before this save
 * @param {Array} incoming the lines the save is about to write (mutated)
 * @returns {{ kept: number }} how many lines got the cloud's rate back
 */
export function carryCloudRateLocks(stored, incoming) {
  const locked = new Map();
  for (const it of Array.isArray(stored) ? stored : []) {
    const code = norm(it?.code);
    if (code && isRateApplied(it) && !locked.has(code)) locked.set(code, it);
  }
  if (!locked.size) return { kept: 0 };

  let kept = 0;
  for (const it of Array.isArray(incoming) ? incoming : []) {
    if (!it || typeof it !== "object") continue;
    if (Object.prototype.hasOwnProperty.call(it, "rateLockedAt")) continue; // the payload decided
    const prev = locked.get(norm(it.code));
    if (!prev) continue;
    it.rate = prev.rate;
    it.rateLockedAt = prev.rateLockedAt;
    if (prev.appliedRateKey) it.appliedRateKey = prev.appliedRateKey;
    if (prev.rateSource) it.rateSource = prev.rateSource;
    kept += 1;
  }
  return { kept };
}

export default carryCloudRateLocks;
