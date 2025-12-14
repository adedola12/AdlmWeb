import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";

const router = express.Router();
router.use(requireAuth);

// GET /me/orders
router.get("/", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

  const orders = await Purchase.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select(
      "currency totalAmount lines status paid paystackRef decidedBy decidedAt createdAt updatedAt"
    )
    .lean();

  res.json({ items: orders });
});

export default router;
