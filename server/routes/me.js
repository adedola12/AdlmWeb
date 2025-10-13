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
    // Optional: bump refreshVersion so devices pick up changes sooner
    req.user.refreshVersion += 1;
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
