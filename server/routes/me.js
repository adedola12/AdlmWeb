// server/routes/me.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { ZONES, normalizeZone } from "../util/zones.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  // req.user is JWT payload
  const { email, role, entitlements, username, avatarUrl, zone } = req.user;
  return res.json({ email, role, username, avatarUrl, zone, entitlements });
});

/* used by desktop */
router.get("/entitlements", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, { entitlements: 1 }).lean();
  const ent = (user?.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
  }));
  res.json(ent);
});

/* web summary */
router.get("/summary", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, {
    entitlements: 1,
    email: 1,
  }).lean();
  const ent = (user?.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
    isExpired: e.expiresAt ? dayjs(e.expiresAt).isBefore(dayjs()) : true,
  }));
  return res.json({ email: user?.email, entitlements: ent });
});

router.get("/profile", requireAuth, async (req, res) => {
  const u = await User.findById(req.user._id).lean();
  if (!u) return res.status(404).json({ error: "User missing" });
  const { email, username, avatarUrl, role, zone } = u;
  return res.json({ email, username, avatarUrl, role, zone, zones: ZONES });
});

router.post("/profile", requireAuth, async (req, res) => {
  const { username, avatarUrl, zone } = req.body || {};
  const u = await User.findById(req.user._id);
  if (!u) return res.status(404).json({ error: "User missing" });

  if (username) {
    const exists = await User.findOne({ username, _id: { $ne: u._id } });
    if (exists)
      return res.status(409).json({ error: "Username already taken" });
  }

  if (username !== undefined) u.username = username;
  if (avatarUrl !== undefined) u.avatarUrl = avatarUrl;

  if (zone !== undefined) {
    const nz = normalizeZone(zone);
    if (!nz) return res.status(400).json({ error: "Invalid zone" });
    u.zone = nz;
    u.refreshVersion += 1;
  }

  await u.save();
  const { email, role } = u;
  return res.json({
    user: {
      email,
      username: u.username,
      avatarUrl: u.avatarUrl,
      role,
      zone: u.zone,
    },
  });
});

export default router;
