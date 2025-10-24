import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";

export async function autoEnrollFromPurchase(purchase) {
  // purchase.lines: [{ productKey, ... }]
  const productKeys = [
    ...new Set((purchase.lines || []).map((l) => l.productKey)),
  ];
  const products = await Product.find({ key: { $in: productKeys } }).lean();

  for (const line of purchase.lines || []) {
    const p = products.find((x) => x.key === line.productKey);
    if (!p || !p.isCourse || !p.courseSku) continue;

    const course = await PaidCourse.findOne({ sku: p.courseSku }).lean();
    if (!course) continue;

    // create enrollment if none
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
