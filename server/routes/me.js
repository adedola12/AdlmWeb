import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { ZONES, normalizeZone } from "../util/zones.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { email, role, entitlements, username, avatarUrl, zone } = req.user;
  return res.json({ email, role, username, avatarUrl, zone, entitlements });
});

/* === re-add this: used by desktop app EnsureEntitledAsync() === */
router.get("/entitlements", requireAuth, async (req, res) => {
  const ent = (req.user.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
  }));
  res.json(ent);
});

/* === re-add this: used by your web dashboard === */
router.get("/summary", requireAuth, async (req, res) => {
  const ent = (req.user.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
    isExpired: e.expiresAt ? dayjs(e.expiresAt).isBefore(dayjs()) : true,
  }));
  return res.json({
    email: req.user.email,
    entitlements: ent,
  });
});

router.get("/profile", requireAuth, async (req, res) => {
  const { email, username, avatarUrl, role, zone } = req.user;
  return res.json({ email, username, avatarUrl, role, zone, zones: ZONES });
});

router.post("/profile", requireAuth, async (req, res) => {
  const { username, avatarUrl, zone } = req.body || {};

  if (username) {
    const exists = await User.findOne({ username, _id: { $ne: req.user._id } });
    if (exists)
      return res.status(409).json({ error: "Username already taken" });
  }

  if (username !== undefined) req.user.username = username;
  if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;

  if (zone !== undefined) {
    const nz = normalizeZone(zone);
    if (!nz) return res.status(400).json({ error: "Invalid zone" });
    req.user.zone = nz;
    req.user.refreshVersion += 1; // optional bump
  }

  await req.user.save();
  const { email, role } = req.user;
  return res.json({
    user: {
      email,
      username: req.user.username,
      avatarUrl: req.user.avatarUrl,
      role,
      zone: req.user.zone,
    },
  });
});

export default router;
