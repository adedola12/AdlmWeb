// server/scripts/reconcile-entitlement-durations.js
//
// One-off reconciliation for the "periods ignored on hydrated docs" bug:
// buildGrantsFromPurchase used hasOwnProperty("periods"), which is always
// false on hydrated Mongoose documents, so approvals of cart purchases staged
// and applied `intervalMonths` (1 month for monthly products) instead of the
// purchased periods × interval. This script finds affected approved purchases
// and credits users with the months they paid for but never received.
//
// Usage:
//   node scripts/reconcile-entitlement-durations.js             # dry run (default)
//   node scripts/reconcile-entitlement-durations.js --apply     # write everything
//   node scripts/reconcile-entitlement-durations.js --baseline  # write everything
//       EXCEPT entitlement extensions — use when current customer expiry
//       dates have been manually verified/corrected and must not change.
//       Still restages pending grants, backfills paystack applied flags, and
//       stamps purchases reconciled so a later --apply won't touch them.
//
// What it does per approved, line-based purchase (skips ones already marked
// installation.durationReconciledAt):
//   - Paystack-paid purchases were credited correctly by
//     applyEntitlementsFromPurchase (it reads periods directly); those only
//     get installation.entitlementsApplied backfilled so a later "mark
//     installation complete" can't double-credit them.
//   - Otherwise, compares the CORRECT grants (fixed logic on the lean doc)
//     with what the buggy code applied (simulated by stripping `periods`
//     before the same grant builder, or the stored staged grants):
//       · entitlements already applied → extends the user's entitlement
//         expiry by the missing months per product
//       · entitlements not yet applied → restages the corrected grants so the
//         installation-complete flow applies the right duration
//   - Negative deltas (over-credit) are reported but NEVER auto-shrunk.
//
// Legacy purchases without lines are unaffected by the bug and skipped.

import "dotenv/config";
import mongoose from "mongoose";
import dayjs from "dayjs";
import { connectDB } from "../db.js";
import { Purchase } from "../models/Purchase.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { buildGrantsFromPurchase } from "../routes/admin.js";

const BASELINE = process.argv.includes("--baseline");
const APPLY = process.argv.includes("--apply") && !BASELINE;
// WRITE covers the non-destructive bookkeeping shared by both modes:
// restaging pending grants, paystack backfills, reconciled stamps.
const WRITE = APPLY || BASELINE;

// Reproduce the buggy grant math: on hydrated docs hasOwnProperty("periods")
// was false for every line, which is equivalent to the lines having no
// `periods` key at all.
function stripPeriods(purchaseLean) {
  return {
    ...purchaseLean,
    lines: (purchaseLean.lines || []).map((ln) => {
      const { periods, ...rest } = ln;
      return rest;
    }),
  };
}

const grantMap = (grants) => new Map(grants.map((g) => [g.productKey, g]));

async function run() {
  await connectDB(process.env.MONGO_URI);

  const purchases = await Purchase.find({
    status: "approved",
    "lines.0": { $exists: true },
  })
    .sort({ decidedAt: 1, createdAt: 1 })
    .lean();

  const courseByKey = new Map();
  async function isCourse(key) {
    if (!courseByKey.has(key)) {
      const prod = await Product.findOne({ key }).select("isCourse").lean();
      courseByKey.set(key, !!prod?.isCourse);
    }
    return courseByKey.get(key);
  }

  const now = new Date();
  let scanned = 0;
  let skippedReconciled = 0;
  let paystackBackfills = 0;
  let restaged = 0;
  let extended = 0;
  let overCredits = 0;
  let missingEnts = 0;

  for (const p of purchases) {
    scanned++;
    const id = String(p._id);
    const inst = p.installation || {};

    if (inst.durationReconciledAt) {
      skippedReconciled++;
      continue;
    }

    // ── Paystack-credited purchases: durations were correct; only backfill
    //    the applied flag so installation-complete can't double-credit. ──
    if (p.paid && p.paystackRef) {
      if (inst.entitlementsApplied !== true) {
        paystackBackfills++;
        console.log(
          `[backfill] ${id} (${p.email}): paystack-credited, setting entitlementsApplied=true`,
        );
        if (WRITE) {
          await Purchase.collection.updateOne(
            { _id: p._id },
            {
              $set: {
                "installation.entitlementsApplied": true,
                "installation.entitlementsAppliedAt": p.updatedAt || now,
                "installation.durationReconciledAt": now,
              },
            },
          );
        }
      }
      continue;
    }

    const correct = buildGrantsFromPurchase(p, 0);
    const buggy = grantMap(buildGrantsFromPurchase(stripPeriods(p), 0));
    const stored = grantMap(
      Array.isArray(inst.entitlementGrants) ? inst.entitlementGrants : [],
    );
    const applied = inst.entitlementsApplied === true;

    const correctNonCourse = [];
    const deltas = []; // { productKey, delta, correctMonths, appliedMonths }

    for (const g of correct) {
      const course = await isCourse(g.productKey);
      if (!course) correctNonCourse.push(g);

      // What did the buggy code actually add to user.entitlements?
      //  - course products: added at approve time with the buggy months
      //  - non-course: added at install-complete from the staged grants
      //    (themselves the buggy output), only if entitlementsApplied
      let appliedMonths = null;
      if (course) {
        appliedMonths = buggy.get(g.productKey)?.months ?? 0;
      } else if (applied) {
        appliedMonths =
          stored.get(g.productKey)?.months ??
          buggy.get(g.productKey)?.months ??
          0;
      }

      if (appliedMonths != null) {
        const delta = g.months - appliedMonths;
        if (delta !== 0) {
          deltas.push({
            productKey: g.productKey,
            delta,
            correctMonths: g.months,
            appliedMonths,
          });
        }
      }
    }

    // ── Restage corrected grants when install-complete hasn't applied yet ──
    const storedNonCourseWrong =
      !applied &&
      correctNonCourse.some(
        (g) => (stored.get(g.productKey)?.months ?? 0) !== g.months,
      );

    if (storedNonCourseWrong) {
      restaged++;
      const summary = correctNonCourse
        .map((g) => `${g.productKey}=${g.months}mo`)
        .join(", ");
      console.log(`[restage]  ${id} (${p.email}): staged grants → ${summary}`);
      if (WRITE) {
        await Purchase.collection.updateOne(
          { _id: p._id },
          {
            $set: {
              "installation.entitlementGrants": correctNonCourse.map((g) => ({
                productKey: g.productKey,
                months: g.months,
                seats: g.seats,
                licenseType: g.licenseType,
                organizationName: g.organizationName || undefined,
              })),
            },
          },
        );
      }
    }

    // ── Extend user entitlements by the missing months ──
    const positive = deltas.filter((d) => d.delta > 0);
    const negative = deltas.filter((d) => d.delta < 0);

    for (const d of negative) {
      overCredits++;
      console.log(
        `[REVIEW]   ${id} (${p.email}): ${d.productKey} was OVER-credited ` +
          `(applied ${d.appliedMonths}mo, purchased ${d.correctMonths}mo) — not auto-shrunk, review manually`,
      );
    }

    if (positive.length && BASELINE) {
      // Current expiry dates were manually verified as correct — record the
      // deltas for the log but leave user entitlements untouched.
      for (const d of positive) {
        console.log(
          `[baseline] ${id} (${p.email}): ${d.productKey} delta +${d.delta}mo ` +
            `NOT applied (current expiry verified manually)`,
        );
      }
    } else if (positive.length) {
      const user = await User.findById(p.userId);
      if (!user) {
        console.log(`[SKIP]     ${id}: user ${p.userId} not found`);
        continue;
      }

      let changed = false;
      for (const d of positive) {
        const ent = (user.entitlements || []).find(
          (e) => e.productKey === d.productKey,
        );
        if (!ent) {
          missingEnts++;
          console.log(
            `[REVIEW]   ${id} (${p.email}): no entitlement for ${d.productKey} ` +
              `to extend by ${d.delta}mo — review manually`,
          );
          continue;
        }

        const base = ent.expiresAt ? dayjs(ent.expiresAt) : dayjs(now);
        const next = base.add(d.delta, "month");
        extended++;
        changed = true;
        console.log(
          `[extend]   ${id} (${p.email}): ${d.productKey} +${d.delta}mo ` +
            `(applied ${d.appliedMonths}mo of ${d.correctMonths}mo purchased) ` +
            `expiry ${base.format("YYYY-MM-DD")} → ${next.format("YYYY-MM-DD")}`,
        );
        if (APPLY) {
          ent.expiresAt = next.toDate();
          if (next.isAfter(dayjs())) ent.status = "active";
        }
      }

      if (APPLY && changed) {
        user.refreshVersion = (user.refreshVersion || 0) + 1;
        await user.save();
      }
    }

    if (WRITE && (storedNonCourseWrong || positive.length || deltas.length)) {
      await Purchase.collection.updateOne(
        { _id: p._id },
        { $set: { "installation.durationReconciledAt": now } },
      );
    }

    // Toggle-path zombies: marked complete but entitlements never applied.
    if (inst.status === "complete" && !applied) {
      console.log(
        `[REVIEW]   ${id} (${p.email}): installation is "complete" but entitlementsApplied=false — ` +
          `re-run POST /admin/installations/${id}/complete to apply the (now corrected) grants`,
      );
    }
  }

  console.log("");
  const mode = APPLY
    ? "APPLY (changes written)"
    : BASELINE
      ? "BASELINE (restage/backfill/stamp written; entitlement expiries untouched)"
      : "DRY RUN (no changes written — pass --apply or --baseline to write)";
  console.log(`Mode:                ${mode}`);
  console.log(`Purchases scanned:   ${scanned}`);
  console.log(`Already reconciled:  ${skippedReconciled}`);
  console.log(`Paystack backfills:  ${paystackBackfills}`);
  console.log(`Grants restaged:     ${restaged}`);
  console.log(`Entitlements extended: ${extended}`);
  console.log(`Over-credits (manual review): ${overCredits}`);
  console.log(`Missing entitlements (manual review): ${missingEnts}`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
