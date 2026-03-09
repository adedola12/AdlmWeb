import { Product } from "../models/Product.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";

function addMonths(date, months) {
  const out = new Date(date);
  out.setMonth(out.getMonth() + Math.max(Number(months || 0), 0));
  return out;
}

function extendExpiry(currentExpiresAt, months) {
  const ttlMonths = Math.max(Number(months || 0), 0);
  if (!ttlMonths) return currentExpiresAt || null;

  const now = new Date();
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && !Number.isNaN(current.getTime()) && current > now ? current : now;
  return addMonths(base, ttlMonths);
}

function monthsForProduct(purchase, productKey) {
  const lines = Array.isArray(purchase?.lines) ? purchase.lines : [];
  const matched = lines.filter(
    (line) => String(line?.productKey || "").trim() === String(productKey || "").trim(),
  );

  if (matched.length) {
    return matched.reduce((maxMonths, line) => {
      const periods = Math.max(parseInt(line?.periods ?? 1, 10) || 1, 1);
      const intervalMonths = String(line?.billingInterval || "monthly").toLowerCase() === "yearly" ? 12 : 1;
      return Math.max(maxMonths, periods * intervalMonths);
    }, 0);
  }

  return Math.max(
    parseInt(purchase?.approvedMonths ?? purchase?.requestedMonths ?? 1, 10) || 1,
    1,
  );
}

export async function autoEnrollFromPurchase(purchase) {
  const productKeys = purchase?.lines?.length
    ? purchase.lines.map((line) => line.productKey)
    : purchase?.productKey
      ? [purchase.productKey]
      : [];

  const keys = [...new Set(productKeys.filter(Boolean))];
  if (!keys.length) return;

  const products = await Product.find({
    key: { $in: keys },
    isCourse: true,
  }).lean();

  for (const product of products) {
    if (!product?.courseSku) continue;

    const months = monthsForProduct(purchase, product.key);
    const now = new Date();

    const existing = await CourseEnrollment.findOne({
      userId: purchase.userId,
      courseSku: product.courseSku,
    });

    if (!existing) {
      await CourseEnrollment.create({
        userId: purchase.userId,
        email: purchase.email,
        courseSku: product.courseSku,
        status: "active",
        completedModules: [],
        accessStartedAt: now,
        accessExpiresAt: extendExpiry(null, months),
      });
      continue;
    }

    let changed = false;

    if (!existing.email && purchase.email) {
      existing.email = purchase.email;
      changed = true;
    }

    if (!existing.accessStartedAt) {
      existing.accessStartedAt = existing.createdAt || now;
      changed = true;
    }

    const nextExpiry = extendExpiry(existing.accessExpiresAt, months);
    const prevExpiryMs = existing.accessExpiresAt
      ? new Date(existing.accessExpiresAt).getTime()
      : 0;
    const nextExpiryMs = nextExpiry ? new Date(nextExpiry).getTime() : 0;

    if (nextExpiryMs && nextExpiryMs !== prevExpiryMs) {
      existing.accessExpiresAt = nextExpiry;
      changed = true;
    }

    if (changed) {
      await existing.save();
    }
  }
}
