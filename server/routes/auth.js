// server/routes/auth.js
import express from "express";
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

/* -------------------- helpers -------------------- */
const normalizeWhatsApp = (v) => (!v ? "" : String(v).replace(/[^\d+]/g, ""));

async function findByIdentifier(identifier) {
  const id = String(identifier || "").trim();
  return (
    (await User.findOne({ email: id })) ||
    (await User.findOne({ username: id }))
  );
}

// Treat these clients as "native/plugin" => enforce entitlement + device binding
function isPluginClient(req) {
  const h = (s) => (req.get(s) || "").toLowerCase();

  // Option A: explicit header from your Windows apps
  // e.g. X-ADLM-Client: planswift-plugin
  const kind = h("x-adlm-client");
  if (kind && /win|plugin|desktop/i.test(kind)) return true;

  // Option B: fallback signal via body
  if ((req.body?.client || "").toLowerCase() === "plugin") return true;

  // Option C: if request sends a device fingerprint at all, assume plugin
  if (req.body?.device_fingerprint) return true;

  return false;
}

// If your expiresAt is saved like "YYYY-MM-DD", treat as end of that day (UTC)
function normalizeExpiryMaybe(expValue) {
  if (!expValue) return null;
  const d = new Date(expValue);
  if (isNaN(d.getTime())) return null;

  if (typeof expValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expValue)) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

/** Legacy -> devices[] migration */
function normalizeLegacyEnt(ent) {
  if (!ent) return;

  if (!ent.seats || ent.seats < 1) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];

  // ✅ infer correct licenseType from seats (fix wrong "personal" on multi-seat)
  const seats = Math.max(Number(ent.seats || 1), 1);
  const lt = String(ent.licenseType || "").toLowerCase();
  if (lt !== "organization" && seats > 1) ent.licenseType = "organization";
  if (!ent.licenseType)
    ent.licenseType = seats > 1 ? "organization" : "personal";

  // migrate legacy single-device -> devices[]
  if (ent.devices.length === 0 && ent.deviceFingerprint) {
    ent.devices.push({
      fingerprint: ent.deviceFingerprint,
      name: "",
      boundAt: ent.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }
}


function activeDevices(ent) {
  return (ent?.devices || []).filter((d) => !d.revokedAt);
}

/**
 * Enforce device rules:
 * - personal (single-seat): only 1 device
 * - organization OR seats>1: allow up to `seats` devices
 *
 * Returns { ok:true } or { ok:false, status, code, error }
 */
function enforceDeviceBinding(ent, incomingFingerprint) {
  const fp = String(incomingFingerprint || "").trim();
  if (!fp) {
    return {
      ok: false,
      status: 400,
      code: "DFP_REQUIRED",
      error: "device_fingerprint required",
    };
  }

  normalizeLegacyEnt(ent);

  const seats = Math.max(Number(ent.seats || 1), 1);
  const isOrg =
    String(ent.licenseType || "").toLowerCase() === "organization" || seats > 1;

  // ✅ MULTI-DEVICE PATH
  if (isOrg) {
    const act = activeDevices(ent);
    const exists = act.find((d) => d.fingerprint === fp);

    if (exists) {
      exists.lastSeenAt = new Date();
      return { ok: true, changed: true }; // lastSeen update
    }

    if (act.length < seats) {
      ent.devices.push({
        fingerprint: fp,
        name: "",
        boundAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
      });

      // keep legacy fields populated for backward compatibility
      if (!ent.deviceFingerprint) ent.deviceFingerprint = fp;
      if (!ent.deviceBoundAt) ent.deviceBoundAt = new Date();

      return { ok: true, changed: true };
    }

    return {
      ok: false,
      status: 403,
      code: "DEVICE_LIMIT_REACHED",
      error: "Device limit reached for this subscription.",
    };
  }

  // ✅ SINGLE-DEVICE PATH (personal / seats=1)
  if (ent.deviceFingerprint && ent.deviceFingerprint !== fp) {
    return {
      ok: false,
      status: 403,
      code: "DEVICE_MISMATCH",
      error: "This subscription is already bound to another device.",
    };
  }

  // bind if not yet bound
  if (!ent.deviceFingerprint) {
    ent.deviceFingerprint = fp;
    ent.deviceBoundAt = new Date();
  }

  // also keep devices[] in sync for admin UI
  const act = activeDevices(ent);
  if (!act.some((d) => d.fingerprint === fp)) {
    ent.devices.push({
      fingerprint: fp,
      name: "",
      boundAt: ent.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  } else {
    // update last seen for single-seat too
    const d = act.find((d) => d.fingerprint === fp);
    if (d) d.lastSeenAt = new Date();
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
  return "";
}

// Create offline license JWT (HS256) for plugin use
function signLicenseToken({ user, productKey, deviceFingerprint, expiresAt }) {
  const secret = getLicenseJwtSecret();
  if (!secret) return null;

  const expMs = expiresAt?.getTime?.() || 0;
  const expSec = expMs ? Math.floor(expMs / 1000) : null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (!expSec || expSec <= nowSec) return null;

  const chosenPk = String(productKey || "").toLowerCase();
  const dfp = String(deviceFingerprint || "");

  const payload = {
    ver: 1,
    sub: String(user._id),
    email: user.email,
    productKey: chosenPk,
    deviceFingerprint: dfp,

    // Important: for the chosen productKey, embed THIS device fingerprint
    entitlements: (user.entitlements || []).map((e) => {
      const pk = String(e.productKey || "").toLowerCase();
      return {
        productKey: pk,
        status: e.status,
        expiresAt: e.expiresAt || null,
        deviceFingerprint: pk === chosenPk ? dfp : e.deviceFingerprint || null,
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

/* -------------------- SIGNUP -------------------- */
router.post("/signup", async (req, res) => {
  try {
    await ensureDb();
    const { email, username, password, zone, firstName, lastName, whatsapp } =
      req.body || {};

    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    if (!firstName || !lastName || !whatsapp) {
      return res
        .status(400)
        .json({ error: "firstName, lastName and whatsapp are required" });
    }

    const exists = await User.findOne({
      $or: [{ email }, ...(username ? [{ username }] : [])],
    });
    if (exists) return res.status(409).json({ error: "User exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      username: username || email.split("@")[0],
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

    const payload = {
      _id: String(user._id),
      email: user.email,
      role: user.role,
      zone: user.zone || "",
      entitlements: user.entitlements || [],
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      whatsapp: user.whatsapp || "",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
    };

    const accessToken = signAccess(payload);

    if (pluginLogin && chosenPk && chosenDfp && chosenExpiresAt) {
      licenseToken = signLicenseToken({
        user,
        productKey: chosenPk,
        deviceFingerprint: chosenDfp,
        expiresAt: chosenExpiresAt,
      });

      if (!licenseToken) {
        return res.status(503).json({
          error: "License token signing is unavailable. Please contact support.",
          code: "LICENSE_TOKEN_UNAVAILABLE",
        });
      }
    }

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

/* -------------------- REFRESH -------------------- */
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
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      whatsapp: user.whatsapp || "",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
    };

    const accessToken = signAccess(payload);
    res.json({ accessToken, user: payload });
  } catch (err) {
    console.error("[/auth/refresh] error:", err);
    res.status(500).json({ error: "Refresh failed" });
  }
});

/* -------------------- LOGOUT -------------------- */
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

/* -------------------- PASSWORD: FORGOT -------------------- */
router.post("/password/forgot", async (req, res) => {
  try {
    await ensureDb();
    const { identifier } = req.body || {};
    if (!identifier)
      return res.status(400).json({ error: "identifier required" });

    const user = await findByIdentifier(identifier);
    if (!user) return res.json({ ok: true }); // avoid enumeration

    const existing = await PasswordReset.findOne({
      userId: user._id,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (existing) return res.json({ ok: true });

    const code = String(Math.floor(100000 + Math.random() * 900000));
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

/* -------------------- PASSWORD: RESET -------------------- */
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

    if (rec.attempts >= 5)
      return res
        .status(429)
        .json({ error: "Too many attempts. Request a new code." });

    if (String(code) !== String(rec.code)) {
      rec.attempts += 1;
      await rec.save();
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    rec.usedAt = new Date();
    await rec.save();

    await Refresh.deleteMany({ userId: user._id });
    res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/password/reset] error:", err);
    res.status(500).json({ error: "Reset failed" });
  }
});

/* -------------------- APP LOOKUP (FREE APPS) -------------------- */
/**
 * For free desktop apps: verify user exists (no password), return basic profile.
 * This does NOT return tokens.
 */
router.post("/app/lookup", async (req, res) => {
  try {
    await ensureDb();
    const { identifier } = req.body || {};
    if (!identifier)
      return res.status(400).json({ error: "identifier required" });

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


