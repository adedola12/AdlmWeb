import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";

const router = express.Router();
router.use(requireAuth);

// GET /me/orders?page=1&limit=10
router.get("/", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "10", 10), 1),
    50
  );

  const filter = { userId: req.user._id };

  const [total, items] = await Promise.all([
    Purchase.countDocuments(filter),
    Purchase.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        "currency totalAmount lines status paid paystackRef decidedBy decidedAt createdAt updatedAt"
      )
      .lean(),
  ]);

  const pages = Math.max(Math.ceil(total / limit), 1);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasPrev: page > 1,
      hasNext: page < pages,
    },
  });
});

export default router;
