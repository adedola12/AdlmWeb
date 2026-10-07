// server/util/deviceAppEvidence.js
//
// Before a sign-in adopts an Installer Hub device row (util/deviceBinding.js),
// rule out that an app has been using that row's id.
//
// Why a lookup is needed at all: the RevitPluginArch2026 QUIV lineage signs in
// to "revit" with the SAME hw2 id the Hub uses, and the Hub (bind-device, after
// each install/update) names the row it matches. A row written before device
// rows carried provenance therefore looks identical whether only the Hub wrote
// it or an R26 user signs in on it every day. Rows stamped from now on carry
// appSeenAt; for older ones, these are the records that would show app use:
//
//   UsageSession   /usage/heartbeat: productKey + deviceFingerprint
//   TakeoffSession /telemetry/takeoff: product QUIV + seatId, which the R26
//                  lineage fills with its hw2 id (HardwareFingerprint.Get())
//
// What this does NOT cover today. The shipped R26 build (RevitPluginArch2026
// master, c25f969) sends neither record: it has no /usage/heartbeat call, and
// its takeoff telemetry (TakeoffTelemetryService) exists only on the unmerged
// branch feat/takeoff-time-log. Until that build ships, neither lookup can
// match an R26 row, and the ONLY thing that protects an R26 row written
// before this deploy is an interactive R26 sign-in after it (/auth/login
// stamps appSeenAt on the row it matches, util/deviceBinding.js). Remaining
// risk: any R26 row that has not had an interactive R26 sign-in since deploy
// can be adopted, once, by a shipped-QUIV (mgu2) sign-in on the same licence.
// The window is probably short, as the shipped R26 build appears to sign in
// interactively every Revit session (its cached licence token is never read
// back and its cookie jar is in memory). The lookups stay: they are cheap,
// fail closed, and start protecting R26 rows once a build that sends them
// ships.
//
// Fail closed: if the lookup errors, nothing is cleared and nothing is
// adopted, which is exactly the behaviour before this change.

import { UsageSession } from "../models/UsageSession.js";
import { TakeoffSession } from "../models/TakeoffSession.js";

const variants = (fp) => {
  const s = String(fp || "").trim().slice(0, 64);
  return s ? [s, s.toLowerCase(), s.toUpperCase()] : [];
};

/** The subset of `fingerprints` some app has been seen using (lowercased). */
export async function fingerprintsSeenInApps({ userId, productKey, fingerprints }) {
  const ids = [...new Set((fingerprints || []).flatMap(variants))];
  if (!ids.length || !userId) return new Set();

  const [usage, takeoff] = await Promise.all([
    UsageSession.distinct("deviceFingerprint", {
      userId,
      productKey: String(productKey || "").trim().toLowerCase(),
      deviceFingerprint: { $in: ids },
    }),
    TakeoffSession.distinct("seatId", {
      userId,
      product: "QUIV",
      seatId: { $in: ids },
    }),
  ]);

  return new Set([...(usage || []), ...(takeoff || [])].map((v) => String(v).toLowerCase()));
}

/**
 * The candidate Hub rows (by fingerprint) with no sign of app use, as the
 * `clearedInstallerRows` option of enforceDeviceBinding. Never throws.
 */
export async function clearInstallerRowsForAdoption({ userId, productKey, fingerprints, onError }) {
  const list = (fingerprints || []).map(String).filter(Boolean);
  if (!list.length) return new Set();
  try {
    const used = await fingerprintsSeenInApps({ userId, productKey, fingerprints: list });
    return new Set(list.filter((fp) => !used.has(fp.slice(0, 64).toLowerCase())));
  } catch (err) {
    onError?.(err);
    return new Set();
  }
}
