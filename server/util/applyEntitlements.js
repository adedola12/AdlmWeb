// server/util/applyEntitlements.js
import { User } from "../models/User.js";

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function extendExpiry(currentExpiresAt, months) {
  const now = new Date();
  const base =
    currentExpiresAt && new Date(currentExpiresAt) > now
      ? new Date(currentExpiresAt)
      : now;
  return addMonths(base, months);
}

function normalizeLegacy(ent) {
  if (!ent.seats || ent.seats < 1) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];
  if (ent.devices.length === 0 && ent.deviceFingerprint) {
    ent.devices.push({
      fingerprint: ent.deviceFingerprint,
      name: "",
      boundAt: ent.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }
}

// ✅ seats come from line.qty
// ✅ months come from line.periods * intervalMonths
export async function applyEntitlementsFromPurchase(purchase) {
  const user = await User.findById(purchase.userId);
  if (!user) throw new Error("User not found for purchase");

  const map = new Map();
  const lines = Array.isArray(purchase.lines) ? purchase.lines : [];

  for (const line of lines) {
    const productKey = String(line.productKey || "").trim();
    if (!productKey) continue;

    const seats = Math.max(parseInt(line.qty || 1, 10), 1);
    const periods = Math.max(parseInt(line.periods || 1, 10), 1);
    const intervalMonths =
      String(line.billingInterval || "monthly") === "yearly" ? 12 : 1;

    const months = periods * intervalMonths;

    const prev = map.get(productKey) || { months: 0, seats: 1 };
    map.set(productKey, {
      // Sum durations for duplicate lines of the same product — each line was
      // separately priced and paid (matches admin normalizeGrants behavior).
      months: prev.months + months,
      seats: Math.max(prev.seats, seats),
    });
  }

  // Legacy fallback (old purchases)
  if (!map.size && purchase.productKey) {
    const pk = String(purchase.productKey).trim();
    const months = Math.max(
      parseInt(purchase.approvedMonths || purchase.requestedMonths || 1, 10),
      1,
    );
    map.set(pk, { months, seats: 1 });
  }

  const wantsAutoRenew = purchase.autoRenewRequested === true;

  for (const [productKey, { months, seats }] of map.entries()) {
    let ent = user.entitlements.find((e) => e.productKey === productKey);

    if (!ent) {
      user.entitlements.push({
        productKey,
        status: "active",
        seats,
        expiresAt: extendExpiry(null, months),
        devices: [],
      });
      ent = user.entitlements[user.entitlements.length - 1];
    } else {
      normalizeLegacy(ent);
      ent.status = "active";
      ent.expiresAt = extendExpiry(ent.expiresAt, months);
      ent.seats = Math.max(parseInt(ent.seats || 1, 10), seats);
    }

    if (wantsAutoRenew) {
      ent.autoRenew = true;
      // Renewal term = what was just bought, capped at a year. The cron
      // recomputes the actual price from current product pricing.
      ent.autoRenewMonths = Math.min(Math.max(months, 1), 12);
    }

    // New expiry ⇒ new renewal cycle: clear failed-attempt bookkeeping so the
    // cron gets a fresh set of retries next time the product nears expiry.
    ent.renewal = {
      attempts: 0,
      lastAttemptAt: null,
      lastError: "",
      cycleExpiryAt: ent.expiresAt,
    };
  }

  await user.save();
  return { ok: true };
}
