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
import { Invoice } from "../models/Invoice.js";
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  REFRESH_COOKIE,
  refreshCookieOpts,
} from "../util/jwt.js";
import { getPrivateKey, getKid } from "../util/jwks.js";

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

// Password complexity policy — enforced on signup and password reset.
// Minimum 8 chars, at least one letter and one number.
function validatePasswordStrength(password) {
  const pw = String(password || "");
  if (pw.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

// Fingerprint migration window: clients sending x-adlm-fp-version >= 2 that
// don't match any existing device may transparently replace the user's
// single legacy (v1) device for up to this many days after we ship v2.
// Keep this stable once set so migration behavior is predictable.
const FP_V2_LAUNCHED_AT = Date.parse("2026-04-17T00:00:00Z");
const FP_MIGRATION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function inFingerprintMigrationWindow() {
  return Date.now() - FP_V2_LAUNCHED_AT < FP_MIGRATION_WINDOW_MS;
}

// enforceDeviceBinding enforces seat limits and, for personal (1-seat)
// licenses, single-device binding. The `fpVersion` (from the
// x-adlm-fp-version header) lets us auto-migrate users seamlessly from
// the legacy MAC-based fingerprint to the new hardware-bound one
// without locking them out when their fingerprint changes shape.
function enforceDeviceBinding(entitlement, incomingFingerprint, fpVersion = 1) {
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

  // Helper: try to migrate an existing v1 device to the new v2 fingerprint.
  // Only runs within the migration window and only when there is exactly
  // one active v1 device (prevents accidental swaps on org licenses).
  function tryMigrate(v2Fp) {
    if (fpVersion < 2) return false;
    if (!inFingerprintMigrationWindow()) return false;

    const active = activeDevices(entitlement);
    const legacy = active.filter((d) => (d.fpVersion || 1) < 2);
    if (legacy.length !== 1) return false;

    const target = legacy[0];
    target.fingerprint = v2Fp;
    target.fpVersion = 2;
    target.lastSeenAt = new Date();
    // Update legacy top-level mirror so older code paths stay consistent
    entitlement.deviceFingerprint = v2Fp;
    return true;
  }

  if (isOrg) {
    const devices = activeDevices(entitlement);
    const existing = devices.find((device) => device.fingerprint === fingerprint);

    if (existing) {
      existing.lastSeenAt = new Date();
      if (fpVersion >= 2 && (existing.fpVersion || 1) < 2) existing.fpVersion = 2;
      return { ok: true, changed: true };
    }

    if (devices.length < seats) {
      entitlement.devices.push({
        fingerprint,
        name: "",
        boundAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
        fpVersion: Math.max(1, Number(fpVersion) || 1),
      });

      if (!entitlement.deviceFingerprint) entitlement.deviceFingerprint = fingerprint;
      if (!entitlement.deviceBoundAt) entitlement.deviceBoundAt = new Date();

      return { ok: true, changed: true };
    }

    // At seat limit — last chance: migrate a lone legacy device in-place.
    if (tryMigrate(fingerprint)) {
      return { ok: true, changed: true, migrated: true };
    }

    return {
      ok: false,
      status: 403,
      code: "DEVICE_LIMIT_REACHED",
      error: "Device limit reached for this subscription.",
    };
  }

  // Personal (single-seat) license
  if (entitlement.deviceFingerprint && entitlement.deviceFingerprint !== fingerprint) {
    // Attempt seamless migration for the v1 → v2 transition.
    if (tryMigrate(fingerprint)) {
      return { ok: true, changed: true, migrated: true };
    }
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
      fpVersion: Math.max(1, Number(fpVersion) || 1),
    });
  } else {
    const device = devices.find((item) => item.fingerprint === fingerprint);
    if (device) {
      device.lastSeenAt = new Date();
      if (fpVersion >= 2 && (device.fpVersion || 1) < 2) device.fpVersion = 2;
    }
  }

  return { ok: true, changed: true };
}

function getLicenseJwtSecret() {
  // Accept either historical name (LICENSE_JWT_SECRET) or the name used in .env
  // (JWT_LICENSE_SECRET) so we don't get a silent regression if deployment
  // env isn't updated.
  const configured = String(
    process.env.JWT_LICENSE_SECRET ||
      process.env.LICENSE_JWT_SECRET ||
      "",
  ).trim();
  if (configured) return configured;

  if (process.env.NODE_ENV !== "production") {
    // Dev-only fallback so local testing still works without extra setup.
    // Never used in production — production will log and return null.
    return "adlm_dev_license_secret_local_only";
  }

  console.error(
    "[/auth/login] JWT_LICENSE_SECRET is missing; plugin license token signing is unavailable.",
  );
  return null;
}

function offlineLicenseExpiryFor(entitlement) {
  const normalized = normalizeExpiryMaybe(entitlement?.expiresAt);
  if (normalized) return normalized;
  return new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
}

// License signing supports two algorithms during the migration window:
//
//   HS256 — original symmetric signer. Shared secret (JWT_LICENSE_SECRET)
//           is burned into every plugin via HKCU\Environment, so anyone with
//           the secret can forge tokens. Kept available so plugins that
//           haven't picked up the new RS256-aware build yet don't break.
//
//   RS256 — asymmetric. Private key lives only in JWT_LICENSE_PRIVATE_KEY
//           on the server; plugins pull the matching public key from
//           /.well-known/jwks.json and use it to verify. Forgery requires
//           the private key, which never leaves the server.
//
// ADLM_LICENSE_SIGNING_ALGO selects the default. It's a one-line deploy
// change to flip from HS256 → RS256 once plugins have rolled out. If RS256
// is requested but JWT_LICENSE_PRIVATE_KEY isn't configured we silently
// fall back to HS256 so the login endpoint never crashes mid-rollout.
function signLicenseToken({ user, productKey, deviceFingerprint, expiresAt }) {
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

  const commonOptions = {
    issuer: "adlm",
    audience: "adlm-plugin",
    expiresIn: expSec - nowSec,
  };

  const algoPref = String(process.env.ADLM_LICENSE_SIGNING_ALGO || "HS256")
    .trim()
    .toUpperCase();

  if (algoPref === "RS256") {
    const privateKey = getPrivateKey();
    const kid = getKid();
    if (privateKey && kid) {
      // pass the PEM export so jsonwebtoken doesn't try to treat the
      // KeyObject as a raw buffer; keyid ends up in the JWT header so
      // plugins know which JWKS entry to match against.
      return jwt.sign(
        payload,
        privateKey.export({ type: "pkcs8", format: "pem" }),
        { ...commonOptions, algorithm: "RS256", keyid: kid },
      );
    }
    // RS256 was requested but key is missing — log once and fall through.
    console.error(
      "[/auth/login] ADLM_LICENSE_SIGNING_ALGO=RS256 but JWT_LICENSE_PRIVATE_KEY is unusable. Falling back to HS256.",
    );
  }

  const secret = getLicenseJwtSecret();
  if (!secret) return null;

  return jwt.sign(payload, secret, { ...commonOptions, algorithm: "HS256" });
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

    const pwError = validatePasswordStrength(password);
    if (pwError) {
      return res.status(400).json({ error: pwError, code: "WEAK_PASSWORD" });
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

    // Auto-link any invoices sent to this email address
    try {
      await Invoice.updateMany(
        { clientEmail: normalizedEmail, clientUserId: { $exists: false } },
        { $set: { clientUserId: user._id } },
      );
      await Invoice.updateMany(
        { clientEmail: normalizedEmail, clientUserId: null },
        { $set: { clientUserId: user._id } },
      );
    } catch (linkErr) {
      console.error("[/auth/signup] invoice link error:", linkErr);
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

      // Read fingerprint version from header (defaults to 1 for legacy clients).
      const fpVersion = Math.max(
        1,
        Number(req.get("x-adlm-fp-version")) || 1,
      );
      const binding = enforceDeviceBinding(
        entitlement,
        chosenFingerprint,
        fpVersion,
      );
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

    const pwError = validatePasswordStrength(newPassword);
    if (pwError) {
      return res.status(400).json({ error: pwError, code: "WEAK_PASSWORD" });
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

// Public "does this account exist?" lookup for plugin sign-in UX.
// Returns only a boolean to prevent user enumeration / PII harvesting.
// If the client needs full profile data, it should log in first and then
// call an authenticated endpoint (e.g. /me).
router.post("/app/lookup", async (req, res) => {
  try {
    await ensureDb();
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ error: "identifier required" });
    }

    const user = await findByIdentifier(String(identifier).trim());
    return res.json({ exists: !!user });
  } catch (err) {
    console.error("[/auth/app/lookup] error:", err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
