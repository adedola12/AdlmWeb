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

router.get("/entitlements", requireAuth, async (req, res) => {
  const ent = (req.user.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
  }));
  res.json(ent); // always return JSON (at least [])
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

// current profile
router.get("/me/profile", requireAuth, async (req, res) => {
  const { email, username, avatarUrl, role } = req.user;
  return res.json({ email, username, avatarUrl, role });
});

// update username / avatar
router.post("/me/profile", requireAuth, async (req, res) => {
  const { username, avatarUrl } = req.body || {};

  // unique username check (if provided)
  if (username) {
    const exists = await User.findOne({ username, _id: { $ne: req.user._id } });
    if (exists) return res.status(409).json({ error: "Username already taken" });
  }

  if (username !== undefined) req.user.username = username;
  if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;
  await req.user.save();

  const { email, role } = req.user;
  return res.json({ user: { email, username: req.user.username, avatarUrl: req.user.avatarUrl, role } });
});


export default router;
