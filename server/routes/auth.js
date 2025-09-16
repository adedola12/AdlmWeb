import express from "express";
import cookieParser from "cookie-parser";
import { User } from "../models/User.js";
import { hashPassword, verifyPassword } from "../util/hash.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefresh,
  signLicenseToken,
} from "../util/jwt.js";

const router = express.Router();
router.use(cookieParser());

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true if https
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  });
}

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email,
      passwordHash,
      role: "user",
      entitlements: [],
    });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    setRefreshCookie(res, refreshToken);
    const licenseToken = signLicenseToken(user);

    return res.json({
      accessToken,
      licenseToken,
      user: { email: user.email, role: user.role },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled)
      return res.status(403).json({ error: "Account disabled" });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    setRefreshCookie(res, refreshToken);
    const licenseToken = signLicenseToken(user);

    return res.json({
      accessToken,
      licenseToken,
      user: { email: user.email, role: user.role },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const rt = req.cookies.refreshToken || req.body.refreshToken;
    if (!rt) return res.status(401).json({ error: "Missing refresh token" });
    const payload = verifyRefresh(rt);
    const user = await User.findById(payload.sub);
    if (!user || user.disabled)
      return res.status(401).json({ error: "Invalid refresh" });
    if (payload.v !== user.refreshVersion)
      return res.status(401).json({ error: "Invalidated refresh" });

    // rotate refresh
    const newRefresh = signRefreshToken(user);
    setRefreshCookie(res, newRefresh);

    const accessToken = signAccessToken(user);
    const licenseToken = signLicenseToken(user); // re-issue license (still 15 days)

    return res.json({ accessToken, licenseToken });
  } catch (e) {
    return res.status(401).json({ error: "Invalid/expired refresh" });
  }
});

router.post("/logout", async (req, res) => {
  res.clearCookie("refreshToken");
  return res.json({ ok: true });
});

// change password
router.post("/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body || {};
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await verifyPassword(oldPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Old password incorrect" });

    user.passwordHash = await hashPassword(newPassword);
    user.refreshVersion += 1; // invalidate all old refresh tokens
    await user.save();

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
