import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ensureDb } from "../db.js";
import { User } from "../models/User.js";
import { Refresh } from "../models/Refresh.js";
import { PasswordReset } from "../models/PasswordReset.js";
import { sendMail } from "../util/mailer.js";
import { buildWelcomeEmail } from "../util/welcomeEmail.js";
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  REFRESH_COOKIE,
  refreshCookieOpts,
} from "../util/jwt.js";

const router = express.Router();

const normalizeWhatsApp = (value) =>
  !value ? "" : String(value).replace(/[^\d+]/g, "");

async function findByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;

  const email = raw.toLowerCase();
  return User.findOne({
    $or: [{ email }, { username: raw }],
  });
}

function buildAuthPayload(user) {
  return {
    _id: String(user._id),
    email: user.email,
    role: user.role || "user",
    zone: user.zone || "",
    entitlements: user.entitlements || [],
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    whatsapp: user.whatsapp || "",
    username: user.username || "",
    avatarUrl: user.avatarUrl || "",
  };
}

function isPluginClient(req) {
  const header = (name) => (req.get(name) || "").toLowerCase();
  const kind = header("x-adlm-client");
  if (kind && /win|plugin|desktop/i.test(kind)) return true;
  if ((req.body?.client || "").toLowerCase() === "plugin") return true;
  if (req.body?.device_fingerprint) return true;
  return false;
}

function normalizeExpiryMaybe(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function normalizeLegacyEnt(entitlement) {
  if (!entitlement) return;

  if (!entitlement.seats || entitlement.seats < 1) entitlement.seats = 1;
  if (!Array.isArray(entitlement.devices)) entitlement.devices = [];

  const seats = Math.max(Number(entitlement.seats || 1), 1);
  const licenseType = String(entitlement.licenseType || "").toLowerCase();
  if (licenseType !== "organization" && seats > 1) {
    entitlement.licenseType = "organization";
  }
  if (!entitlement.licenseType) {
    entitlement.licenseType = seats > 1 ? "organization" : "personal";
  }

  if (entitlement.devices.length === 0 && entitlement.deviceFingerprint) {
    entitlement.devices.push({
      fingerprint: entitlement.deviceFingerprint,
      name: "",
      boundAt: entitlement.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }
}

function activeDevices(entitlement) {
  return (entitlement?.devices || []).filter((device) => !device.revokedAt);
}

function enforceDeviceBinding(entitlement, incomingFingerprint) {
  const fingerprint = String(incomingFingerprint || "").trim();
  if (!fingerprint) {
    return {
      ok: false,
      status: 400,
      code: "DFP_REQUIRED",
      error: "device_fingerprint required",
    };
  }

  normalizeLegacyEnt(entitlement);

  const seats = Math.max(Number(entitlement.seats || 1), 1);
  const isOrg =
    String(entitlement.licenseType || "").toLowerCase() === "organization" ||
    seats > 1;

  if (isOrg) {
    const devices = activeDevices(entitlement);
    const existing = devices.find((device) => device.fingerprint === fingerprint);

    if (existing) {
      existing.lastSeenAt = new Date();
      return { ok: true, changed: true };
    }

    if (devices.length < seats) {
      entitlement.devices.push({
        fingerprint,
        name: "",
        boundAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
      });

      if (!entitlement.deviceFingerprint) entitlement.deviceFingerprint = fingerprint;
      if (!entitlement.deviceBoundAt) entitlement.deviceBoundAt = new Date();

      return { ok: true, changed: true };
    }

    return {
      ok: false,
      status: 403,
      code: "DEVICE_LIMIT_REACHED",
      error: "Device limit reached for this subscription.",
    };
  }

  if (entitlement.deviceFingerprint && entitlement.deviceFingerprint !== fingerprint) {
    return {
      ok: false,
      status: 403,
      code: "DEVICE_MISMATCH",
      error: "This subscription is already bound to another device.",
    };
  }

  if (!entitlement.deviceFingerprint) {
    entitlement.deviceFingerprint = fingerprint;
    entitlement.deviceBoundAt = new Date();
  }

  const devices = activeDevices(entitlement);
  if (!devices.some((device) => device.fingerprint === fingerprint)) {
    entitlement.devices.push({
      fingerprint,
      name: "",
      boundAt: entitlement.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  } else {
    const device = devices.find((item) => item.fingerprint === fingerprint);
    if (device) device.lastSeenAt = new Date();
  }

  return { ok: true, changed: true };
}

function getLicenseJwtSecret() {
  const configured = String(process.env.LICENSE_JWT_SECRET || "").trim();
  if (configured) return configured;

  if (process.env.NODE_ENV !== "production") {
    return "adlm_dev_license_secret_local_only";
  }

  console.error(
    "[/auth/login] LICENSE_JWT_SECRET is missing; plugin license token signing is unavailable.",
  );
  return null;
}

function offlineLicenseExpiryFor(entitlement) {
  const normalized = normalizeExpiryMaybe(entitlement?.expiresAt);
  if (normalized) return normalized;
  return new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
}

function signLicenseToken({ user, productKey, deviceFingerprint, expiresAt }) {
  const secret = getLicenseJwtSecret();
  if (!secret) return null;

  const expMs = expiresAt?.getTime?.() || 0;
  const expSec = expMs ? Math.floor(expMs / 1000) : null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!expSec || expSec <= nowSec) return null;

  const chosenProductKey = String(productKey || "").toLowerCase();
  const fingerprint = String(deviceFingerprint || "");

  const payload = {
    ver: 1,
    sub: String(user._id),
    email: user.email,
    productKey: chosenProductKey,
    deviceFingerprint: fingerprint,
    entitlements: (user.entitlements || []).map((entitlement) => {
      const key = String(entitlement.productKey || "").toLowerCase();
      return {
        productKey: key,
        status: entitlement.status,
        expiresAt: entitlement.expiresAt || null,
        deviceFingerprint:
          key === chosenProductKey ? fingerprint : entitlement.deviceFingerprint || null,
      };
    }),
  };

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    issuer: "adlm",
    audience: "adlm-plugin",
    expiresIn: expSec - nowSec,
  });
}

router.post("/signup", async (req, res) => {
  try {
    await ensureDb();
    const { email, username, password, zone, firstName, lastName, whatsapp } =
      req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }

    if (!firstName || !lastName || !whatsapp) {
      return res
        .status(400)
        .json({ error: "firstName, lastName and whatsapp are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Basic email format validation
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    const normalizedUsername = String(
      username || normalizedEmail.split("@")[0],
    ).trim();

    const exists = await User.findOne({
      $or: [
        { email: normalizedEmail },
        ...(normalizedUsername ? [{ username: normalizedUsername }] : []),
      ],
    });
    if (exists) return res.status(409).json({ error: "User exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      role: "user",
      zone: zone || null,
      firstName: String(firstName || "").trim(),
      lastName: String(lastName || "").trim(),
      whatsapp: normalizeWhatsApp(whatsapp),
      entitlements: [],
    });

    try {
      const { subject, html } = buildWelcomeEmail({
        firstName: user.firstName,
        lastName: user.lastName,
      });

      await sendMail({
        to: user.email,
        subject,
        html,
      });

      user.welcomeEmailSentAt = new Date();
      await user.save();
    } catch (mailErr) {
      console.error("[/auth/signup] welcome mail error:", mailErr);
    }

    const payload = buildAuthPayload(user);
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh({ sub: payload._id });

    await Refresh.create({
      userId: user._id,
      token: refreshToken,
      ua: req.headers["user-agent"] || "",
      ip: req.ip,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOpts);
    return res.json({ accessToken, user: payload, licenseToken: null });
  } catch (err) {
    console.error("[/auth/signup] error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    await ensureDb();
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: "identifier and password required" });
    }

    const user = await findByIdentifier(identifier);
    if (!user?.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.disabled) {
      return res
        .status(403)
        .json({ error: "Account disabled. Please contact support." });
    }

    let licenseToken = null;
    let changed = false;

    if (isPluginClient(req)) {
      const chosenProductKey = String(
        req.body?.productKey || req.body?.product_key || "",
      )
        .trim()
        .toLowerCase();
      const chosenFingerprint = String(
        req.body?.device_fingerprint || "",
      ).trim();

      if (!chosenProductKey) {
        return res.status(400).json({
          error: "productKey required for plugin login",
          code: "PRODUCT_REQUIRED",
        });
      }

      const entitlement = (user.entitlements || []).find(
        (item) =>
          String(item?.productKey || "").toLowerCase() === chosenProductKey,
      );

      if (!entitlement) {
        return res.status(403).json({
          error: "No entitlement found for this product.",
          code: "NO_ENTITLEMENT",
        });
      }

      normalizeLegacyEnt(entitlement);

      const status = String(entitlement.status || "inactive").toLowerCase();
      if (status !== "active") {
        return res.status(403).json({
          error: "Entitlement is not active for this product.",
          code: "ENTITLEMENT_INACTIVE",
        });
      }

      const entitlementExpiry = normalizeExpiryMaybe(entitlement.expiresAt);
      if (entitlementExpiry && entitlementExpiry.getTime() < Date.now()) {
        entitlement.status = "expired";
        changed = true;
        return res.status(403).json({
          error: "This subscription has expired.",
          code: "ENTITLEMENT_EXPIRED",
        });
      }

      const binding = enforceDeviceBinding(entitlement, chosenFingerprint);
      if (!binding.ok) {
        return res.status(binding.status).json({
          error: binding.error,
          code: binding.code,
        });
      }
      changed ||= !!binding.changed;

      const chosenExpiresAt = offlineLicenseExpiryFor(entitlement);
      licenseToken = signLicenseToken({
        user,
        productKey: chosenProductKey,
        deviceFingerprint: chosenFingerprint,
        expiresAt: chosenExpiresAt,
      });

      if (!licenseToken) {
        return res.status(503).json({
          error: "License token signing is unavailable. Please contact support.",
          code: "LICENSE_TOKEN_UNAVAILABLE",
        });
      }
    }

    if (changed) {
      await user.save();
    }

    const payload = buildAuthPayload(user);
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh({ sub: payload._id });

    await Refresh.create({
      userId: user._id,
      token: refreshToken,
      ua: req.headers["user-agent"] || "",
      ip: req.ip,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOpts);
    return res.json({ accessToken, user: payload, licenseToken });
  } catch (err) {
    console.error("[/auth/login] error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    await ensureDb();

    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: "No refresh cookie" });

    try {
      verifyRefresh(token);
    } catch {
      return res.status(401).json({ error: "Bad refresh token" });
    }

    const record = await Refresh.findOne({ token });
    if (!record) return res.status(401).json({ error: "Refresh not found" });

    const user = await User.findById(record.userId).lean();
    if (!user) return res.status(401).json({ error: "User missing" });

    const payload = buildAuthPayload(user);
    const accessToken = signAccess(payload);
    res.json({ accessToken, user: payload });
  } catch (err) {
    console.error("[/auth/refresh] error:", err);
    res.status(500).json({ error: "Refresh failed" });
  }
});

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
    if (!identifier) {
      return res.status(400).json({ error: "identifier required" });
    }

    const user = await findByIdentifier(identifier);
    if (!user) return res.json({ ok: true });

    const existing = await PasswordReset.findOne({
      userId: user._id,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (existing) return res.json({ ok: true });

    const code = String(crypto.randomInt(100000, 999999));
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await PasswordReset.create({
      userId: user._id,
      code,
      expiresAt: expires,
      requestedFromIp: req.ip,
    });

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

    res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/password/forgot] error:", err);
    res.status(500).json({ error: "Unable to send code" });
  }
});

router.post("/password/reset", async (req, res) => {
  try {
    await ensureDb();
    const { identifier, code, newPassword } = req.body || {};
    if (!identifier || !code || !newPassword) {
      return res
        .status(400)
        .json({ error: "identifier, code, newPassword required" });
    }

    const user = await findByIdentifier(identifier);
    if (!user) return res.status(400).json({ error: "Invalid code" });

    const record = await PasswordReset.findOne({
      userId: user._id,
      code: String(code),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!record) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    if (record.attempts >= 5) {
      return res
        .status(429)
        .json({ error: "Too many attempts. Request a new code." });
    }

    const codeA = Buffer.from(String(code));
    const codeB = Buffer.from(String(record.code));
    if (codeA.length !== codeB.length || !crypto.timingSafeEqual(codeA, codeB)) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    record.usedAt = new Date();
    await record.save();

    await Refresh.deleteMany({ userId: user._id });
    res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/password/reset] error:", err);
    res.status(500).json({ error: "Reset failed" });
  }
});

router.post("/app/lookup", async (req, res) => {
  try {
    await ensureDb();
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ error: "identifier required" });
    }

    const user = await findByIdentifier(String(identifier).trim());
    if (!user) return res.json({ exists: false });

    return res.json({
      exists: true,
      user: {
        _id: String(user._id),
        email: user.email || "",
        username: user.username || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        avatarUrl: user.avatarUrl || "",
      },
    });
  } catch (err) {
    console.error("[/auth/app/lookup] error:", err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
