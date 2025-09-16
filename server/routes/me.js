import express from "express";
import { requireAuth } from "../middleware/auth.js";
import dayjs from "dayjs";

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  const { email, role, entitlements } = req.user;
  return res.json({ email, role, entitlements });
});

router.get("/me/entitlements", requireAuth, async (req, res) => {
  return res.json(req.user.entitlements || []);
});

router.get("/me/summary", requireAuth, async (req, res) => {
  const ent = (req.user.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt,
    isExpired: e.expiresAt ? dayjs(e.expiresAt).isBefore(dayjs()) : true,
  }));
  return res.json({ email: req.user.email, entitlements: ent });
});

export default router;
