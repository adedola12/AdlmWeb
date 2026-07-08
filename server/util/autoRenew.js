// server/util/autoRenew.js
// Auto-renewal engine. Runs daily from the cron in index.js.
//
// Design (card-authorization reuse, NOT Paystack Plans — pricing here is
// dynamic: months × seats, tier discounts, VAT):
//   1. Find entitlements with autoRenew=true expiring within RENEW_WINDOW_DAYS
//     (or expired < RENEW_GRACE_DAYS ago) on users with a stored reusable
//     Paystack card authorization.
//   2. Recompute the CURRENT price server-side (util/pricing.js — the same
//     rules as checkout) for the entitlement's seats × autoRenewMonths. NGN
//     only; stored historical prices are never trusted.
//   3. Create a pending Purchase (with our own reference) BEFORE charging, so
//     if the charge succeeds but our process dies, the ordinary Paystack
//     webhook completes crediting from the reference — money is never taken
//     without a record that can be fulfilled.
//   4. POST /transaction/charge_authorization. On success: mark paid
//     atomically (same guard as the webhook — whichever runs first credits)
//     and extend the entitlement via applyEntitlementsFromPurchase.
//   5. On decline: record the attempt on the entitlement and email the user
//     to renew manually. Max RENEW_MAX_ATTEMPTS attempts per expiry cycle,
//     at most one per day → "retry max 2x over 3 days" with daily cron.
import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";
import { Setting } from "../models/Setting.js";
import { sendMail } from "./mailer.js";
import { applyEntitlementsFromPurchase } from "./applyEntitlements.js";
import { autoEnrollFromPurchase } from "./autoEnroll.js";
import { toMoney, getEffectivePrices, computeRecurring } from "./pricing.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const RENEW_WINDOW_DAYS = Math.max(
  parseInt(process.env.RENEW_WINDOW_DAYS || "3", 10) || 3,
  1,
);
const RENEW_GRACE_DAYS = 3; // keep retrying this long past expiry
const RENEW_MAX_ATTEMPTS = 3; // initial attempt + 2 retries
const MIN_ATTEMPT_GAP_MS = 20 * 60 * 60 * 1000; // ~daily cron, with slack

const DAY_MS = 24 * 60 * 60 * 1000;

const WEB_URL =
  String(
    process.env.PUBLIC_WEB_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.PUBLIC_FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      "",
  ).trim() || "http://localhost:5173";

const fmtNaira = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

/* ---------------- job lock (same pattern as expiryNotifier) ---------------- */

async function acquireJobLock(lockId, ttlMinutes = 15) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const col = mongoose.connection.collection("job_locks");

  const upd = await col.findOneAndUpdate(
    {
      _id: lockId,
      $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
    },
    { $set: { expiresAt, lockedAt: now } },
    { returnDocument: "after" },
  );
  if (upd?.value) return true;

  try {
    await col.insertOne({ _id: lockId, expiresAt, lockedAt: now });
    return true;
  } catch {
    return false;
  }
}

async function releaseJobLock(lockId) {
  try {
    await mongoose.connection.collection("job_locks").deleteOne({ _id: lockId });
  } catch {
    // ignore
  }
}

/* ---------------- emails ---------------- */

function baseEmail(firstName, bodyHtml) {
  const name = String(firstName || "").trim() || "there";
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 10px 0">ADLM Subscription</h2>
      <p style="margin:0 0 12px 0">Hello ${name},</p>
      ${bodyHtml}
      <p style="margin:18px 0 0 0">Thank you,<br/>ADLM Studio</p>
    </div>
  `;
}

function btn(href, label, bg) {
  return `
    <a href="${href}"
       style="display:inline-block;padding:12px 16px;border-radius:10px;
              background:${bg};color:#ffffff;text-decoration:none;font-weight:600;
              margin-right:10px;margin-top:8px">${label}</a>
  `;
}

async function sendRenewalSuccessEmail({ user, productName, amount, expiresAt, reference }) {
  const html = baseEmail(
    user.firstName || user.username,
    `
      <p style="margin:0 0 10px 0">
        Your <b>${productName}</b> subscription was renewed automatically.
      </p>
      <p style="margin:0 0 6px 0;color:#334155">Amount charged: <b>${fmtNaira(amount)}</b></p>
      <p style="margin:0 0 6px 0;color:#334155">New expiry date: <b>${fmtDate(expiresAt)}</b></p>
      <p style="margin:0 0 14px 0;color:#64748b;font-size:13px">Payment reference: ${reference}</p>
      <div style="margin:10px 0 6px 0">
        ${btn(`${WEB_URL.replace(/\/+$/, "")}/dashboard`, "Open dashboard", "#0f172a")}
      </div>
      <p style="margin:10px 0 0 0;color:#475569;font-size:13px">
        You can turn auto-renewal off anytime from your profile's billing section.
      </p>
    `,
  );
  await sendMail({
    to: user.email,
    subject: `ADLM: ${productName} renewed — paid ${fmtNaira(amount)}`,
    html,
  });
}

async function sendRenewalFailedEmail({ user, productName, productKey, last4, reason, attempts, finalAttempt, expiresAt }) {
  const renewLink = `${WEB_URL.replace(/\/+$/, "")}/product/${encodeURIComponent(productKey)}`;
  const retryNote = finalAttempt
    ? `We won't retry automatically again for this billing period — please renew manually to keep your access.`
    : `We'll retry automatically tomorrow (attempt ${attempts} of ${RENEW_MAX_ATTEMPTS}).`;

  const html = baseEmail(
    user.firstName || user.username,
    `
      <p style="margin:0 0 10px 0">
        We tried to renew your <b>${productName}</b> subscription using your saved card
        ${last4 ? `ending in <b>${last4}</b>` : ""} but the charge didn't go through.
      </p>
      ${reason ? `<p style="margin:0 0 10px 0;color:#334155">Bank response: <b>${reason}</b></p>` : ""}
      <p style="margin:0 0 10px 0;color:#334155">Current expiry: <b>${fmtDate(expiresAt)}</b></p>
      <p style="margin:0 0 14px 0;color:#334155">${retryNote}</p>
      <div style="margin:10px 0 6px 0">
        ${btn(renewLink, "Renew manually", "#2563eb")}
        ${btn(`${WEB_URL.replace(/\/+$/, "")}/profile`, "Update card", "#0f172a")}
      </div>
    `,
  );
  await sendMail({
    to: user.email,
    subject: `ADLM: auto-renewal for ${productName} failed${finalAttempt ? " — action needed" : ""}`,
    html,
  });
}

/* ---------------- per-entitlement bookkeeping ---------------- */

// Writes attempt counters with a positional update instead of user.save() —
// applyEntitlementsFromPurchase re-fetches and saves the user mid-run, so a
// stale hydrated doc here would throw VersionError.
async function recordAttempt(userId, productKey, { error, cycleExpiryAt, resetFirst }) {
  const setOps = {
    "entitlements.$[e].renewal.lastAttemptAt": new Date(),
    "entitlements.$[e].renewal.lastError": String(error || ""),
    "entitlements.$[e].renewal.cycleExpiryAt": cycleExpiryAt || null,
  };
  if (resetFirst) setOps["entitlements.$[e].renewal.attempts"] = 1;

  await User.updateOne(
    { _id: userId },
    resetFirst
      ? { $set: setOps }
      : { $set: setOps, $inc: { "entitlements.$[e].renewal.attempts": 1 } },
    { arrayFilters: [{ "e.productKey": productKey }] },
  );
}

/* ---------------- charging one entitlement ---------------- */

async function chargeEntitlement({ user, ent, product, vatCfg, dryRun }) {
  const productKey = ent.productKey;
  const seats = Math.max(parseInt(ent.seats || 1, 10), 1);
  const months = Math.min(Math.max(parseInt(ent.autoRenewMonths || 1, 10), 1), 12);
  const isYearly = product.billingInterval === "yearly";
  const periods = isYearly ? 1 : months;

  // Current NGN price, exactly as checkout would compute it (fx unused for NGN).
  const eff = getEffectivePrices(product, "NGN", 1);
  const recurring = computeRecurring({
    p: product,
    eff,
    periods,
    seats,
    currency: "NGN",
    fx: 1,
  });
  if (!(recurring > 0)) {
    return { status: "skipped", reason: "no-price" };
  }

  const vatAmount =
    vatCfg.percent > 0 ? toMoney((recurring * vatCfg.percent) / 100, "NGN") : 0;
  const totalAmount = Math.round(recurring + vatAmount);
  const amountKobo = Math.round(totalAmount * 100);

  if (dryRun) {
    return { status: "would-charge", productKey, seats, months, totalAmount };
  }

  const reference = `ADLM-RENEW-${crypto.randomUUID()}`;

  // Purchase FIRST, charge second — if we die after Paystack debits, the
  // regular charge.success webhook finds this record by reference and credits.
  const purchase = await Purchase.create({
    userId: user._id,
    email: user.email,
    currency: "NGN",
    totalBeforeDiscount: recurring,
    vatPercent: vatCfg.percent,
    vatAmount,
    vatLabel: vatCfg.percent > 0 ? `${vatCfg.label} ${vatCfg.percent}%` : "",
    totalAmount,
    licenseType: ent.licenseType || "personal",
    organization:
      ent.licenseType === "organization" && ent.organizationName
        ? { name: ent.organizationName }
        : undefined,
    lines: [
      {
        productKey,
        name: product.name,
        billingInterval: product.billingInterval,
        qty: seats,
        periods,
        licenseType: ent.licenseType || "personal",
        organizationName: ent.organizationName || undefined,
        unit: isYearly ? eff.yearly : eff.monthly,
        install: 0,
        subtotal: recurring,
      },
    ],
    status: "pending",
    paystackRef: reference,
    isRenewal: true,
    autoRenewRequested: true, // keep the flag alive on the extended entitlement
  });

  let data;
  try {
    const psRes = await fetch(
      "https://api.paystack.co/transaction/charge_authorization",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: amountKobo,
          currency: "NGN",
          authorization_code: user.paymentMethod.authorizationCode,
          reference,
          metadata: {
            renewal: true,
            purchaseId: String(purchase._id),
            productKey,
          },
        }),
      },
    );
    data = await psRes.json().catch(() => ({}));
  } catch (e) {
    // Network failure — the charge MAY have gone through. Leave the purchase
    // pending (the webhook can still complete it) and count the attempt, but
    // don't email: "payment failed" would be wrong if the debit succeeded.
    return {
      status: "unknown",
      reason: `network: ${e?.message || e}`,
      reference,
    };
  }

  const chargeStatus = String(data?.data?.status || "");
  if (data?.status && chargeStatus === "success") {
    // Same atomic guard as the webhook — only one path credits.
    const updated = await Purchase.findOneAndUpdate(
      { _id: purchase._id, paid: { $ne: true } },
      {
        $set: {
          paid: true,
          status: "approved",
          "installation.entitlementsApplied": true,
          "installation.entitlementsAppliedAt": new Date(),
        },
      },
      { new: true },
    );

    if (updated) {
      try {
        await applyEntitlementsFromPurchase(updated);
        await autoEnrollFromPurchase(updated);
      } catch (e) {
        await Purchase.updateOne(
          { _id: updated._id },
          {
            $set: {
              "installation.entitlementsApplied": false,
              "installation.entitlementsAppliedAt": null,
            },
          },
        ).catch(() => {});
        throw e;
      }
    }

    return { status: "charged", reference, totalAmount };
  }

  // Declined (or still pending — treat as failure; if Paystack later fires
  // charge.success for this reference, the webhook credits it anyway).
  const reason =
    data?.data?.gateway_response || data?.message || "Charge was not successful";
  await Purchase.updateOne(
    { _id: purchase._id },
    { $set: { status: "rejected" } },
  ).catch(() => {});

  return { status: "failed", reason, reference };
}

/* ---------------- main entry ---------------- */

export async function runAutoRenewals({ dryRun = false, limit = 0 } = {}) {
  if (!PAYSTACK_SECRET) {
    return { ok: false, skipped: true, reason: "paystack-not-configured" };
  }

  const LOCK_ID = "auto_renewals_v1";
  const gotLock = await acquireJobLock(LOCK_ID, 15);
  if (!gotLock) return { ok: false, skipped: true, reason: "lock-held" };

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + RENEW_WINDOW_DAYS * DAY_MS);
    const graceStart = new Date(now.getTime() - RENEW_GRACE_DAYS * DAY_MS);

    // VAT config once per run — same policy as checkout (/purchase/cart).
    const settings = await Setting.findOne({ key: "global" }).lean();
    const vatEnabled =
      !!settings?.vatEnabled && !!settings?.vatApplyToPurchases;
    const vatCfg = {
      percent: vatEnabled
        ? Math.min(Math.max(Number(settings?.vatPercent || 0), 0), 100)
        : 0,
      label: settings?.vatLabel || "VAT",
    };

    // Product map keyed by lowercase key (entitlement keys are lowercased).
    const products = await Product.find({}).lean();
    const productByKey = new Map(
      products.map((p) => [String(p.key || "").toLowerCase(), p]),
    );

    const query = {
      disabled: { $ne: true },
      "paymentMethod.authorizationCode": { $exists: true, $nin: [null, ""] },
      entitlements: {
        $elemMatch: {
          autoRenew: true,
          expiresAt: { $ne: null, $lte: windowEnd, $gte: graceStart },
        },
      },
    };

    // "+path" alone keeps the default projection and just re-includes the
    // schema-hidden token (mixing it with an inclusion list is unreliable).
    const cursor = User.find(query)
      .select("+paymentMethod.authorizationCode")
      .batchSize(50)
      .cursor();

    const summary = {
      ok: true,
      dryRun,
      scannedUsers: 0,
      charged: 0,
      failed: 0,
      skipped: 0,
      wouldCharge: [],
      errors: 0,
    };

    for await (const user of cursor) {
      if (!user?.email || !user?.paymentMethod?.authorizationCode) continue;
      summary.scannedUsers += 1;

      for (const ent of user.entitlements || []) {
        if (ent?.autoRenew !== true) continue;

        const st = String(ent.status || "inactive").toLowerCase();
        if (st !== "active" && st !== "expired") continue;

        const exp = ent.expiresAt ? new Date(ent.expiresAt) : null;
        if (!exp || exp > windowEnd || exp < graceStart) continue;

        // Attempt bookkeeping is per expiry-cycle: counters recorded against
        // an older expiry don't block the next cycle.
        const sameCycle =
          ent.renewal?.cycleExpiryAt &&
          +new Date(ent.renewal.cycleExpiryAt) === +exp;
        const attempts = sameCycle ? ent.renewal?.attempts || 0 : 0;

        if (attempts >= RENEW_MAX_ATTEMPTS) {
          summary.skipped += 1;
          continue;
        }
        if (
          sameCycle &&
          ent.renewal?.lastAttemptAt &&
          now - new Date(ent.renewal.lastAttemptAt) < MIN_ATTEMPT_GAP_MS
        ) {
          summary.skipped += 1;
          continue;
        }

        const product = productByKey.get(
          String(ent.productKey || "").toLowerCase(),
        );
        if (!product) {
          summary.skipped += 1;
          continue;
        }

        try {
          const out = await chargeEntitlement({
            user,
            ent,
            product,
            vatCfg,
            dryRun,
          });

          if (out.status === "would-charge") {
            summary.wouldCharge.push(out);
          } else if (out.status === "charged") {
            summary.charged += 1;
            // applyEntitlements already reset the counters via the purchase
            // path; email is best-effort.
            const fresh = await User.findById(user._id)
              .select("entitlements")
              .lean();
            const freshEnt = (fresh?.entitlements || []).find(
              (e) => e.productKey === ent.productKey,
            );
            await sendRenewalSuccessEmail({
              user,
              productName: product.name || ent.productKey,
              amount: out.totalAmount,
              expiresAt: freshEnt?.expiresAt,
              reference: out.reference,
            }).catch((e) =>
              console.error("[auto-renew] success email failed:", e?.message),
            );
          } else if (out.status === "failed") {
            summary.failed += 1;
            const newAttempts = attempts + 1;
            await recordAttempt(user._id, ent.productKey, {
              error: out.reason,
              cycleExpiryAt: exp,
              resetFirst: !sameCycle,
            });
            await sendRenewalFailedEmail({
              user,
              productName: product.name || ent.productKey,
              productKey: ent.productKey,
              last4: user.paymentMethod?.last4 || "",
              reason: out.reason,
              attempts: newAttempts,
              finalAttempt: newAttempts >= RENEW_MAX_ATTEMPTS,
              expiresAt: exp,
            }).catch((e) =>
              console.error("[auto-renew] failure email failed:", e?.message),
            );
          } else if (out.status === "unknown") {
            summary.errors += 1;
            await recordAttempt(user._id, ent.productKey, {
              error: out.reason,
              cycleExpiryAt: exp,
              resetFirst: !sameCycle,
            });
          } else {
            summary.skipped += 1;
          }
        } catch (e) {
          summary.errors += 1;
          console.error(
            `[auto-renew] ${user.email} / ${ent.productKey} failed:`,
            e?.message || e,
          );
        }

        if (limit > 0 && summary.charged + summary.failed >= limit) {
          return summary;
        }
      }
    }

    return summary;
  } finally {
    await releaseJobLock(LOCK_ID);
  }
}
