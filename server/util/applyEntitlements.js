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
      months: Math.max(prev.months, months), // safe default for renewals
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
      continue;
    }

    normalizeLegacy(ent);
    ent.status = "active";
    ent.expiresAt = extendExpiry(ent.expiresAt, months);
    ent.seats = Math.max(parseInt(ent.seats || 1, 10), seats);
  }

  await user.save();
  return { ok: true };
}
