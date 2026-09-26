// Who may download the Installer Hub (R3, owner decision 2026-09-26).
//
// An account that has not paid for anything must not get the Hub. The rule:
//
//   * staff (isStaffAccount: any role other than "user", a God account, or an
//     ADLM address) always may, so support can install on a customer's PC;
//   * everybody else needs at least one entitlement that is active and not
//     past its expiresAt (hasActiveEntitlement, the same test the project
//     masking uses), for any product.
//
// Pure, so the decision is tested without a database. The routes that hand out
// the link (/me/downloads/installer-hub and /me/summary) both ask this.

import { hasActiveEntitlement } from "./workOverview.js";
import { isStaffAccount } from "./silentCustomers.js";

export const HUB_REQUIRES_PAID = "HUB_REQUIRES_PAID";

export const HUB_REQUIRES_PAID_MESSAGE =
  "The Installer Hub is for accounts with an active paid licence. Buy or renew a product to download it.";

/** True when this (lean) user holds at least one live, unexpired entitlement. */
export function hasAnyLiveEntitlement(user, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return (user?.entitlements || []).some(
    (e) => e?.productKey && hasActiveEntitlement(user, e.productKey, t),
  );
}

/** May this (lean) user download the Installer Hub? */
export function canDownloadInstallerHub(user, now = Date.now()) {
  if (!user || user.disabled) return false;
  if (isStaffAccount(user)) return true;
  return hasAnyLiveEntitlement(user, now);
}
