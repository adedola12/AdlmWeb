// server/routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { signAccess } from "../middleware/auth.js";
import { ensureDb } from "../db.js";
import mongoose from "mongoose";

const router = express.Router();
const REFRESH_COOKIE = "rt";

const Refresh = mongoose.model(
  "RefreshToken",
  new mongoose.Schema(
    {
      userId: { type: mongoose.Schema.Types.ObjectId, index: true },
      token: { type: String, index: true },
      ua: String,
      ip: String,
    },
    { timestamps: true }
  )
);

// cookie flags for cross-site
const refreshCookieOpts = {
  httpOnly: true,
  secure: true, // required with SameSite=None
  sameSite: "none", // so your frontend on another origin gets it
  path: "/auth/refresh",
  maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days
};

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
}

function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

/* ---------- LOGIN ---------- */
router.post("/login", async (req, res) => {
  await ensureDb();
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: "identifier and password required" });
  }

  // TODO: swap this with your existing user lookup
  const User = mongoose.model(
    "User",
    new mongoose.Schema(
      {
        email: String,
        username: String,
        passwordHash: String,
        role: String,
        zone: String,
        entitlements: [String],
      },
      { strict: false }
    )
  );

  const user =
    (await User.findOne({ email: identifier })) ||
    (await User.findOne({ username: identifier }));
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash || "");
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const payload = {
    _id: String(user._id),
    email: user.email,
    role: user.role || "user",
    zone: user.zone || "",
    entitlements: user.entitlements || [],
  };

  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ sub: payload._id });

  await Refresh.create({
    userId: user._id,
    token: refreshToken,
    ua: req.headers["user-agent"] || "",
    ip: req.ip,
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOpts);
  return res.json({ accessToken, user: payload });
});

/* ---------- REFRESH ---------- */
router.post("/refresh", async (req, res) => {
  await ensureDb();
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: "No refresh cookie" });

  let dec;
  try {
    dec = verifyRefresh(token);
  } catch {
    return res.status(401).json({ error: "Bad refresh token" });
  }

  const rec = await Refresh.findOne({ token });
  if (!rec) return res.status(401).json({ error: "Refresh not found" });

  // You may want to re-hydrate some user fields:
  const User = mongoose.model("User");
  const user = await User.findById(rec.userId).lean();
  if (!user) return res.status(401).json({ error: "User missing" });

  const payload = {
    _id: String(user._id),
    email: user.email,
    role: user.role || "user",
    zone: user.zone || "",
    entitlements: user.entitlements || [],
  };

  const accessToken = signAccess(payload);
  return res.json({ accessToken, user: payload });
});

/* ---------- LOGOUT ---------- */
router.post("/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await Refresh.deleteOne({ token });
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOpts, maxAge: 0 });
  res.json({ ok: true });
});

export default router;
