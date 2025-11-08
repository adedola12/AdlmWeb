// server/util/applyEntitlements.js
import dayjs from "dayjs";
import { User } from "../models/User.js";

function addMonthsToEntitlement(userDoc, productKey, monthsToAdd) {
  const now = dayjs();
  let ent = (userDoc.entitlements || []).find(
    (e) => e.productKey === productKey
  );

  if (!ent) {
    ent = {
      productKey,
      status: "active",
      expiresAt: now.add(monthsToAdd, "month").toDate(),
    };
    userDoc.entitlements = [...(userDoc.entitlements || []), ent];
  } else {
    const base =
      ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
        ? dayjs(ent.expiresAt)
        : now;
    ent.status = "active";
    ent.expiresAt = base.add(monthsToAdd, "month").toDate();
  }
}

export async function applyEntitlementsFromPurchase(purchase) {
  const user = await User.findById(purchase.userId);
  if (!user) return;

  if (Array.isArray(purchase.lines) && purchase.lines.length > 0) {
    purchase.lines.forEach((ln) => {
      const months =
        ln.billingInterval === "yearly" ? (ln.qty || 0) * 12 : ln.qty || 0;
      if (months > 0) addMonthsToEntitlement(user, ln.productKey, months);
    });
  } else if (purchase.productKey && purchase.requestedMonths) {
    addMonthsToEntitlement(user, purchase.productKey, purchase.requestedMonths);
  }

  await user.save();
}
