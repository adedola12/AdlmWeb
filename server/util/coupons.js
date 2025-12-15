import dayjs from "dayjs";
import { Coupon } from "../models/Coupon.js";

export function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

export async function validateAndComputeDiscount({ code, currency, subtotal }) {
  const couponCode = normalizeCode(code);
  if (!couponCode) return { ok: true, coupon: null, discount: 0 };

  const c = await Coupon.findOne({ code: couponCode }).lean();
  if (!c) return { ok: false, error: "Invalid coupon code." };
  if (!c.isActive) return { ok: false, error: "Coupon is disabled." };

  const now = dayjs();
  if (c.startsAt && now.isBefore(dayjs(c.startsAt)))
    return { ok: false, error: "Coupon not active yet." };
  if (c.endsAt && now.isAfter(dayjs(c.endsAt)))
    return { ok: false, error: "Coupon has expired." };

  if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions)
    return { ok: false, error: "Coupon usage limit reached." };

  if (Number(subtotal || 0) < Number(c.minSubtotal || 0))
    return {
      ok: false,
      error: `Minimum subtotal is ${currency} ${Number(
        c.minSubtotal || 0
      ).toLocaleString()}.`,
    };

  let discount = 0;

  if (c.type === "percent") {
    const pct = Math.max(Math.min(Number(c.value || 0), 100), 0);
    discount = (Number(subtotal || 0) * pct) / 100;
  } else {
    // fixed
    // fixed coupon only applies if coupon currency matches checkout currency
    if (String(c.currency || "NGN") !== String(currency || "NGN")) {
      return { ok: false, error: `Coupon is only valid for ${c.currency}.` };
    }
    discount = Number(c.value || 0);
  }

  // never exceed subtotal
  discount = Math.min(discount, Number(subtotal || 0));
  // round 2dp for USD, integer-ish for NGN
  discount =
    currency === "USD"
      ? Math.round((discount + Number.EPSILON) * 100) / 100
      : Math.round(discount);

  return {
    ok: true,
    coupon: c,
    discount,
  };
}
