// Who may download the Installer Hub (R3, owner decision 2026-09-26).
//
// An account that has not paid for anything must not get the Hub. The rule:
//
//   * staff (isStaffAccount: any role other than "user", a God account, or an
//     ADLM address) always may, so support can install on a customer's PC;
//   * everybody else needs at least one entitlement that is active and not
//     past its expiresAt (hasActiveEntitlement, the same test the project
//     masking uses), for a DESKTOP product: one the Hub itself installs
//     (owner decision 2026-09-27). A course or a web add-on is paid for, but
//     there is nothing in the Hub for it to install.
//
// Pure, so the decision is tested without a database. The routes that hand out
// the link (/me/downloads/installer-hub and /me/summary) both ask this.

import { hasActiveEntitlement } from "./workOverview.js";
import { isStaffAccount } from "./silentCustomers.js";

export const HUB_REQUIRES_PAID = "HUB_REQUIRES_PAID";

export const HUB_REQUIRES_PAID_MESSAGE =
  "The Installer Hub is for accounts with an active licence for one of our desktop products. Buy or renew one to download it.";

// Where an email or any other link outside a signed-in page sends someone for
// the Hub: their dashboard, whose Installer Hub card only carries a link for a
// paid account, so the check above runs when they open it. Never the file's
// own URL, which would outlive the licence and work for whoever the email is
// forwarded to. /dashboard, not /manage/downloads: customers stay on the
// classic dashboard until go-live (lib/afterSignIn.js), and on 1 Oct
// /dashboard redirects to Manage, so this link is right on both sides.
export const INSTALLER_HUB_PAGE = "/dashboard";

/** The Downloads screen on the site at `webUrl`. */
export function installerHubPageUrl(webUrl) {
  return `${String(webUrl || "").replace(/\/+$/, "")}${INSTALLER_HUB_PAGE}`;
}

/** True when this (lean) user holds at least one live, unexpired entitlement. */
export function hasAnyLiveEntitlement(user, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return (user?.entitlements || []).some(
    (e) => e?.productKey && hasActiveEntitlement(user, e.productKey, t),
  );
}

/**
 * The products the Installer Hub installs, by entitlement productKey. Read off
 * the Hub itself (ADLMInstallerHub) and the live catalogue on 2026-09-27:
 * QUIV (revit), HERON (planswift), Revit MEP (mep, and the legacy revitmep
 * key), CIVIQ (civil3d), ArchiCAD (archicad), RateGen's desktop app
 * (rategen), Time Pro (qs-takeoff) and the Excel add-in (exceladdin,
 * excelbridge).
 *
 * Not here on purpose: courses (BIMMEP, bimbld, anything isCourse) and web
 * add-ons such as boq-import or ai. A NEW desktop product must be added here,
 * or its buyers cannot download the Hub that installs it.
 */
export const DESKTOP_PRODUCT_KEYS = Object.freeze(
  new Set([
    "revit",
    "planswift",
    "mep",
    "revitmep",
    "civil3d",
    "archicad",
    "rategen",
    "qs-takeoff",
    "exceladdin",
    "excelbridge",
  ]),
);

const isDesktopKey = (key) => DESKTOP_PRODUCT_KEYS.has(String(key || "").trim().toLowerCase());

/** True when this (lean) user holds a live, unexpired DESKTOP licence. */
export function hasLiveDesktopLicence(user, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return (user?.entitlements || []).some(
    (e) => isDesktopKey(e?.productKey) && hasActiveEntitlement(user, e.productKey, t),
  );
}

/** May this (lean) user download the Installer Hub? */
export function canDownloadInstallerHub(user, now = Date.now()) {
  if (!user || user.disabled) return false;
  if (isStaffAccount(user)) return true;
  return hasLiveDesktopLicence(user, now);
}
