import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = express.Router();

// Admin: list users
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const list = await User.find(
    {},
    { email: 1, role: 1, disabled: 1, entitlements: 1, createdAt: 1 }
  ).sort({ createdAt: -1 });
  return res.json(list);
});

// Admin: set/extend entitlement
// body: { email, productKey, months, status }
router.post(
  "/users/entitlement",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { email, productKey, months = 0, status } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });
    let ent = u.entitlements.find((e) => e.productKey === productKey);
    const now = dayjs();

    if (!ent) {
      ent = {
        productKey,
        status: status || "active",
        expiresAt: months
          ? now.add(months, "month").toDate()
          : now.add(1, "month").toDate(),
      };
      u.entitlements.push(ent);
    } else {
      if (typeof status === "string") ent.status = status;
      if (months > 0) {
        const base =
          ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
            ? dayjs(ent.expiresAt)
            : now;
        ent.expiresAt = base.add(months, "month").toDate();
      }
    }
    await u.save();
    return res.json({ ok: true, entitlements: u.entitlements });
  }
);

// Admin: disable/enable user
router.post("/users/disable", requireAuth, requireAdmin, async (req, res) => {
  const { email, disabled } = req.body || {};
  const u = await User.findOne({ email });
  if (!u) return res.status(404).json({ error: "User not found" });
  u.disabled = !!disabled;
  await u.save();
  return res.json({ ok: true, disabled: u.disabled });
});

export default router;
