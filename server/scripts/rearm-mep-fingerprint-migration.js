// server/scripts/rearm-mep-fingerprint-migration.js
//
// Repairs seat records poisoned by the MEP plugin's fingerprint mismatch.
//
// THE DEFECT (client side, fixed in ADLMRvtMEPPlugin SignInViewModel.cs):
//   AuthClient advertised "x-adlm-fp-version: 2" (read from
//   Helper.DeviceFingerprint.FingerprintVersion) while SignInViewModel wired
//   DeviceFingerprintProvider to the LEGACY ADLM.Auth.DeviceFingerprint —
//   the MAC-based v1 algorithm. So every MEP sign-in sent a v1 hash under a
//   v2 banner.
//
// WHY THAT CORRUPTS DATA:
//   enforceDeviceBinding() in routes/auth.js (and the equivalent in
//   routes/me.deployments.js) contains:
//       if (fpVersion >= 2 && (existing.fpVersion || 1) < 2) existing.fpVersion = 2;
//   A returning MEP user matched their stored v1 fingerprint, so the server
//   stamped fpVersion=2 onto a row whose value is still a v1 hash. That
//   silently closes the v1→v2 migration path for that entitlement, because
//   tryMigrate() only fires when it finds exactly one device with
//   (fpVersion || 1) < 2. Once the corrected MEP build starts sending the
//   real hardware-bound hash, those users would hit DEVICE_MISMATCH / seat
//   limit with no way back.
//
// THE REPAIR:
//   Reset fpVersion to 1 on active devices of every `mep` entitlement. This is
//   safe whichever way the row actually is, which is the point — we cannot
//   tell a v1 hash from a v2 hash by inspection (both are 64 hex chars), and
//   we do not need to:
//
//     * Row is really v1 (mislabelled)  -> tryMigrate() is re-armed. The next
//       sign-in from the fixed client rewrites the fingerprint in place and
//       stamps fpVersion=2. User never notices.
//     * Row is really v2 (bound by the Installer Hub, which always sent the
//       hardware-bound value) -> the fixed MEP client computes the SAME hash,
//       so it matches `existing` by fingerprint and the server re-stamps
//       fpVersion=2 on the spot. Also self-healing, also invisible.
//
//   Either way the next sign-in restores the correct state. Nothing is
//   unbound, no seat is freed, no user is logged out.
//
// WHAT IT DELIBERATELY WILL NOT DO:
//   A 1-seat entitlement carrying TWO active devices (typically a Hub-bound
//   v2 plus a plugin-bound v1) cannot be auto-migrated — tryMigrate() bails
//   when legacy.length !== 1, by design, so it can never swap the wrong seat.
//   Those accounts are ALREADY over-committed today and are reported under
//   "needs manual attention" for an admin to revoke the stale device. This
//   script does not revoke anything.
//
// Usage:
//   node scripts/rearm-mep-fingerprint-migration.js                # dry run (default)
//   node scripts/rearm-mep-fingerprint-migration.js --apply        # write
//   node scripts/rearm-mep-fingerprint-migration.js --product=mep  # default; repeat for others
//
// Only `mep` is affected: Heron, QUIV, RateGen and the Hub all resolve
// DeviceFingerprintProvider to their v2 implementation, so their header and
// their payload have always agreed.

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { User } from "../models/User.js";

const APPLY = process.argv.includes("--apply");

const productArg = process.argv.find((a) => a.startsWith("--product="));
const PRODUCT_KEY = (productArg ? productArg.split("=")[1] : "mep")
  .trim()
  .toLowerCase();

const short = (fp) => (fp ? `${String(fp).slice(0, 12)}…` : "(none)");
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

async function main() {
  await connectDB();

  const users = await User.find({ "entitlements.productKey": PRODUCT_KEY });

  let scanned = 0;
  let resetDevices = 0;
  let touchedUsers = 0;
  const manual = [];

  for (const user of users) {
    const ents = (user.entitlements || []).filter(
      (e) => String(e.productKey || "").toLowerCase() === PRODUCT_KEY,
    );

    let dirty = false;

    for (const ent of ents) {
      const active = (ent.devices || []).filter((d) => !d.revokedAt);
      const seats = Math.max(Number(ent.seats || 1), 1);
      scanned += active.length;

      const willReset = active.filter((d) => (d.fpVersion || 1) >= 2);

      if (willReset.length) {
        console.log(
          `${user.email || user._id}  seats=${seats} active=${active.length}`,
        );
        for (const d of willReset) {
          console.log(
            `    reset fpVersion ${d.fpVersion} -> 1   ${short(d.fingerprint)}` +
              `  bound=${day(d.boundAt)} seen=${day(d.lastSeenAt)}` +
              `  ${d.name || ""}`,
          );
          d.fpVersion = 1;
          resetDevices += 1;
          dirty = true;
        }
      }

      // Over-committed, or more than one legacy device: tryMigrate() cannot
      // fire for these even after the reset. Flag for an admin.
      if (active.length > 1 && active.length >= seats) {
        manual.push({
          email: user.email || String(user._id),
          seats,
          devices: active.map(
            (d) => `${short(d.fingerprint)}(seen ${day(d.lastSeenAt)})`,
          ),
        });
      }
    }

    if (dirty) {
      touchedUsers += 1;
      if (APPLY) await user.save();
    }
  }

  console.log("\n─────────────────────────────────────────────");
  console.log(`product            : ${PRODUCT_KEY}`);
  console.log(`users with product : ${users.length}`);
  console.log(`active devices     : ${scanned}`);
  console.log(`devices reset to v1: ${resetDevices} (across ${touchedUsers} users)`);

  if (manual.length) {
    console.log(
      `\n${manual.length} account(s) need manual attention — more active devices than\n` +
        `the migration can resolve on its own. Revoke the stale device in Admin\n` +
        `(or raise seats) or these users will hit the seat limit on next sign-in:`,
    );
    for (const m of manual) {
      console.log(`  ${m.email}  seats=${m.seats}  ${m.devices.join("  ")}`);
    }
  } else {
    console.log("\nNo accounts need manual attention.");
  }

  console.log(
    APPLY
      ? "\nAPPLIED. Users migrate transparently on their next MEP sign-in."
      : "\nDRY RUN — nothing written. Re-run with --apply to commit.",
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
