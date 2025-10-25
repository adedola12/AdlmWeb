// server/util/autoEnroll.js
import { Product } from "../models/Product.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";

export async function autoEnrollFromPurchase(purchase) {
  // Find all product keys affected by the purchase:
  const productKeys = purchase.lines?.length
    ? purchase.lines.map((l) => l.productKey)
    : purchase.productKey
    ? [purchase.productKey]
    : [];

  if (!productKeys.length) return;

  const prods = await Product.find({
    key: { $in: productKeys },
    isCourse: true,
  }).lean();

  for (const p of prods) {
    if (!p.courseSku) continue;
    // idempotent create
    const exists = await CourseEnrollment.findOne({
      userId: purchase.userId,
      courseSku: p.courseSku,
    });
    if (!exists) {
      await CourseEnrollment.create({
        userId: purchase.userId,
        email: purchase.email,
        courseSku: p.courseSku,
        status: "active",
        completedModules: [],
      });
    }
  }
}
