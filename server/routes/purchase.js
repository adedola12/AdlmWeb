import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";

// This simulates a purchase (in production, handle payment provider webhooks)
const router = express.Router();

// POST /purchase { productKey, months }
router.post("/", requireAuth, async (req, res) => {
  const { productKey, months = 1 } = req.body || {};
  if (!productKey)
    return res.status(400).json({ error: "productKey required" });

  const now = dayjs();
  let ent = req.user.entitlements.find((e) => e.productKey === productKey);
  if (!ent) {
    ent = {
      productKey,
      status: "active",
      expiresAt: now.add(months, "month").toDate(),
    };
    req.user.entitlements.push(ent);
  } else {
    // extend from current expiry if still active, else from now
    const base =
      ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
        ? dayjs(ent.expiresAt)
        : now;
    ent.status = "active";
    ent.expiresAt = base.add(months, "month").toDate();
  }
  await req.user.save();
  return res.json({ ok: true, entitlements: req.user.entitlements });
});

export default router;
