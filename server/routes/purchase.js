import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";

const router = express.Router();

// POST /purchase { productKey, months }
// Creates a PENDING purchase for admin review
router.post("/", requireAuth, async (req, res) => {
  const { productKey, months = 1 } = req.body || {};
  if (!productKey) {
    return res.status(400).json({ error: "productKey required" });
  }

  const p = await Purchase.create({
    userId: req.user._id,
    email: req.user.email,
    productKey,
    requestedMonths: Number(months) || 1,
    status: "pending",
  });

  return res.json({
    ok: true,
    purchase: p,
    message: "Purchase submitted and pending admin review.",
  });
});

export default router;
