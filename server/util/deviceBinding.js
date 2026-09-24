// server/util/deviceBinding.js
//
// Seat and device enforcement for desktop sign-in (POST /auth/login), moved
// out of routes/auth.js so it can be unit-tested without Express or Mongo.
//
// With DEVICE_SCHEME_AWARE_BINDING switched off (see util/deviceIdentity.js)
// enforceDeviceBinding behaves exactly as the routes/auth.js version did:
// every scheme-aware step below is behind `aware`.
//
// With it on (the default), three things change:
//
//  1. Adoption. A sign-in that is at the seat limit (organisation) or bound
//     elsewhere (personal) may take over a device row the Installer Hub wrote
//     for a product whose app never presents the Hub's id (revit, archicad):
//     the Hub's row is converted into this app's row, so the PC keeps ONE seat.
//     See installerRowCandidates for which rows qualify and why.
//  2. Provenance. Rows the app writes, migrates or matches are stamped
//     (source/scheme/client/appSeenAt), so a row an app has ever signed in on
//     is never mistaken for a Hub-only row again.
//  3. Rejections name the seat holder(s) in plain English (never their
//     fingerprints), and a personal licence whose bound machine was freed
//     from the account page no longer answers DEVICE_MISMATCH forever: with
//     no active machine left the next one binds, and a PC whose row is the
//     only active one (the Installer Hub bound it after the old one was
//     freed) is matched on it.

import {
  APP_SOURCE,
  HUB_SCHEME,
  HUB_SOURCE,
  clientScheme,
  holderAppLabel,
  hubSharesAppIdentity,
  isSchemeAwareBindingEnabled,
  productLabel,
  rowOrigin,
  rowScheme,
} from "./deviceIdentity.js";

export function normalizeLegacyEnt(entitlement) {
  if (!entitlement) return;

  if (!entitlement.seats || entitlement.seats < 1) entitlement.seats = 1;
  if (!Array.isArray(entitlement.devices)) entitlement.devices = [];

  const seats = Math.max(Number(entitlement.seats || 1), 1);
  const licenseType = String(entitlement.licenseType || "").toLowerCase();
  if (licenseType !== "organization" && seats > 1) {
    entitlement.licenseType = "organization";
  }
  if (!entitlement.licenseType) {
    entitlement.licenseType = seats > 1 ? "organization" : "personal";
  }

  if (entitlement.devices.length === 0 && entitlement.deviceFingerprint) {
    entitlement.devices.push({
      fingerprint: entitlement.deviceFingerprint,
      name: "",
      boundAt: entitlement.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }
}

export function activeDevices(entitlement) {
  return (entitlement?.devices || []).filter((device) => !device.revokedAt);
}

function isOrgEntitlement(entitlement) {
  const seats = Math.max(Number(entitlement?.seats || 1), 1);
  return (
    String(entitlement?.licenseType || "").toLowerCase() === "organization" ||
    seats > 1
  );
}

const time = (value) => {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/** May a sign-in of `scheme` for `productKey` take over Hub rows at all? */
export function adoptionAllowed(productKey, scheme) {
  return !hubSharesAppIdentity(productKey) && !!scheme && scheme !== HUB_SCHEME;
}

/**
 * The Hub rows a sign-in could adopt, BEFORE the app-use evidence check.
 *
 * A row qualifies only if every one of these holds:
 *  - the product's app never presents the Hub's id (revit, archicad) and the
 *    caller is not itself an hw2 client (RevitPluginArch2026, MEP, …) —
 *    for those the Hub row IS their own row, so there is nothing to adopt;
 *  - the row is active, fpVersion >= 2, written by the Hub (rowOrigin) and
 *    hw2 (rowScheme), and of a different scheme from the caller;
 *  - no app sign-in has ever matched it (no appSeenAt) and it was not
 *    adopted before (no adoptedAt). Every app sign-in stamps appSeenAt on the
 *    row it matches, so a RevitPluginArch2026 user, whose hw2 row the Hub
 *    also names, protects that row the first time they sign in.
 *
 * Rows written before the stamps existed carry no appSeenAt even when an
 * hw2 app uses them. For those the caller must also rule out app use from the
 * other records it has (see util/deviceAppEvidence.js) and pass the survivors
 * as `clearedInstallerRows`; enforceDeviceBinding adopts nothing else. Those
 * records do not yet include anything the SHIPPED R26 build sends (no
 * heartbeat; its takeoff telemetry is unreleased), so until that build ships
 * an older R26 row is protected only by an R26 sign-in after deploy.
 */
export function installerRowCandidates(entitlement, { productKey, scheme, fingerprint } = {}) {
  if (!adoptionAllowed(productKey, scheme)) return [];
  const fp = String(fingerprint || "").trim();
  return activeDevices(entitlement).filter((d) => {
    if (String(d.fingerprint || "") === fp) return false;
    if ((Number(d.fpVersion) || 1) < 2) return false;
    if (rowOrigin(d) !== HUB_SOURCE) return false;
    const rs = rowScheme(d, productKey);
    if (rs !== HUB_SCHEME || rs === scheme) return false;
    if (d.appSeenAt || d.adoptedAt) return false;
    return true;
  });
}

/**
 * Fingerprints that need the app-use evidence check for THIS sign-in: empty
 * unless the request will actually reach the adoption step (not already
 * bound here, and at the seat limit / bound elsewhere), so an ordinary
 * sign-in costs no extra query.
 */
export function adoptionEvidenceNeeded(entitlement, { productKey, scheme, fingerprint } = {}) {
  const fp = String(fingerprint || "").trim();
  if (!fp || !entitlement || !adoptionAllowed(productKey, scheme)) return [];

  normalizeLegacyEnt(entitlement);
  const active = activeDevices(entitlement);
  if (active.some((d) => d.fingerprint === fp)) return [];

  if (isOrgEntitlement(entitlement)) {
    const seats = Math.max(Number(entitlement.seats || 1), 1);
    if (active.length < seats) return [];
  } else {
    const mirror = entitlement.deviceFingerprint;
    if (!mirror || mirror === fp || active.length === 0) return [];
  }

  return installerRowCandidates(entitlement, { productKey, scheme, fingerprint: fp }).map(
    (d) => String(d.fingerprint),
  );
}

/**
 * Which candidate to convert: one whose Hub device name matches the name the
 * client reports (when it reports one: the strongest same-PC signal there is),
 * otherwise the least recently seen, then the oldest bound.
 */
export function pickAdoptionTarget(pool, deviceName = "") {
  const wanted = String(deviceName || "").trim().toLowerCase();
  let rows = pool;
  if (wanted) {
    const named = rows.filter((d) => String(d.name || "").trim().toLowerCase() === wanted);
    if (named.length) rows = named;
  }
  return [...rows].sort(
    (a, b) => time(a.lastSeenAt) - time(b.lastSeenAt) || time(a.boundAt) - time(b.boundAt),
  )[0];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Who holds the seat(s), for the rejection body. Never a fingerprint. An
 * adopted row's old Hub device name (installerName) is not offered as its
 * name: on a multi-seat licence the adopting PC need not be that machine.
 */
export function describeHolders(rows, productKey, limit = 10) {
  return [...(rows || [])]
    .sort((a, b) => time(b.lastSeenAt) - time(a.lastSeenAt))
    .slice(0, limit)
    .map((d) => ({
      name: String(d.name || "").trim(),
      app: holderAppLabel(d, productKey),
      lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : null,
    }));
}

export function rejectionMessage({ code, holder = [], seats = 1, productKey = "" }) {
  const label = productLabel(productKey);
  const one = (h) => {
    const bits = [h.app, h.lastSeenAt ? `last used ${formatDay(h.lastSeenAt)}` : ""].filter(Boolean);
    return `${h.name || "an unnamed computer"}${bits.length ? ` (${bits.join(", ")})` : ""}`;
  };
  const shown = holder.slice(0, 3).map(one);
  if (holder.length > 3) shown.push(`and ${holder.length - 3} more`);
  const who = shown.length ? shown.join("; ") : "another computer";
  const fix =
    "To use it on this computer, ask your admin to reset the device, " +
    "or free it from your account page on adlmstudio.net.";

  if (code === "DEVICE_LIMIT_REACHED") {
    const n = Math.max(Number(seats) || 1, 1);
    return `All ${n} ${n === 1 ? "seat" : "seats"} on this ${label} licence ${n === 1 ? "is" : "are"} in use: ${who}. ${fix}`;
  }
  return `This ${label} licence is already in use on another computer: ${who}. ${fix}`;
}

// Fingerprint v1→v2 migration: clients sending x-adlm-fp-version >= 2 that
// don't match any existing device may transparently replace the user's
// single legacy (v1) device. There is deliberately NO calendar deadline:
// v1 fingerprints are MAC-based and drift whenever the user switches
// network adapters, so a v1-bound user can show up needing migration at
// any time (the original fixed 90-day window expired 2026-07-16 and
// permanently locked such users out with DEVICE_MISMATCH). The migration
// self-closes per entitlement: once its devices are v2, tryMigrate finds
// no legacy device and normal binding enforcement applies.

// enforceDeviceBinding enforces seat limits and, for personal (1-seat)
// licenses, single-device binding. The `fpVersion` (from the
// x-adlm-fp-version header) lets us auto-migrate users seamlessly from
// the legacy MAC-based fingerprint to the new hardware-bound one
// without locking them out when their fingerprint changes shape.
//
// options (all optional; only read when scheme-aware binding is on):
//   enabled               override the DEVICE_SCHEME_AWARE_BINDING switch
//   productKey            the entitlement's product
//   scheme                the caller's scheme (deviceIdentity.clientScheme)
//   client                label stored on rows (deviceIdentity.clientLabel)
//   deviceName            the machine name the client reports, if any
//   clearedInstallerRows  fingerprints of Hub rows checked for app use and
//                         found clean; no other row is ever adopted
//
// Every result carries `decision`: bind | match | migrate | adopt | reject.
export function enforceDeviceBinding(entitlement, incomingFingerprint, fpVersion = 1, options = {}) {
  const fingerprint = String(incomingFingerprint || "").trim();
  if (!fingerprint) {
    return {
      ok: false,
      status: 400,
      code: "DFP_REQUIRED",
      error: "device_fingerprint required",
    };
  }

  normalizeLegacyEnt(entitlement);

  const seats = Math.max(Number(entitlement.seats || 1), 1);
  const isOrg =
    String(entitlement.licenseType || "").toLowerCase() === "organization" ||
    seats > 1;

  const aware = options.enabled ?? isSchemeAwareBindingEnabled();
  const productKey = String(options.productKey || "").trim().toLowerCase();
  const scheme = aware
    ? options.scheme || clientScheme({ productKey, fpVersion })
    : null;
  const client = aware ? String(options.client || "").trim() : "";
  const cleared = new Set([...(options.clearedInstallerRows || [])].map(String));

  // Provenance for a row this app now owns (new, migrated or adopted).
  function stampAppRow(row, at) {
    row.source = APP_SOURCE;
    row.scheme = scheme;
    if (client) row.client = client;
    row.appSeenAt = at;
  }

  // An app sign-in matched an existing row: remember it was app use.
  function markAppUse(row) {
    if (!aware) return;
    row.appSeenAt = new Date();
    if (!row.scheme) row.scheme = scheme;
    if (client && !row.client) row.client = client;
  }

  function newRowStamp() {
    if (!aware) return {};
    const stamp = { source: APP_SOURCE, scheme, appSeenAt: new Date() };
    if (client) stamp.client = client;
    return stamp;
  }

  // Helper: try to migrate an existing v1 device to the new v2 fingerprint.
  // Only runs when there is exactly one active v1 device (prevents
  // accidental swaps on org licenses).
  function tryMigrate(v2Fp) {
    if (fpVersion < 2) return false;

    const active = activeDevices(entitlement);
    const legacy = active.filter((d) => (d.fpVersion || 1) < 2);
    if (legacy.length !== 1) return false;

    const target = legacy[0];
    target.fingerprint = v2Fp;
    target.fpVersion = 2;
    target.lastSeenAt = new Date();
    // A migrated row is now this app's. Without the stamp a NAMED v1 row
    // would read as a Hub row once it is v2, and could be adopted away.
    if (aware) stampAppRow(target, target.lastSeenAt);
    // Update legacy top-level mirror so older code paths stay consistent
    entitlement.deviceFingerprint = v2Fp;
    return true;
  }

  // Convert a Hub row into this app's row (see installerRowCandidates).
  function tryAdoptInstallerRow(fp, { onlyFingerprint = null, rebindMirror = false } = {}) {
    if (!aware) return null;
    // The PC already has a row of its own; converting another would leave
    // two rows with one id. Leave the state alone.
    if (activeDevices(entitlement).some((d) => d.fingerprint === fp)) return null;

    let pool = installerRowCandidates(entitlement, { productKey, scheme, fingerprint: fp }).filter(
      (d) => cleared.has(String(d.fingerprint)),
    );
    if (onlyFingerprint) pool = pool.filter((d) => d.fingerprint === onlyFingerprint);
    if (!pool.length) return null;

    const target = pickAdoptionTarget(pool, options.deviceName);
    const now = new Date();
    const from = {
      fingerprint: String(target.fingerprint || ""),
      name: String(target.name || ""),
      lastSeenAt: target.lastSeenAt || null,
    };

    target.installerFingerprint = from.fingerprint;
    target.installerName = from.name;
    target.fingerprint = fp;
    target.fpVersion = Math.max(1, Number(fpVersion) || 1);
    target.name = "";
    target.adoptedAt = now;
    target.lastSeenAt = now;
    stampAppRow(target, now);

    const mirror = entitlement.deviceFingerprint;
    if (!mirror || mirror === from.fingerprint || rebindMirror) {
      entitlement.deviceFingerprint = fp;
    }
    return from;
  }

  function reject(status, code, error, holderRows) {
    const result = { ok: false, status, code, error, decision: "reject" };
    if (aware) {
      result.holder = describeHolders(holderRows, productKey);
      result.message = rejectionMessage({ code, holder: result.holder, seats, productKey });
    }
    return result;
  }

  if (isOrg) {
    const devices = activeDevices(entitlement);
    const existing = devices.find((device) => device.fingerprint === fingerprint);

    if (existing) {
      existing.lastSeenAt = new Date();
      if (fpVersion >= 2 && (existing.fpVersion || 1) < 2) existing.fpVersion = 2;
      markAppUse(existing);
      return { ok: true, changed: true, decision: "match" };
    }

    if (devices.length < seats) {
      entitlement.devices.push({
        fingerprint,
        name: "",
        boundAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
        fpVersion: Math.max(1, Number(fpVersion) || 1),
        ...newRowStamp(),
      });

      if (!entitlement.deviceFingerprint) entitlement.deviceFingerprint = fingerprint;
      if (!entitlement.deviceBoundAt) entitlement.deviceBoundAt = new Date();

      return { ok: true, changed: true, decision: "bind" };
    }

    // At seat limit: a Hub row that is not app use gives way first…
    const adoptedFrom = tryAdoptInstallerRow(fingerprint);
    if (adoptedFrom) {
      return { ok: true, changed: true, adopted: true, adoptedFrom, decision: "adopt" };
    }

    // …then the last chance: migrate a lone legacy device in-place.
    if (tryMigrate(fingerprint)) {
      return { ok: true, changed: true, migrated: true, decision: "migrate" };
    }

    return reject(
      403,
      "DEVICE_LIMIT_REACHED",
      "Device limit reached for this subscription.",
      activeDevices(entitlement),
    );
  }

  // Personal (single-seat) license
  if (entitlement.deviceFingerprint && entitlement.deviceFingerprint !== fingerprint) {
    if (!aware) {
      // Attempt seamless migration for the v1 → v2 transition.
      if (tryMigrate(fingerprint)) {
        return { ok: true, changed: true, migrated: true, decision: "migrate" };
      }
      return reject(
        403,
        "DEVICE_MISMATCH",
        "This subscription is already bound to another device.",
        [],
      );
    }

    const active = activeDevices(entitlement);
    const boundRow = active.find((d) => d.fingerprint === entitlement.deviceFingerprint);
    const ownRow =
      !boundRow && active.length === 1 && active[0].fingerprint === fingerprint ? active[0] : null;

    if (!boundRow && active.length === 0) {
      // The bound machine was freed (revoked from the account page or by an
      // admin) and nothing else holds the seat: bind this one below.
      entitlement.deviceFingerprint = fingerprint;
      entitlement.deviceBoundAt = new Date();
    } else if (ownRow) {
      // The bound machine was freed and the only active row is this PC's own.
      // The usual way here: /me/devices/revoke leaves the mirror on the
      // revoked id, then the Installer Hub on the new PC calls bind-device,
      // which adds the PC's row but keeps an already-set mirror
      // (routes/me.deployments.js). For every product that shares the Hub's
      // id (MEP, HERON, RateGen, …) the app then signs in with that row's id.
      // Point the mirror at it and match it below: no row is added, so the
      // seat count cannot grow, and any other PC now meets a live boundRow.
      // (Two or more active rows on a personal licence is legacy state; that
      // keeps the adopt / migrate / reject path below, as before.)
      entitlement.deviceFingerprint = fingerprint;
    } else {
      const adoptedFrom = tryAdoptInstallerRow(fingerprint, {
        onlyFingerprint: boundRow ? boundRow.fingerprint : null,
        rebindMirror: !boundRow,
      });
      if (adoptedFrom) {
        return { ok: true, changed: true, adopted: true, adoptedFrom, decision: "adopt" };
      }
      // Attempt seamless migration for the v1 → v2 transition.
      if (tryMigrate(fingerprint)) {
        return { ok: true, changed: true, migrated: true, decision: "migrate" };
      }
      return reject(
        403,
        "DEVICE_MISMATCH",
        "This subscription is already bound to another device.",
        boundRow ? [boundRow] : active,
      );
    }
  }

  if (!entitlement.deviceFingerprint) {
    entitlement.deviceFingerprint = fingerprint;
    entitlement.deviceBoundAt = new Date();
  }

  let decision = "match";
  const devices = activeDevices(entitlement);
  if (!devices.some((device) => device.fingerprint === fingerprint)) {
    entitlement.devices.push({
      fingerprint,
      name: "",
      boundAt: entitlement.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
      fpVersion: Math.max(1, Number(fpVersion) || 1),
      ...newRowStamp(),
    });
    decision = "bind";
  } else {
    const device = devices.find((item) => item.fingerprint === fingerprint);
    if (device) {
      device.lastSeenAt = new Date();
      if (fpVersion >= 2 && (device.fpVersion || 1) < 2) device.fpVersion = 2;
      markAppUse(device);
    }
  }

  return { ok: true, changed: true, decision };
}
