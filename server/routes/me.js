import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js"; // <-- needed for username checks

const router = express.Router();

/**
 * Base path for this router is /me
 * So:
 *   GET  /me              -> router.get("/")
 *   GET  /me/entitlements -> router.get("/entitlements")
 *   GET  /me/summary      -> router.get("/summary")
 *   GET  /me/profile      -> router.get("/profile")
 *   POST /me/profile      -> router.post("/profile")
 */

router.get("/", requireAuth, async (req, res) => {
  const { email, role, entitlements, username, avatarUrl } = req.user;
  return res.json({ email, role, username, avatarUrl, entitlements });
});

router.get("/entitlements", requireAuth, async (req, res) => {
  const ent = (req.user.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
  }));
  res.json(ent);
});

router.get("/summary", requireAuth, async (req, res) => {
  const ent = (req.user.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt,
    isExpired: e.expiresAt ? dayjs(e.expiresAt).isBefore(dayjs()) : true,
  }));
  return res.json({ email: req.user.email, entitlements: ent });
});

router.get("/profile", requireAuth, async (req, res) => {
  const { email, username, avatarUrl, role } = req.user;
  return res.json({ email, username, avatarUrl, role });
});

router.post("/profile", requireAuth, async (req, res) => {
  const { username, avatarUrl } = req.body || {};

  if (username) {
    const exists = await User.findOne({ username, _id: { $ne: req.user._id } });
    if (exists)
      return res.status(409).json({ error: "Username already taken" });
  }

  if (username !== undefined) req.user.username = username;
  if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;
  await req.user.save();

  const { email, role } = req.user;
  return res.json({
    user: {
      email,
      username: req.user.username,
      avatarUrl: req.user.avatarUrl,
      role,
    },
  });
});

export default router;
