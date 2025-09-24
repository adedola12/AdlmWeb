import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { hashPassword, verifyPassword } from "../util/hash.js";
import {
  deriveUsernameFromEmail,
  ensureUniqueUsername,
} from "../util/username.js";

const router = express.Router();
router.use(cookieParser());

const ACCESS_TTL_MIN = 60; // 1 hour if you want longer sessions
const LICENSE_TTL_DAYS = 15;

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev_access_secret";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "dev_refresh_secret";
const JWT_LICENSE_SECRET =
  process.env.JWT_LICENSE_SECRET || "dev_license_secret";

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      rv: user.refreshVersion,
    },
    JWT_ACCESS_SECRET,
    { expiresIn: `${ACCESS_TTL_MIN}m` }
  );
}

function signLicenseToken(user) {
  const ent = {};
  (user.entitlements || []).forEach((e) => {
    ent[e.productKey] = {
      status: e.status,
      exp: e.expiresAt ? e.expiresAt.toISOString() : null,
      dfp: e.deviceFingerprint || null,
    };
  });
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      username: user.username,
      entitlements: ent,
    },
    JWT_LICENSE_SECRET,
    { expiresIn: `${LICENSE_TTL_DAYS}d` }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const u = await User.findById(payload.sub);
    if (!u) return res.status(401).json({ error: "Unauthorized" });
    if (u.disabled) return res.status(403).json({ error: "Account disabled" });
    if (payload.rv !== u.refreshVersion)
      return res.status(401).json({ error: "Session invalidated" });

    req.user = u;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function setRefreshCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("refreshToken", token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/", // add this for clarity
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

// ---------- SIGNUP ----------
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const base = deriveUsernameFromEmail(email);
    const username = await ensureUniqueUsername(base, User);

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email,
      username,
      passwordHash,
      role: "user",
      entitlements: [],
    });

    const accessToken = signAccessToken(user);
    const refreshToken = jwt.sign(
      { sub: user._id.toString(), v: user.refreshVersion },
      JWT_REFRESH_SECRET,
      { expiresIn: "30d" }
    );
    setRefreshCookie(res, refreshToken);
    const licenseToken = signLicenseToken(user);

    return res.json({
      accessToken,
      licenseToken,
      user: { email: user.email, username: user.username, role: user.role },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---------- LOGIN (email or username) ----------
router.post("/login", async (req, res) => {
  try {
    const { identifier, email, password, productKey, device_fingerprint } =
      req.body || {};
    const id = identifier || email;
    if (!id || !password)
      return res
        .status(400)
        .json({ error: "identifier/email and password required" });

    const query = id.includes("@") ? { email: id } : { username: id };
    const user = await User.findOne(query);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled)
      return res.status(403).json({ error: "Account disabled" });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    if (!user.username) {
      const base = deriveUsernameFromEmail(user.email);
      user.username = await ensureUniqueUsername(base, User);
      await user.save();
    }

    // (optional) plugin/device checks here...

    const accessToken = signAccessToken(user);
    const refreshToken = jwt.sign(
      { sub: user._id.toString(), v: user.refreshVersion },
      JWT_REFRESH_SECRET,
      { expiresIn: "30d" }
    );
    setRefreshCookie(res, refreshToken);
    const licenseToken = signLicenseToken(user);

    return res.json({
      accessToken,
      licenseToken,
      user: { email: user.email, username: user.username, role: user.role },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---------- REFRESH via cookie (NO requireAuth) ----------
router.post("/refresh", async (req, res) => {
  try {
    const rt = req.cookies?.refreshToken;
    if (!rt) return res.status(401).json({ error: "No refresh token" });

    const payload = jwt.verify(rt, JWT_REFRESH_SECRET); // { sub, v }
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.disabled)
      return res.status(403).json({ error: "Account disabled" });
    if (payload.v !== user.refreshVersion)
      return res.status(401).json({ error: "Session invalidated" });

    // rotate refresh token
    const newRefreshToken = jwt.sign(
      { sub: user._id.toString(), v: user.refreshVersion },
      JWT_REFRESH_SECRET,
      { expiresIn: "30d" }
    );
    setRefreshCookie(res, newRefreshToken);

    const accessToken = signAccessToken(user);
    const licenseToken = signLicenseToken(user);

    return res.json({
      accessToken,
      licenseToken,
      user: { email: user.email, username: user.username, role: user.role },
    });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

// routes/auth.js (same file you posted)
const REFRESH_COOKIE_NAME = "refreshToken"; // you set this name in setRefreshCookie
const isProd = process.env.NODE_ENV === "production";

router.post("/logout", async (req, res) => {
  try {
    // If we can verify the cookie, bump refreshVersion to invalidate all prior RTs
    const rt = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rt) {
      try {
        const payload = jwt.verify(rt, JWT_REFRESH_SECRET); // { sub, v }
        if (payload?.sub) {
          await User.updateOne(
            { _id: payload.sub },
            { $inc: { refreshVersion: 1 } }
          );
        }
      } catch {}
    }

    // Clear the cookie with the EXACT same attributes used when setting it
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      path: "/", // IMPORTANT: you didn't set a path when creating → default is "/"
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Logout failed" });
  }
});

export default router;
