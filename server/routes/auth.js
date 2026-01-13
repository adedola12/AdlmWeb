// server/routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
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
  return (
    (await User.findOne({ email: identifier })) ||
    (await User.findOne({ username: identifier }))
  );
}

// Treat these clients as "native/plugin" => enforce entitlement + device binding
function isPluginClient(req) {
  const h = (s) => (req.get(s) || "").toLowerCase();

  // Option A: explicit header from your Windows apps
  //   e.g. X-ADLM-Client: rategen-win or revit-plugin
  const kind = h("x-adlm-client"); // "rategen-win", "revit-plugin", etc.
  if (kind && /win|plugin|desktop/i.test(kind)) return true;

  // Option B: fallback signal via body
  if ((req.body?.client || "").toLowerCase() === "plugin") return true;

  // Option C: if request sends a device fingerprint at all, assume plugin
  if (req.body?.device_fingerprint) return true;

  // Otherwise assume website
  return false;
}

/* -------------------- SIGNUP -------------------- */
router.post("/signup", async (req, res) => {
  try {
    await ensureDb();
    const { email, username, password, zone, firstName, lastName, whatsapp } =
      req.body || {};

    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    // enforce basic profile fields (optional)
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
      // Don't fail signup if email fails
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
    const refreshToken = signRefresh({ sub: payload._id });

    await Refresh.create({
      userId: user._id,
      token: refreshToken,
      ua: req.headers["user-agent"] || "",
      ip: req.ip,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOpts);
    res.status(201).json({ accessToken, user: payload });
  } catch (err) {
    console.error("[/auth/signup] error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* -------------------- LOGIN (web vs plugin) -------------------- */
router.post("/login", async (req, res) => {
  try {
    await ensureDb();

    const { identifier, password, productKey, device_fingerprint } =
      req.body || {};
    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: "identifier and password required" });
    }

    const user = await findByIdentifier(identifier);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled)
      return res.status(403).json({ error: "Account disabled" });

    // password check (supports legacy `password`)
    let ok = false;
    let needsSave = false;

    if (user.passwordHash) {
      ok = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
      ok = password === user.password;
      if (ok) {
        user.passwordHash = await bcrypt.hash(password, 10);
        user.password = undefined;
        needsSave = true;
      }
    }

    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const pluginLogin = isPluginClient(req);

    // ── Only for plugin/desktop logins: require entitlement + device binding ──
    if (pluginLogin) {
      const pk = String(productKey || "")
        .trim()
        .toLowerCase();
      const dfp = String(device_fingerprint || "").trim();

      if (!pk) {
        return res.status(400).json({
          error: "productKey required",
          code: "PRODUCT_KEY_REQUIRED",
        });
      }

      if (!dfp) {
        return res.status(400).json({
          error: "device_fingerprint required",
          code: "DFP_REQUIRED",
        });
      }

      // find ALL entitlements for this productKey (case-insensitive)
      const entList = (user.entitlements || []).filter(
        (e) =>
          String(e.productKey || "")
            .trim()
            .toLowerCase() === pk
      );

      if (!entList.length) {
        return res.status(403).json({
          error: "You do not have access to this product.",
          code: "NOT_ENTITLED",
          productKey: pk,
        });
      }

      const now = new Date();

      // pick the “best” entitlement:
      // 1) active + not expired (best)
      // 2) else latest expiresAt
      const ranked = entList
        .map((e) => {
          const status = String(e.status || "")
            .trim()
            .toLowerCase();
          const exp = e.expiresAt ? new Date(e.expiresAt) : null;
          const expOk = exp && !isNaN(exp.getTime()) ? exp : null;

          // If your expiresAt is saved like "YYYY-MM-DD", treat as end of that day (UTC)
          // so it doesn't expire at 00:00.
          if (
            expOk &&
            typeof e.expiresAt === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(e.expiresAt)
          ) {
            expOk.setUTCHours(23, 59, 59, 999);
          }

          const isActive = status === "active";
          const notExpired = expOk ? expOk.getTime() > now.getTime() : false;

          return { e, status, expOk, isActive, notExpired };
        })
        .sort((a, b) => {
          const aGood = a.isActive && a.notExpired ? 1 : 0;
          const bGood = b.isActive && b.notExpired ? 1 : 0;
          if (bGood !== aGood) return bGood - aGood;

          const at = a.expOk ? a.expOk.getTime() : 0;
          const bt = b.expOk ? b.expOk.getTime() : 0;
          return bt - at;
        });

      const ent = ranked[0].e;
      const status = String(ent.status || "")
        .trim()
        .toLowerCase();
      let expiresAt = ent.expiresAt ? new Date(ent.expiresAt) : null;

      if (
        expiresAt &&
        !isNaN(expiresAt.getTime()) &&
        typeof ent.expiresAt === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(ent.expiresAt)
      ) {
        expiresAt.setUTCHours(23, 59, 59, 999);
      }

      if (status !== "active") {
        return res.status(403).json({
          error: "Your subscription is not active.",
          code: "SUBSCRIPTION_INACTIVE",
          productKey: pk,
          expiresAt: ent.expiresAt || null,
        });
      }

      if (
        !expiresAt ||
        isNaN(expiresAt.getTime()) ||
        expiresAt.getTime() <= now.getTime()
      ) {
        return res.status(403).json({
          error: "Your subscription has expired.",
          code: "SUBSCRIPTION_EXPIRED",
          productKey: pk,
          expiresAt: ent.expiresAt || null,
        });
      }

      // one-device binding
      if (!ent.deviceFingerprint) {
        ent.deviceFingerprint = dfp;
        ent.deviceBoundAt = now;
        needsSave = true;
      } else if (ent.deviceFingerprint !== dfp) {
        return res.status(403).json({
          error: "This subscription is already bound to another device.",
          code: "DEVICE_MISMATCH",
        });
      }
    }
    // ── End plugin-only checks ──

    if (needsSave) await user.save();

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
    const refreshToken = signRefresh({ sub: payload._id });

    await Refresh.create({
      userId: user._id,
      token: refreshToken,
      ua: req.headers["user-agent"] || "",
      ip: req.ip,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOpts);
    // res.json({ accessToken, user: payload });
    res.json({ accessToken, user: payload, licenseToken });

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

    // (String compare already done by query, but keep guard)
    if (String(code) !== String(rec.code)) {
      rec.attempts += 1;
      await rec.save();
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    rec.usedAt = new Date();
    await rec.save();

    await Refresh.deleteMany({ userId: user._id }); // invalidate sessions
    res.json({ ok: true });
  } catch (err) {
    console.error("[/auth/password/reset] error:", err);
    res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
