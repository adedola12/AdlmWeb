import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import { User } from "../models/User.js";
import { hashPassword, verifyPassword } from "../util/hash.js";
import {
  deriveUsernameFromEmail,
  ensureUniqueUsername,
} from "../util/username.js";

const router = express.Router();
router.use(cookieParser());

const ACCESS_TTL_MIN = 15;
const LICENSE_TTL_DAYS = 15;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev_access_secret";
const JWT_LICENSE_SECRET =
  process.env.JWT_LICENSE_SECRET || "super_license_secret_change_me";

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

// licenseToken carries all entitlements, and for each product includes its own dfp
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
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_LICENSE_SECRET,
    { expiresIn: `${LICENSE_TTL_DAYS}d` }
  );
}

// auth middleware (unchanged)
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

// wherever you define setRefreshCookie
function setRefreshCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("refreshToken", token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,               // must be true for SameSite=None
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
      JWT_ACCESS_SECRET,
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

/**
 * POST /auth/login
 * Body: { email, password, productKey?, device_fingerprint? }
 * When productKey+device_fingerprint are present (plugins), bind or enforce per-product device lock.
 */
// ---------- LOGIN (identifier = username OR email) ----------
/**
 * Body:
 *   identifier  (username OR email)   <-- NEW
 *   password
 *   productKey?             (from plugin)
 *   device_fingerprint?     (from plugin)
 */
router.post("/login", async (req, res) => {
  try {
    const { identifier, email, password, productKey, device_fingerprint } =
      req.body || {};
    const id = identifier || email; // backwards-compat with older clients
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

    // Backfill username if missing
    if (!user.username) {
      const base = deriveUsernameFromEmail(user.email);
      user.username = await ensureUniqueUsername(base, User);
      await user.save();
    }

    // // Per-product device binding (if plugin passes productKey + fingerprint)
    // if (productKey && device_fingerprint) {
    //   const ent = (user.entitlements || []).find(
    //     (e) => e.productKey === productKey
    //   );
    //   if (ent) {
    //     if (!ent.deviceFingerprint) {
    //       ent.deviceFingerprint = String(device_fingerprint);
    //       ent.deviceBoundAt = new Date();
    //       await user.save();
    //     } else if (ent.deviceFingerprint !== String(device_fingerprint)) {
    //       return res.status(403).json({
    //         error: `This ${productKey} subscription is already bound to another device.`,
    //         code: "PRODUCT_DEVICE_MISMATCH",
    //       });
    //     }
    //   }
    // }

    // ⛔ Strict plugin path: require active entitlement for productKey
    if (productKey) {
      const ent = (user.entitlements || []).find(
        (e) => e.productKey === productKey
      );
      const active =
        ent &&
        ent.status === "active" &&
        ent.expiresAt &&
        new Date(ent.expiresAt) > new Date();

      if (!active) {
        return res.status(403).json({
          error: `No active subscription for '${productKey}'.`,
          code: "PRODUCT_NOT_ENTITLED",
        });
      }

      // If device_fingerprint provided, enforce binding/lock
      if (device_fingerprint) {
        if (!ent.deviceFingerprint) {
          ent.deviceFingerprint = String(device_fingerprint);
          ent.deviceBoundAt = new Date();
          await user.save();
        } else if (ent.deviceFingerprint !== String(device_fingerprint)) {
          return res.status(403).json({
            error: `This '${productKey}' subscription is already bound to another device.`,
            code: "PRODUCT_DEVICE_MISMATCH",
          });
        }
      }
    }

    const accessToken = signAccessToken(user);
    const refreshToken = jwt.sign(
      { sub: user._id.toString(), v: user.refreshVersion },
      JWT_ACCESS_SECRET,
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

router.post("/refresh", requireAuth, async (req, res) => {
  const accessToken = signAccessToken(req.user);
  // license token also re-issued so plugins can refresh offline window
  const licenseToken = signLicenseToken(req.user);
  return res.json({ accessToken, licenseToken });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken");
  return res.json({ ok: true });
});

export default router;
