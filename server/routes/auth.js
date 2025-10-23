import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { ensureDb } from "../db.js";
import { signAccess } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { PasswordReset } from "../models/PasswordReset.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();
const REFRESH_COOKIE = "rt";

/* ---- refresh token store ---- */
const Refresh =
  mongoose.models.RefreshToken ||
  mongoose.model(
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

// cookie flags (work in dev and prod)
const isProd = process.env.NODE_ENV === "production";
const refreshCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/auth/refresh",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
}
function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// helper to find user by email OR username
async function findByIdentifier(identifier) {
  const u =
    (await User.findOne({ email: identifier })) ||
    (await User.findOne({ username: identifier }));
  return u;
}

/* -------------------- SIGNUP (unchanged) -------------------- */
router.post("/signup", async (req, res) => {
  try {
    await ensureDb();
    const { email, username, password, zone } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: "User exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      username: username || email.split("@")[0],
      passwordHash,
      role: "user",
      zone: zone || null,
      entitlements: [],
    });

    const payload = {
      _id: String(user._id),
      email: user.email,
      role: user.role,
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
    return res.status(201).json({ accessToken, user: payload });
  } catch (err) {
    console.error("[/auth/signup] error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
});

/* -------------------- LOGIN (legacy-friendly) -------------------- */
router.post("/login", async (req, res) => {
  try {
    await ensureDb();

    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: "identifier and password required" });
    }

    const user =
      (await User.findOne({ email: identifier })) ||
      (await User.findOne({ username: identifier }));

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    // ✅ support legacy documents that still have `password`
    let ok = false;
    if (user.passwordHash) {
      ok = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
      ok = password === user.password;
      // Optional one-time migration to bcrypt:
      if (ok) {
        user.passwordHash = await bcrypt.hash(password, 10);
        user.password = undefined;
        await user.save();
      }
    }

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
  } catch (err) {
    console.error("[/auth/login] error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

/* -------------------- REFRESH (unchanged) -------------------- */
router.post("/refresh", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("[/auth/refresh] error:", err);
    return res.status(500).json({ error: "Refresh failed" });
  }
});

/* -------------------- LOGOUT (unchanged) -------------------- */
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await Refresh.deleteOne({ token });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOpts, maxAge: 0 });
    res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/logout] error:", err);
    res.json({ ok: true });
  }
});

router.post("/password/forgot", async (req, res) => {
  try {
    await ensureDb();
    const { identifier } = req.body || {};
    if (!identifier)
      return res.status(400).json({ error: "identifier required" });

    const user = await findByIdentifier(identifier);
    // We deliberately return 200 even if user not found to avoid account enumeration

    if (!user) return res.json({ ok: true });

    // simple throttle: allow 1 active unexpired reset at a time
    const existing = await PasswordReset.findOne({
      userId: user._id,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (existing) {
      return res.json({ ok: true }); // code already sent recently
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await PasswordReset.create({
      userId: user._id,
      code,
      expiresAt: expires,
      requestedFromIp: req.ip,
    });

    // send email
    const safeName = user.username || user.email.split("@")[0];
    try {
      await sendMail({
        to: user.email,
        subject: "Your ADLM password reset code",
        html: `<p>Hi ${safeName},</p>
               <p>Your password reset code is:</p>
               <p style="font-size:20px;font-weight:bold;letter-spacing:3px">${code}</p>
               <p>This code expires in 10 minutes.</p>`,
      });
    } catch (mailErr) {
      console.error("[/auth/password/forgot] mail error:", mailErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/password/forgot] error:", err);
    return res.status(500).json({ error: "Unable to send code" });
  }
});

/* -------------------- RESET (verify + set new) -------------------- */
router.post("/password/reset", async (req, res) => {
  try {
    await ensureDb();
    const { identifier, code, newPassword } = req.body || {};

    if (!identifier || !code || !newPassword)
      return res
        .status(400)
        .json({ error: "identifier, code, newPassword required" });

    const user = await findByIdentifier(identifier);
    if (!user) return res.status(400).json({ error: "Invalid code" });

    const rec = await PasswordReset.findOne({
      userId: user._id,
      code: String(code),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!rec) return res.status(400).json({ error: "Invalid or expired code" });

    // optional brute-force guard
    if (rec.attempts >= 5) {
      return res
        .status(429)
        .json({ error: "Too many attempts. Request a new code." });
    }

    rec.attempts += 1;

    // set new password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    // mark used & invalidate existing refresh tokens
    rec.usedAt = new Date();
    await rec.save();
    await Refresh.deleteMany({ userId: user._id }); // logout other sessions

    return res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/password/reset] error:", err);
    return res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
