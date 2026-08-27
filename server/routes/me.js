// server/routes/me.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { rolePermissionList, isSuperAdminRole, isDesignRole } from "../util/rbac.js";
import { ALL_AREA_KEYS } from "../config/permissions.js";
import { ZONES, normalizeZone } from "../util/zones.js";
import { STATES, normalizeState, zoneForState } from "../util/states.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";
import { Setting } from "../models/Setting.js";
import { Invoice } from "../models/Invoice.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { sendMail } from "../util/mailer.js";
import { resolveUserGuideUrl } from "../util/userGuide.js";
import { isGodUser } from "../util/godAccount.js";
import bcrypt from "bcryptjs";
import { validatePasswordStrength } from "../util/passwordPolicy.js";
import {
  BOQ_IMPORT_ENTITLEMENT,
  BOQ_IMPORT_LEGACY_ENTITLEMENT,
} from "../util/boqImportAccess.js";
import {
  verifySocialIdentity,
  exchangeCodeForIdToken,
  PROVIDER_FIELD,
  configuredProviders,
} from "../util/socialIdentity.js";

const router = express.Router();

// "No expiry" for the break-glass God account, expressed as a date because the
// desktop clients require one. Far enough out to be perpetual in practice.
const GOD_NEVER_EXPIRES = new Date("2099-12-31T23:59:59.000Z");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------ helpers ------------------ */

function normalizeExpiry(v) {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return `${v}T23:59:59.999Z`;
  }
  return v;
}

function maskFp(fp) {
  const s = String(fp || "");
  if (!s) return "";
  if (s.length <= 10) return s;
  return `${s.slice(0, 5)}…${s.slice(-4)}`;
}

// ✅ legacy -> devices[] migration
function normalizeLegacyEntitlement(ent) {
  if (!ent) return ent;

  if (!ent.seats || ent.seats < 1) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];

  // migrate old single-device binding into devices[]
  if (ent.devices.length === 0 && ent.deviceFingerprint) {
    ent.devices.push({
      fingerprint: ent.deviceFingerprint,
      name: "",
      boundAt: ent.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }

  return ent;
}

function activeDevices(ent) {
  return (ent.devices || []).filter((d) => !d.revokedAt);
}

async function ensureUserEntitlementsMigrated(userDoc) {
  let changed = false;
  userDoc.entitlements = userDoc.entitlements || [];

  for (const ent of userDoc.entitlements) {
    const beforeSeats = ent.seats;
    const beforeDevicesLen = Array.isArray(ent.devices)
      ? ent.devices.length
      : -1;

    normalizeLegacyEntitlement(ent);

    const afterSeats = ent.seats;
    const afterDevicesLen = Array.isArray(ent.devices)
      ? ent.devices.length
      : -1;

    if (beforeSeats !== afterSeats || beforeDevicesLen !== afterDevicesLen) {
      changed = true;
    }
  }

  if (changed) await userDoc.save();
}

function isEntExpiredAt(expiresAt) {
  if (!expiresAt) return false;
  const end = dayjs(expiresAt).endOf("day");
  return end.isValid() && end.isBefore(dayjs());
}

// calendar days remaining (0 if today, 1 if tomorrow, etc.)
function daysLeftFor(expiresAt) {
  if (!expiresAt) return null;
  const endDay = dayjs(expiresAt).endOf("day");
  if (!endDay.isValid()) return null;
  const diff = endDay.startOf("day").diff(dayjs().startOf("day"), "day");
  return Math.max(diff, 0);
}

/**
 * ✅ Auto-mark expired entitlements:
 * - active -> expired when date passes
 * - expired -> active ONLY if admin extended expiry (date now in future)
 * - does NOT touch "disabled" or other statuses (admin choice remains)
 */
function applyExpiryToUser(userDoc) {
  let changed = false;
  userDoc.entitlements = userDoc.entitlements || [];

  for (const ent of userDoc.entitlements) {
    const st = String(ent.status || "active").toLowerCase();
    const expired = isEntExpiredAt(ent.expiresAt);

    if (expired && st === "active") {
      ent.status = "expired";
      changed = true;
    }

    if (!expired && st === "expired") {
      ent.status = "active";
      changed = true;
    }
  }

  if (changed) userDoc.refreshVersion = (userDoc.refreshVersion || 0) + 1;
  return changed;
}

function toEntitlementV2(ent) {
  normalizeLegacyEntitlement(ent);
  const act = activeDevices(ent);

  const expired = isEntExpiredAt(ent.expiresAt);
  const daysLeft = daysLeftFor(ent.expiresAt);
  const maxSeats = Math.max(parseInt(ent.seats || 1, 10), 1);

  return {
    productKey: ent.productKey,
    status: ent.status,
    expiresAt: normalizeExpiry(ent.expiresAt),

    // ✅ helpful UI fields
    isExpired: expired,
    daysLeft,

    seats: maxSeats,
    seatsUsed: act.length,

    licenseType: ent.licenseType || "personal",
    organizationName: ent.organizationName || "",

    seatsAvailable: maxSeats - act.length,

    // Only send bound devices if ALL seats are used.
    // When seats are still available, return empty so the desktop client
    // allows the install (it checks devices.length > 0 to gate access).
    // The bind-device endpoint will properly register the new device.
    devices: act.length >= maxSeats
      ? act.map((d) => ({
          fingerprint: String(d.fingerprint || ""),
          name: d.name || "",
          boundAt: d.boundAt || null,
          lastSeenAt: d.lastSeenAt || null,
        }))
      : [],
  };
}

/* ------------------ routes ------------------ */

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      email,
      role,
      username,
      avatarUrl,
      zone,
      firstName,
      lastName,
      whatsapp,
    } = req.user;

    const user = await User.findById(req.user._id, {
      entitlements: 1,
      refreshVersion: 1,
      security: 1,
      role: 1,
      // Read the location from the DB, not the JWT. A user who changes state on
      // the website must be priced against it on the desktop's next sync, without
      // being made to sign out and back in to refresh a token.
      state: 1,
      zone: 1,
    });

    if (user) {
      await ensureUserEntitlementsMigrated(user);
      const expiryChanged = applyExpiryToUser(user);
      if (expiryChanged) await user.save();
    }

    const entitlementsV2 = user
      ? (user.entitlements || []).map(toEntitlementV2)
      : [];

    // ✅ keep legacy "entitlements" accurate from DB (not token)
    const entitlementsLegacy = (user?.entitlements || []).map((e) => ({
      productKey: e.productKey,
      status: e.status,
      expiresAt: normalizeExpiry(e.expiresAt),
    }));

    // Prefer the DB role over the (possibly stale) JWT role so a reassignment
    // reflects on the next /me without a full re-login.
    const effectiveRole = user?.role || role;

    return res.json({
      email,
      role: effectiveRole,
      username,
      avatarUrl,
      zone: user?.zone || zone,
      state: user?.state || null,
      entitlements: entitlementsLegacy, // legacy payload (but now accurate)
      entitlementsV2,
      refreshVersion: user?.refreshVersion || 1,
      firstName: firstName || "",
      lastName: lastName || "",
      whatsapp: whatsapp || "",
      stepUpEnabled: !!user?.security?.stepUpEnabled,
      isSuperAdmin: isSuperAdminRole(effectiveRole),
      permissions: rolePermissionList(effectiveRole, ALL_AREA_KEYS),
      designAccess: isDesignRole(effectiveRole),
    });
  }),
);

/* used by desktop (legacy shape kept) */
router.get(
  "/entitlements",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id, { entitlements: 1 });
    if (!user) return res.status(404).json({ error: "User not found" });

    await ensureUserEntitlementsMigrated(user);
    const expiryChanged = applyExpiryToUser(user);
    if (expiryChanged) await user.save();

    const ent = (user.entitlements || []).map((e) => ({
      productKey: e.productKey,
      status: e.status,
      expiresAt: normalizeExpiry(e.expiresAt),
    }));

    // Break-glass God account: the desktop apps re-check entitlement client-side
    // against this list (AuthClient.EnsureEntitledAsync), so returning only real
    // rows locked God out of every product it was never explicitly granted —
    // even though /auth/login and requireEntitlement both let it through.
    //
    // Synthesized here only, never written to the account.
    //
    // God access does not expire. It still carries a date because the expiry
    // field is not optional in practice: AuthClient.EnsureEntitledAsync treats
    // a missing or unparseable expiresAt as "not entitled", so an absent value
    // would lock God out rather than grant it forever. GOD_NEVER_EXPIRES is the
    // far-future stand-in for "no expiry" — revoke by clearing isGod or
    // removing the email from GOD_ACCOUNT_EMAILS, not by waiting for a date.
    if (isGodUser(req.user)) {
      const held = new Set(ent.map((e) => String(e.productKey).toLowerCase()));
      const expiresAt = GOD_NEVER_EXPIRES;

      const products = await Product.find(
        { isCourse: { $ne: true } },
        { key: 1 },
      ).lean();

      for (const p of products) {
        const key = String(p.key || "").toLowerCase();
        if (!key || held.has(key)) continue;
        ent.push({
          productKey: p.key,
          status: "active",
          expiresAt: normalizeExpiry(expiresAt),
        });
      }
    }

    res.json(ent);
  }),
);

router.get(
  "/entitlements-v2",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id, {
      entitlements: 1,
      refreshVersion: 1,
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    await ensureUserEntitlementsMigrated(user);
    const expiryChanged = applyExpiryToUser(user);
    if (expiryChanged) await user.save();

    return res.json({
      ok: true,
      refreshVersion: user.refreshVersion || 1,
      entitlements: (user.entitlements || []).map(toEntitlementV2),
    });
  }),
);

/* web summary ✅ UPDATED */
router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id, {
      entitlements: 1,
      email: 1,
      refreshVersion: 1,
      createdAt: 1,
    });
    if (!user) return res.status(404).json({ error: "User missing" });

    await ensureUserEntitlementsMigrated(user);
    const expiryChanged = applyExpiryToUser(user);
    if (expiryChanged) await user.save();

    // 1) Entitlements (base)
    const entsBase = (user.entitlements || []).map((e) => ({
      ...toEntitlementV2(e),
      isCourse: false,
    }));

    const keys = Array.from(
      new Set(entsBase.map((e) => e.productKey).filter(Boolean)),
    );

    // 2) Product meta for those keys (name, isCourse, cards)
    const prods = keys.length
      ? await Product.find({ key: { $in: keys } })
          .select("key name blurb thumbnailUrl price isCourse")
          .lean()
      : [];

    const prodByKey = Object.fromEntries((prods || []).map((p) => [p.key, p]));

    // 3) Attach isCourse + productName to entitlements (so Dashboard tabs render properly)
    // Feature grants have no Product doc — give them a readable display name.
    //
    // Both BoQ Import keys, from the canonical constants rather than typed.
    // The feature shipped as "quiv-boq-import" and was renamed to "boq-import"
    // when it grew past Quiv; this table only listed the legacy one, so an
    // account granted the CURRENT key saw the raw string "boq-import" where a
    // name should be. Sourcing the keys from boqImportAccess.js is what stops
    // the two drifting apart again.
    const FEATURE_GRANT_NAMES = {
      [BOQ_IMPORT_ENTITLEMENT]: "Excel BoQ Import (feature access)",
      [BOQ_IMPORT_LEGACY_ENTITLEMENT]: "Excel BoQ Import (feature access)",
      ai: "ADLM AI Add-on (cost intelligence)",
    };
    let entitlements = entsBase.map((e) => {
      const p = prodByKey[e.productKey] || null;
      return {
        ...e,
        isCourse: !!p?.isCourse,
        productName:
          p?.name || FEATURE_GRANT_NAMES[e.productKey] || e.productKey,
      };
    });

    // 4) Attach latest billingInterval + installFee for each productKey (best-effort)
    //    This makes SubscriptionsTab show billing + install fee if available.
    const purchaseQ =
      keys.length === 0
        ? null
        : {
            userId: req.user._id,
            $and: [
              {
                $or: [
                  { status: "approved" },
                  { paid: true }, // fallback if you use paid=true
                ],
              },
              {
                $or: [
                  { productKey: { $in: keys } },
                  { "lines.productKey": { $in: keys } },
                ],
              },
            ],
          };

    const purchases = purchaseQ
      ? await Purchase.find(purchaseQ, {
          productKey: 1,
          lines: 1,
          decidedAt: 1,
          createdAt: 1,
          currency: 1,
        })
          .sort({ decidedAt: -1, createdAt: -1 })
          .lean()
      : [];

    const latestByKey = {}; // { [key]: { billingInterval, installFee, currency } }

    for (const p of purchases) {
      // line-based purchases
      if (Array.isArray(p.lines) && p.lines.length) {
        for (const ln of p.lines) {
          const k = String(ln?.productKey || "").trim();
          if (!k || !keys.includes(k)) continue;
          if (latestByKey[k]) continue;

          latestByKey[k] = {
            billingInterval: ln?.billingInterval || "",
            installFee: Number(ln?.install ?? 0) || 0,
            currency: p?.currency || "NGN",
          };
        }
      } else {
        // single productKey purchase
        const k = String(p?.productKey || "").trim();
        if (!k || !keys.includes(k)) continue;
        if (latestByKey[k]) continue;

        latestByKey[k] = {
          billingInterval: "", // unknown (no lines)
          installFee: 0,
          currency: p?.currency || "NGN",
        };
      }
    }

    entitlements = entitlements.map((e) => {
      const meta = latestByKey[e.productKey];
      if (!meta) return e;
      return {
        ...e,
        billingInterval: meta.billingInterval || e.billingInterval || "",
        installFee: meta.installFee ?? e.installFee ?? 0,
        currency: meta.currency || e.currency || "NGN",
      };
    });

    // 5) Products array for "My Products" tab (cards)
    //    Dashboard expects: _id, key, name, blurb, thumbnailUrl, price, isActive
    const entByKey = Object.fromEntries(
      entitlements.map((e) => [e.productKey, e]),
    );
    const products = (prods || []).map((p) => {
      const e = entByKey[p.key];
      const st = String(e?.status || "inactive").toLowerCase();
      const isActive = st === "active" && !e?.isExpired;

      return {
        _id: p._id,
        key: p.key,
        name: p.name,
        blurb: p.blurb || "",
        thumbnailUrl: p.thumbnailUrl || "",
        price: p.price || {},
        isCourse: !!p.isCourse,
        isActive,
      };
    });

    // 6) Installation requests (existing)
    const installs = await Purchase.find(
      {
        userId: req.user._id,
        status: "approved",
        "installation.status": { $in: ["pending", "complete"] },
      },
      {
        lines: 1,
        productKey: 1,
        status: 1,
        installation: 1,
        decidedAt: 1,
        totalAmount: 1,
        currency: 1,
        licenseType: 1,
        organization: 1,
      },
    )
      .sort({ decidedAt: -1 })
      .lean();

    const installKeys = Array.from(
      new Set(
        (installs || [])
          .flatMap((p) =>
            Array.isArray(p.lines) && p.lines.length
              ? p.lines.map((l) => l.productKey)
              : [p.productKey],
          )
          .filter(Boolean),
      ),
    );

    const installProducts = installKeys.length
      ? await Product.find({ key: { $in: installKeys } })
          .select("key name")
          .lean()
      : [];

    const prodNameByKey = Object.fromEntries(
      (installProducts || []).map((x) => [x.key, x.name]),
    );

    const installsEnriched = (installs || []).map((p) => {
      const firstLine =
        Array.isArray(p.lines) && p.lines.length ? p.lines[0] : null;
      const key = firstLine?.productKey || p.productKey || "";
      const name = firstLine?.name || prodNameByKey[key] || key || "";

      return {
        ...p,
        installationProductKey: key,
        installationProductName: name,
      };
    });

    // 7) Counts/stats used on Dashboard
    const [ordersCount, globalSettings] = await Promise.all([
      Purchase.countDocuments({ userId: req.user._id }),
      Setting.findOne({ key: "global" })
        .select("installerHubUrl installerHubVideoUrl installerHubGuideUrl")
        .lean(),
    ]);

    return res.json({
      email: user.email,
      refreshVersion: user.refreshVersion || 1,

      // ✅ Dashboard expects these
      products, // for "My Products" tab + Active Products stat
      entitlements, // for Subscriptions tab (now includes productName/isCourse/billingInterval/installFee)
      installations: installsEnriched,

      // Installer Hub settings (global, admin-configured)
      installerHub: {
        downloadUrl: globalSettings?.installerHubUrl || "",
        videoUrl: globalSettings?.installerHubVideoUrl || "",
        // Always present — falls back to the copy bundled with the site.
        guideUrl: resolveUserGuideUrl(globalSettings?.installerHubGuideUrl),
      },

      ordersCount, // used by Dashboard total orders stat
      totalOrders: ordersCount, // legacy alias (safe)

      tutorialsWatched: 0, // keep field so UI doesn't break (can wire later)
      membership: {
        startedAt: user.createdAt || null,
      },
    });
  }),
);

// Profile details
router.get(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.user._id).lean();
    if (!u) return res.status(404).json({ error: "User missing" });

    const {
      email,
      username,
      avatarUrl,
      role,
      zone,
      firstName,
      lastName,
      whatsapp,
      location,
      firmName,
    } = u;

    return res.json({
      email,
      username,
      avatarUrl,
      role,
      zone,
      zones: ZONES,
      // The state is what the user actually picks; the zone is derived from it.
      // Both are returned because older desktop builds still read zone alone.
      state: u.state || null,
      states: STATES,
      firstName: firstName || "",
      lastName: lastName || "",
      whatsapp: whatsapp || "",
      location: location || "",
      firmName: firmName || "",
      nameLockedForCertificate: !!u.certificateNameLockedAt,
      stepUpEnabled: !!u.security?.stepUpEnabled,
      // Falls back to the schema defaults rather than to false: an account
      // created before this field existed must not read as "send me nothing".
      notifications: {
        productUpdates: u.notifications?.productUpdates ?? true,
        billing: u.notifications?.billing ?? true,
        seatsAndMembers: u.notifications?.seatsAndMembers ?? true,
        coursesAndEvents: u.notifications?.coursesAndEvents ?? false,
      },
    });
  }),
);

router.post(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      username,
      avatarUrl,
      zone,
      state,
      firstName,
      lastName,
      whatsapp,
      location,
      firmName,
      stepUpEnabled,
    } = req.body || {};
    const u = await User.findById(req.user._id);
    if (!u) return res.status(404).json({ error: "User missing" });

    if (username) {
      const exists = await User.findOne({ username, _id: { $ne: u._id } });
      if (exists)
        return res.status(409).json({ error: "Username already taken" });
    }

    if (username !== undefined) u.username = username;
    if (avatarUrl !== undefined) u.avatarUrl = avatarUrl;

    // State wins over zone. A state implies exactly one zone, so deriving it here
    // is the only way the two can never drift apart: a user whose state says Kano
    // and whose zone says south_west would be priced against Lagos with nothing on
    // screen to explain why.
    if (state !== undefined) {
      const ns = normalizeState(state);
      if (!ns) return res.status(400).json({ error: "Invalid state" });
      u.state = ns;
      u.zone = zoneForState(ns);
      u.refreshVersion = (u.refreshVersion || 0) + 1;
    } else if (zone !== undefined) {
      const nz = normalizeZone(zone);
      if (!nz) return res.status(400).json({ error: "Invalid zone" });
      u.zone = nz;
      // The stored state is no longer necessarily inside the chosen zone, and a
      // stale one would override the zone the user just picked on every sync.
      if (u.state && zoneForState(u.state) !== nz) u.state = null;
      u.refreshVersion = (u.refreshVersion || 0) + 1;
    }

    // If certificate name is locked, reject firstName/lastName changes
    if (u.certificateNameLockedAt) {
      if (
        (firstName !== undefined && String(firstName || "").trim() !== u.firstName) ||
        (lastName !== undefined && String(lastName || "").trim() !== u.lastName)
      ) {
        return res.status(403).json({
          error:
            "Your name is locked because it was used on a certificate. Contact support to request a change.",
        });
      }
    } else {
      if (firstName !== undefined) u.firstName = String(firstName || "").trim();
      if (lastName !== undefined) u.lastName = String(lastName || "").trim();
    }
    if (whatsapp !== undefined)
      u.whatsapp = String(whatsapp || "").replace(/[^\d+]/g, "");
    if (location !== undefined) u.location = String(location || "").trim();
    if (firmName !== undefined) u.firmName = String(firmName || "").trim();

    if (stepUpEnabled !== undefined) {
      u.security = u.security || {};
      u.security.stepUpEnabled = !!stepUpEnabled;
    }

    await u.save();

    return res.json({
      user: {
        email: u.email,
        username: u.username,
        avatarUrl: u.avatarUrl,
        role: u.role,
        zone: u.zone,
        state: u.state || null,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        whatsapp: u.whatsapp || "",
        location: u.location || "",
        firmName: u.firmName || "",
        stepUpEnabled: !!u.security?.stepUpEnabled,
      },
    });
  }),
);

/* ── Certificate name (locked after first set) ── */

router.get(
  "/certificate-name",
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.user._id).lean();
    if (!u) return res.status(404).json({ error: "User missing" });
    return res.json({
      certificateFirstName: u.certificateFirstName || "",
      certificateLastName: u.certificateLastName || "",
      locked: !!u.certificateNameLockedAt,
      lockedAt: u.certificateNameLockedAt || null,
    });
  }),
);

router.post(
  "/certificate-name",
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.user._id);
    if (!u) return res.status(404).json({ error: "User missing" });

    // Already locked — reject changes
    if (u.certificateNameLockedAt) {
      return res.status(403).json({
        error: "Certificate name is already locked and cannot be changed.",
        certificateFirstName: u.certificateFirstName,
        certificateLastName: u.certificateLastName,
        locked: true,
      });
    }

    const { firstName, lastName } = req.body || {};
    const fn = String(firstName || "").trim();
    const ln = String(lastName || "").trim();

    if (!fn || !ln) {
      return res.status(400).json({ error: "First name and last name are required." });
    }

    // Lock the certificate name
    u.certificateFirstName = fn;
    u.certificateLastName = ln;
    u.certificateNameLockedAt = new Date();

    // Also update profile firstName/lastName to match
    u.firstName = fn;
    u.lastName = ln;

    await u.save();

    return res.json({
      certificateFirstName: u.certificateFirstName,
      certificateLastName: u.certificateLastName,
      locked: true,
      lockedAt: u.certificateNameLockedAt,
      user: {
        email: u.email,
        username: u.username,
        avatarUrl: u.avatarUrl,
        role: u.role,
        zone: u.zone,
        firstName: u.firstName,
        lastName: u.lastName,
        whatsapp: u.whatsapp || "",
      },
    });
  }),
);

/* ✅ Orders list (Dashboard uses this) */
router.get(
  "/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      50,
    );
    const skip = (page - 1) * limit;

    const q = { userId: req.user._id };

    const [total, items] = await Promise.all([
      Purchase.countDocuments(q),
      Purchase.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const pages = Math.max(Math.ceil(total / limit), 1);

    return res.json({
      items,
      pagination: {
        page,
        pages,
        total,
        limit,
        hasPrev: page > 1,
        hasNext: page < pages,
      },
    });
  }),
);

/* ✅ Single order (Receipt page uses this) */
router.get(
  "/orders/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await Purchase.findOne({
      _id: id,
      userId: req.user._id,
    }).lean();

    if (!order) return res.status(404).json({ message: "Order not found" });

    return res.json(order);
  }),
);

/* ──────────── Client Invoices ──────────── */

// Build $or conditions to match invoices for the logged-in user.
// Uses: userId, email, username, full name — every possible way to match.
async function buildInvoiceOrQuery(reqUser) {
  const or = [];

  // 1) Extract from JWT
  const rawId = String(reqUser?._id || reqUser?.id || "").trim();
  const jwtEmail = String(reqUser?.email || "").trim().toLowerCase();
  const jwtUsername = String(reqUser?.username || "").trim();

  // 2) Look up user in DB for canonical data
  let dbId = null;
  let dbEmail = "";
  let dbUsername = "";
  let dbFullName = "";

  if (rawId) {
    try {
      const u = await User.findById(rawId)
        .select("_id email username firstName lastName")
        .lean();
      if (u) {
        dbId = u._id;
        dbEmail = String(u.email || "").trim().toLowerCase();
        dbUsername = String(u.username || "").trim();
        const fn = String(u.firstName || "").trim();
        const ln = String(u.lastName || "").trim();
        dbFullName = [fn, ln].filter(Boolean).join(" ");
      }
    } catch { /* ignore - maybe rawId isn't a valid ObjectId */ }
  }

  // 3) Match by clientUserId (try both ObjectId and string)
  if (dbId) or.push({ clientUserId: dbId });
  if (rawId) or.push({ clientUserId: rawId });

  // 4) Match by clientEmail
  const emails = [...new Set([jwtEmail, dbEmail].filter(Boolean))];
  for (const em of emails) {
    or.push({ clientEmail: em });
  }

  // 5) Match by clientName (username or full name)
  const names = [...new Set([jwtUsername, dbUsername, dbFullName].filter(Boolean))];
  for (const nm of names) {
    const safe = nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    or.push({ clientName: { $regex: safe, $options: "i" } });
  }

  return or;
}

// Debug endpoint
router.get(
  "/invoices/debug",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const rawId = String(req.user?._id || req.user?.id || "");
      const jwtEmail = String(req.user?.email || "").toLowerCase();

      let dbUser = null;
      try {
        if (rawId) dbUser = await User.findById(rawId).select("_id email username firstName lastName").lean();
      } catch { /* ignore */ }

      const or = await buildInvoiceOrQuery(req.user);

      const allInvoices = await Invoice.find()
        .select("clientEmail clientName clientUserId status invoiceNumber")
        .lean();

      let matched = [];
      if (or.length) {
        matched = await Invoice.find({ $or: or, status: { $ne: "draft" } })
          .select("invoiceNumber")
          .lean();
      }

      return res.json({
        you: {
          rawId,
          jwtEmail,
          dbEmail: dbUser?.email || null,
          dbUsername: dbUser?.username || null,
          dbName: [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ") || null,
          dbId: dbUser?._id ? String(dbUser._id) : null,
        },
        orConditionsCount: or.length,
        allInvoices: allInvoices.map((inv) => ({
          num: inv.invoiceNumber,
          email: inv.clientEmail || "",
          name: inv.clientName || "",
          uid: inv.clientUserId ? String(inv.clientUserId) : null,
          status: inv.status,
        })),
        wouldReturn: matched.map((m) => m.invoiceNumber),
      });
    } catch (e) {
      return res.status(500).json({ error: e.message, stack: String(e.stack).split("\n").slice(0, 5) });
    }
  }),
);

// List invoices
router.get(
  "/invoices",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Prevent browser from caching empty responses
    res.set("Cache-Control", "no-store");

    try {
      const or = await buildInvoiceOrQuery(req.user);
      if (!or.length) return res.json({ ok: true, invoices: [] });

      const invoices = await Invoice.find({ $or: or, status: { $ne: "draft" } })
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ ok: true, invoices });
    } catch (e) {
      console.error("/me/invoices error:", e);
      return res.json({ ok: true, invoices: [], _error: e.message });
    }
  }),
);

// Single invoice detail
router.get(
  "/invoices/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const or = await buildInvoiceOrQuery(req.user);
      if (!or.length) return res.status(404).json({ error: "Invoice not found" });

      const inv = await Invoice.findOne({
        _id: req.params.id,
        $or: or,
        status: { $ne: "draft" },
      }).lean();

      if (!inv) return res.status(404).json({ error: "Invoice not found" });
      return res.json({ ok: true, invoice: inv });
    } catch (e) {
      console.error("/me/invoices/:id error:", e);
      return res.status(500).json({ error: e.message });
    }
  }),
);

// Client PDF download — proxies to admin PDF generator
router.get(
  "/invoices/:id/pdf",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const or = await buildInvoiceOrQuery(req.user);
      if (!or.length) return res.status(404).json({ error: "Invoice not found" });

      const inv = await Invoice.findOne({
        _id: req.params.id,
        $or: or,
        status: { $ne: "draft" },
      }).lean();

      if (!inv) return res.status(404).json({ error: "Invoice not found" });

      // Import PDF generation deps
      const PDFDocument = (await import("pdfkit")).default;
      let QRCode;
      try { QRCode = (await import("qrcode")).default; } catch { /* ignore */ }

      let qrDataUrl = "";
      if (QRCode) {
        try {
          qrDataUrl = await QRCode.toDataURL("https://www.adlmstudio.net", { width: 80, margin: 1 });
        } catch { /* ignore */ }
      }

      const doc = new PDFDocument({ size: "A4", margin: 40 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${inv.invoiceNumber}.pdf"`);
      doc.pipe(res);

      const leftCol = 40;
      const pageWidth = 595.28 - 80;
      const curr = inv.currency === "USD" ? "$" : "N";
      const fmtN = (n) => `${curr}${Number(n || 0).toLocaleString()}`;

      // Header
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#091E39")
        .text("ADLM Studio", leftCol, 40);
      doc.fontSize(28).font("Helvetica-Bold").fillColor("#091E39")
        .text("Invoice", 350, 36, { align: "right", width: pageWidth - 350 + leftCol });
      doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e")
        .text(`NO: ${inv.invoiceNumber}`, 350, 68, { align: "right", width: pageWidth - 350 + leftCol });

      // Invoice To
      let y = 90;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#3e3e3e").text("INVOICE TO:", leftCol, y);
      const toX = leftCol + 75;
      doc.fontSize(10).font("Helvetica").fillColor("#3e3e3e");
      if (inv.clientName) { doc.text(inv.clientName, toX, y); y += 14; }
      if (inv.clientOrganization) { doc.text(inv.clientOrganization, toX, y); y += 14; }
      if (inv.clientAddress) { doc.text(inv.clientAddress, toX, y); y += 14; }

      y += 4;
      const dayjs = (await import("dayjs")).default;
      if (inv.invoiceDate) doc.text(`Date: ${dayjs(inv.invoiceDate).format("MMMM D, YYYY")}`, leftCol, y);
      if (inv.dueDate) doc.text(`Due: ${dayjs(inv.dueDate).format("MMMM D, YYYY")}`, leftCol + 200, y);

      // Separator
      y += 18;
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).strokeColor("#091E39").lineWidth(1.5).stroke();
      y += 10;

      // Table header
      const colSN = leftCol, colDesc = leftCol + 35, colQty = 330, colUnit = 370, colRate = 415, colAmt = 475;
      doc.roundedRect(leftCol, y, pageWidth, 24, 4).fill("#091E39");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
      doc.text("S/N", colSN + 4, y + 7, { width: 30, align: "center" });
      doc.text("DESCRIPTION", colDesc, y + 7, { width: colQty - colDesc });
      doc.text("QTY.", colQty, y + 7, { width: 35, align: "center" });
      doc.text("UNIT", colUnit, y + 7, { width: 40, align: "center" });
      doc.text("RATE", colRate, y + 7, { width: 55, align: "right" });
      doc.text("AMOUNT", colAmt, y + 7, { width: 65, align: "right" });
      y += 24;

      // Rows
      const rowH = 28;
      for (let i = 0; i < (inv.items || []).length; i++) {
        const item = inv.items[i];
        if (y + rowH > 720) { doc.addPage(); y = 40; }
        const bg = i % 2 === 1 ? "#e5e5e5" : "#ffffff";
        const clr = i % 2 === 1 ? "#091E39" : "#262626";
        doc.rect(leftCol, y, pageWidth, rowH).fill(bg);
        doc.fontSize(9).font("Helvetica").fillColor(clr);
        doc.text(`${i + 1}.`, colSN + 4, y + 8, { width: 30, align: "center" });
        doc.text(item.description || "—", colDesc, y + 8, { width: colQty - colDesc - 5 });
        doc.text(String(item.qty || 1), colQty, y + 8, { width: 35, align: "center" });
        doc.text("Nr", colUnit, y + 8, { width: 40, align: "center" });
        doc.text(fmtN(item.unitPrice), colRate, y + 8, { width: 55, align: "right" });
        doc.text(fmtN(item.total), colAmt, y + 8, { width: 65, align: "right" });
        y += rowH;
      }

      // Summary bar
      y += 6;
      const summaryW = 220, summaryX = leftCol + pageWidth - summaryW;
      doc.roundedRect(summaryX, y, summaryW, 24, 4).fill("#091E39");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
      doc.text("Summary Total:", summaryX + 12, y + 7, { width: 100 });
      doc.text(fmtN(inv.total), summaryX + 120, y + 7, { width: 88, align: "right" });
      y += 24;

      // Discount/tax
      const dp = Number(inv.discountPercent || 0);
      const tp = Number(inv.taxPercent || 0);
      if (dp > 0 || tp > 0) {
        y += 4;
        doc.fontSize(8).font("Helvetica").fillColor("#555");
        doc.text(`Subtotal: ${fmtN(inv.subtotal)}`, summaryX, y, { width: summaryW, align: "right" }); y += 12;
        if (dp > 0) { doc.text(`Discount (${dp}%): -${fmtN(inv.discountAmount)}`, summaryX, y, { width: summaryW, align: "right" }); y += 12; }
        if (tp > 0) { doc.text(`Tax (${tp}%): +${fmtN(inv.taxAmount)}`, summaryX, y, { width: summaryW, align: "right" }); y += 12; }
      }

      // Separator
      y += 10;
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).strokeColor("#d0d0d0").lineWidth(0.5).stroke();
      y += 14;

      // Payment details + QR
      if (y + 80 > 720) { doc.addPage(); y = 40; }
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#091E39").text("Payment details:", leftCol, y); y += 14;
      doc.fontSize(9).font("Helvetica").fillColor("#091E39");
      doc.text("Account no: 1634998770", leftCol, y); y += 12;
      doc.text("Name: ADLM Studio", leftCol, y); y += 12;
      doc.text("Bank: Access Bank", leftCol, y);
      if (qrDataUrl) {
        try { doc.image(qrDataUrl, leftCol + pageWidth - 80, y - 36, { width: 70, height: 70 }); } catch { /* ignore */ }
      }
      y += 24;

      // Terms
      if (inv.terms) {
        if (y + 40 > 740) { doc.addPage(); y = 40; }
        y += 8;
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#091E39").text("Terms:", leftCol, y); y += 14;
        doc.fontSize(9).font("Helvetica").fillColor("#091E39").text(inv.terms, leftCol, y, { width: pageWidth * 0.6 });
      }

      doc.end();
    } catch (e) {
      console.error("/me/invoices/:id/pdf error:", e);
      if (!res.headersSent) return res.status(500).json({ error: "PDF generation failed" });
    }
  }),
);

// Client receipt PDF — only for the client's own paid invoices.
router.get(
  "/invoices/:id/receipt/pdf",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const or = await buildInvoiceOrQuery(req.user);
      if (!or.length) return res.status(404).json({ error: "Invoice not found" });

      const inv = await Invoice.findOne({
        _id: req.params.id,
        $or: or,
        status: "paid",
      });

      if (!inv) {
        return res
          .status(404)
          .json({ error: "Paid invoice not found" });
      }

      // Backfill receipt metadata if this invoice was marked paid before the
      // receipt feature existed (or before an admin first opened its receipt).
      await inv.applyPaidMetadata();
      if (inv.isModified()) await inv.save();

      const { renderReceipt, receiptQrDataUrl } = await import("../util/receiptPdf.js");
      const PDFDocument = (await import("pdfkit")).default;
      const qrDataUrl = await receiptQrDataUrl();

      const doc = new PDFDocument({ size: "A4", margin: 40 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${inv.receiptNumber || "receipt"}.pdf"`,
      );
      doc.pipe(res);
      renderReceipt(doc, inv.toObject(), qrDataUrl);
      doc.end();
    } catch (e) {
      console.error("/me/invoices/:id/receipt/pdf error:", e);
      if (!res.headersSent) return res.status(500).json({ error: "PDF generation failed" });
    }
  }),
);

/* ──────────── Physical Training Date Confirmation ──────────── */

// Authenticated confirmation (from dashboard)
router.post(
  "/orders/:id/confirm-training-date",
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!purchase) return res.status(404).json({ error: "Order not found" });

    if (!purchase.physicalTraining?.requested) {
      return res.status(400).json({ error: "No physical training on this order" });
    }
    if (purchase.physicalTraining.status !== "date_proposed") {
      return res.status(400).json({ error: "No date has been proposed yet" });
    }

    purchase.physicalTraining.confirmedByUser = true;
    purchase.physicalTraining.confirmedAt = new Date();
    purchase.physicalTraining.status = "confirmed";
    purchase.physicalTraining.confirmToken = undefined;
    await purchase.save();

    return res.json({ ok: true, message: "Training date confirmed" });
  }),
);

// ── Storage usage endpoint ────────────────────────────────────────────────
// Returns per-product project counts and limits for the calling user.
// Used by the dashboard and projects view to render storage bars.
const PERSONAL_PROJECT_LIMIT = Number(process.env.PERSONAL_PROJECT_LIMIT || 30);
const ORG_PROJECT_LIMIT = Number(process.env.ORG_PROJECT_LIMIT || 50);

function isMaterialsKey(k) {
  return String(k || "").endsWith("-materials");
}

// Products that hold takeoff projects (and therefore have a project/storage
// cap). Everything else the user might be entitled to — RateGen, courses,
// etc. — has no project bucket and must not render a storage bar.
const PROJECT_PRODUCT_KEYS = new Set([
  "revit",
  "planswift",
  "mep",
  "civil3d",
  "revitmep",
  // ArchiCAD projects are ordinary TakeoffProject documents (productKey
  // "archicad", listed by GET /api/archicad/projects), so they consume the
  // same project cap. Omitting the key meant the dashboard rendered no
  // projects bar for ArchiCAD at all — a user with real ArchiCAD projects saw
  // nothing and concluded they had none.
  "archicad",
]);

router.get(
  "/storage",
  requireAuth,
  asyncHandler(async (req, res) => {
    // req.user._id is a JWT string — aggregation does NOT auto-cast to
    // ObjectId (unlike Mongoose queries), so the $match must use a real
    // ObjectId or every count silently comes back 0.
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const user = await User.findById(userId, { entitlements: 1 }).lean();
    const ents = user?.entitlements || [];

    const isOrg = ents.some(
      (e) => e?.licenseType === "organization" && e?.status === "active",
    );
    const baseLimit = isOrg ? ORG_PROJECT_LIMIT : PERSONAL_PROJECT_LIMIT;
    const licenseType = isOrg ? "organization" : "personal";

    // Active, project-bearing product keys the user is entitled to. Excludes
    // materials siblings (no own bucket) and non-project products like
    // RateGen (which shouldn't show a projects bar at all).
    const productKeys = [
      ...new Set(
        ents
          .filter(
            (e) =>
              e?.status === "active" &&
              e?.productKey &&
              !isMaterialsKey(e.productKey) &&
              PROJECT_PRODUCT_KEYS.has(e.productKey),
          )
          .map((e) => e.productKey),
      ),
    ];

    // Count projects per product in one aggregation. Excludes PM-tracker-only
    // projects — those live in a separate bucket with their own limit and
    // aren't shown in the takeoffs list, so they must not inflate the count.
    const counts = productKeys.length
      ? await TakeoffProject.aggregate([
          {
            $match: {
              userId,
              productKey: { $in: productKeys },
              pmTrackerOnly: { $ne: true },
            },
          },
          { $group: { _id: "$productKey", count: { $sum: 1 } } },
        ])
      : [];

    const countByKey = Object.fromEntries(
      counts.map((c) => [c._id, c.count]),
    );

    // Fetch per-product storage slot prices set by admin
    const productDocs = productKeys.length
      ? await Product.find(
          { key: { $in: productKeys } },
          { key: 1, storageSlotPriceNGN: 1 },
        ).lean()
      : [];
    const slotPriceByKey = Object.fromEntries(
      productDocs.map((p) => [p.key, p.storageSlotPriceNGN ?? null]),
    );

    // Build per-product usage, applying extraProjectSlots per entitlement
    const usage = Object.fromEntries(
      productKeys.map((k) => {
        const ent = ents.find((e) => e?.productKey === k && e?.status === "active");
        const extra = Number(ent?.extraProjectSlots || 0);
        return [
          k,
          {
            used: countByKey[k] || 0,
            limit: baseLimit + extra,
            extraSlots: extra,
            // null → client falls back to 3% of active subscription price
            slotUpgradePrice: slotPriceByKey[k] ?? null,
          },
        ];
      }),
    );

    return res.json({ licenseType, baseLimit, usage });
  }),
);

// GET /me/portfolio — all user projects across products (excluding PM tracker)
router.get(
  "/portfolio",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const projects = await TakeoffProject.aggregate([
      { $match: { userId, pmTrackerOnly: { $ne: true } } },
      {
        $project: {
          name: 1,
          productKey: 1,
          slug: 1,
          updatedAt: 1,
          publicShareEnabled: 1,
          itemCount: { $size: { $ifNull: ["$items", []] } },
        },
      },
      { $sort: { productKey: 1, updatedAt: -1 } },
    ]);
    return res.json({ projects });
  }),
);

// GET /me/projects-rollup — every project the user owns OR collaborates on,
// across ALL products (QUIV/HERON/MEP/Civil + their -materials siblings),
// each with the same cost/valuation rollup the per-product /projects/:key
// list produces. Powers the Portfolio Dashboard so materials-only products
// (HERON, Civil, Revit-MEP) that have no dedicated list route still appear.
//
// The "marked" status field differs by product: materials projects track
// `purchased`, everything else tracks `completed`. We compute an isMaterials
// flag per document and branch the item-level condition on it, so a single
// pipeline can span every product correctly.
router.get(
  "/projects-rollup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

    const num = (path) => ({
      $convert: { input: path, to: "double", onError: 0, onNull: 0 },
    });
    const markedFlag = {
      $eq: [
        {
          $ifNull: [
            { $cond: ["$isMaterials", "$$item.purchased", "$$item.completed"] },
            false,
          ],
        },
        true,
      ],
    };
    const lineAmount = { $multiply: [num("$$item.qty"), num("$$item.rate")] };
    const valuationFactor = {
      $cond: [
        markedFlag,
        1,
        { $divide: [{ $max: [0, { $min: [100, num("$$item.percentComplete")] }] }, 100] },
      ],
    };

    const list = await TakeoffProject.aggregate([
      {
        $match: {
          pmTrackerOnly: { $ne: true },
          $or: [{ userId }, { "collaborators.userId": userId }],
        },
      },
      {
        $addFields: {
          safeItems: { $ifNull: ["$items", []] },
          // Materials buckets end in "-materials" / "-material".
          isMaterials: {
            $regexMatch: {
              input: { $toLower: { $ifNull: ["$productKey", ""] } },
              regex: "-material",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          slug: 1,
          productKey: 1,
          publicShareEnabled: 1,
          updatedAt: 1,
          version: 1,
          shared: { $ne: ["$userId", userId] },
          itemCount: { $size: "$safeItems" },
          markedCount: {
            $size: {
              $filter: { input: "$safeItems", as: "item", cond: markedFlag },
            },
          },
          totalCost: {
            $sum: { $map: { input: "$safeItems", as: "item", in: lineAmount } },
          },
          valuedAmount: {
            $sum: {
              $map: {
                input: "$safeItems",
                as: "item",
                in: { $multiply: [lineAmount, valuationFactor] },
              },
            },
          },
          progressShare: {
            $sum: {
              $map: { input: "$safeItems", as: "item", in: valuationFactor },
            },
          },
        },
      },
      {
        $addFields: {
          remainingAmount: { $subtract: ["$totalCost", "$valuedAmount"] },
          progressPercent: {
            $cond: [
              { $gt: ["$itemCount", 0] },
              { $multiply: [{ $divide: ["$progressShare", "$itemCount"] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { updatedAt: -1 } },
    ]);

    return res.json({ projects: list });
  }),
);

// ── Project activity log ─────────────────────────────────────────────────────
// The signed-in user's activity feed: every logged event on projects they OWN
// (including actions by their collaborators) plus their own actions on projects
// shared with them. Powers the Profile "Project Activity" tab + its report.
function activityScope(uid) {
  return { $or: [{ ownerId: uid }, { actorId: uid }] };
}

// GET /me/activity — paginated feed with optional category / project filters.
router.get(
  "/activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = { ...activityScope(uid) };
    if (req.query.category) filter.category = String(req.query.category).toLowerCase();
    if (req.query.projectId && mongoose.Types.ObjectId.isValid(String(req.query.projectId))) {
      filter.projectId = new mongoose.Types.ObjectId(String(req.query.projectId));
    }

    const [items, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    return res.json({
      items,
      pagination: {
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        total,
        limit,
        hasPrev: page > 1,
        hasNext: page * limit < total,
      },
    });
  }),
);

// GET /me/activity/report — bounded payload for the printable activity report:
// counts by category + up to 1000 recent entries.
router.get(
  "/activity/report",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const scope = activityScope(uid);

    const [items, byCategory, total] = await Promise.all([
      ActivityLog.find(scope).sort({ createdAt: -1 }).limit(1000).lean(),
      ActivityLog.aggregate([
        { $match: scope },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.countDocuments(scope),
    ]);

    const me = await User.findById(uid, {
      firstName: 1,
      lastName: 1,
      username: 1,
      email: 1,
      firmName: 1,
    }).lean();

    return res.json({
      report: {
        type: "activity",
        generatedAt: new Date().toISOString(),
        user: {
          name:
            [me?.firstName, me?.lastName].filter(Boolean).join(" ") ||
            me?.username ||
            "",
          email: me?.email || "",
          firm: me?.firmName || "",
        },
        total,
        byCategory: byCategory.map((c) => ({ category: c._id || "other", count: c.count })),
        items,
      },
    });
  }),
);

// ── PM Tracker (QUIV-exclusive standalone PM projects) ───────────────────────
const PM_TRACKER_LIMIT = 10;

async function assertQuivEntitlement(userId) {
  const u = await User.findById(userId, { entitlements: 1 }).lean();
  if (!u) return false;
  const e = (u.entitlements || []).find(
    (x) => x.productKey === "revit" && x.status === "active",
  );
  if (!e) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() < Date.now()) return false;
  return true;
}

// GET /me/pm-tracker — list this user's PM tracker projects
router.get(
  "/pm-tracker",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const projects = await TakeoffProject.aggregate([
      { $match: { userId, productKey: "revit", pmTrackerOnly: true } },
      {
        $project: {
          name: 1,
          slug: 1,
          updatedAt: 1,
          createdAt: 1,
          publicShareEnabled: 1,
          publicToken: 1,
          taskCount: { $size: { $ifNull: ["$projectManagement.tasks", []] } },
          riskCount: { $size: { $ifNull: ["$projectManagement.risks", []] } },
          issueCount: { $size: { $ifNull: ["$projectManagement.issues", []] } },
        },
      },
      { $sort: { updatedAt: -1 } },
    ]);
    return res.json({ projects, limit: PM_TRACKER_LIMIT, used: projects.length });
  }),
);

// POST /me/pm-tracker — create a PM tracker project
router.post(
  "/pm-tracker",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const hasQuiv = await assertQuivEntitlement(userId);
    if (!hasQuiv) {
      return res.status(403).json({
        error: "A QUIV (Revit) subscription is required to use the PM Tracker.",
        code: "QUIV_REQUIRED",
      });
    }
    const used = await TakeoffProject.countDocuments({
      userId,
      productKey: "revit",
      pmTrackerOnly: true,
    });
    if (used >= PM_TRACKER_LIMIT) {
      return res.status(403).json({
        error: `PM Tracker project limit reached (${PM_TRACKER_LIMIT}). Delete a project to add more.`,
        code: "PM_TRACKER_LIMIT",
        storageLimit: { used, limit: PM_TRACKER_LIMIT },
      });
    }
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Project name is required." });

    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    let slug = base || "pm-project";
    let suffix = 0;
    while (await TakeoffProject.findOne({ userId, productKey: "revit", slug }).select("_id").lean()) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    const project = new TakeoffProject({
      userId,
      productKey: "revit",
      pmTrackerOnly: true,
      name,
      slug,
      projectManagement: {},
    });
    await project.save();
    return res.status(201).json({
      project: {
        _id: project._id,
        name: project.name,
        slug: project.slug,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        taskCount: 0,
        riskCount: 0,
        issueCount: 0,
      },
    });
  }),
);

// DELETE /me/pm-tracker/:id — delete a PM tracker project (owner only)
router.delete(
  "/pm-tracker/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid project id." });
    }
    const deleted = await TakeoffProject.findOneAndDelete({
      _id: id,
      userId,
      productKey: "revit",
      pmTrackerOnly: true,
    });
    if (!deleted) return res.status(404).json({ error: "Project not found." });
    return res.json({ ok: true });
  }),
);

// POST /me/pm-tracker/:id/invite — send a full-editor invite email.
// The caller has already created a share code (POST /projects/revit/:id/collab/codes)
// and passes the plain code here. We email the join link to the invitee.
router.post(
  "/pm-tracker/:id/invite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid project id." });
    }
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: "email and code are required." });
    }

    // Verify the project belongs to this user
    const project = await TakeoffProject.findOne({
      _id: id,
      userId,
      productKey: "revit",
      pmTrackerOnly: true,
    }).lean();
    if (!project) return res.status(404).json({ error: "Project not found." });

    const inviter = await User.findById(userId, { name: 1, email: 1 }).lean();
    const inviterName = inviter?.name || inviter?.email || "A QUIV user";
    const projectName = project.name || "PM Project";
    const joinUrl = `${process.env.CLIENT_URL || "https://www.adlmstudio.net"}/j/${code}`;

    await sendMail({
      to: email,
      subject: `You've been invited to collaborate on "${projectName}" — ADLM Studio`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <div style="background:linear-gradient(135deg,#1a56db,#1e3a8a);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
            <h1 style="color:#fff;font-size:20px;margin:0">ADLM Studio</h1>
            <p style="color:#bfdbfe;font-size:13px;margin:8px 0 0">PM Tracker — Project Invitation</p>
          </div>
          <p style="color:#374151;font-size:14px"><strong>${inviterName}</strong> has invited you to collaborate on the PM project <strong>"${projectName}"</strong> as a full editor.</p>
          <p style="color:#6b7280;font-size:13px">As a full editor you can add and update tasks, log risks and issues, and track project progress in real time.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${joinUrl}" style="background:#1a56db;color:#fff;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:700;text-decoration:none;display:inline-block">
              Accept Invitation →
            </a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center">This link is single-use and restricted to ${email}. If you weren't expecting this invite, you can safely ignore it.</p>
        </div>
      `,
    });

    return res.json({ ok: true, message: `Invitation sent to ${email}` });
  }),
);

/**
 * GET /me/devices
 *
 * The machines this account has activated, one row per machine rather than
 * one per entitlement.
 *
 * /me/summary already carries a `devices` array on each entitlement, but it
 * only fills it once every seat is taken — a deliberate choice, because the
 * desktop clients read `devices.length > 0` as "no seats left" and populating
 * it early would lock people out of an install they are entitled to. That
 * makes it useless for showing somebody their own machines, which is what the
 * Team and Settings screens do.
 *
 * So this returns them unconditionally, keyed by fingerprint, with the list of
 * products each machine holds a seat on. A fingerprint is a machine id we
 * issued, not hardware data, and it is the caller's own account either way.
 */
router.get(
  "/devices",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id, { entitlements: 1 });
    if (!user) return res.status(404).json({ error: "User missing" });

    await ensureUserEntitlementsMigrated(user);

    const byPrint = new Map();

    for (const ent of user.entitlements || []) {
      const key = ent.productKey;
      for (const d of activeDevices(ent)) {
        const print = String(d.fingerprint || "");
        if (!print) continue;

        const row = byPrint.get(print) || {
          fingerprint: print,
          name: d.name || "",
          boundAt: d.boundAt || null,
          lastSeenAt: d.lastSeenAt || null,
          products: [],
        };

        row.products.push(key);
        // A machine's name and last-seen are per-entitlement rows for the same
        // device; keep the most recent of each so one stale row cannot make an
        // active machine look abandoned.
        if (!row.name && d.name) row.name = d.name;
        if (d.lastSeenAt && (!row.lastSeenAt || d.lastSeenAt > row.lastSeenAt)) {
          row.lastSeenAt = d.lastSeenAt;
        }
        if (d.boundAt && (!row.boundAt || d.boundAt < row.boundAt)) {
          row.boundAt = d.boundAt;
        }

        byPrint.set(print, row);
      }
    }

    const devices = Array.from(byPrint.values()).sort(
      (a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0),
    );

    return res.json({ ok: true, devices });
  }),
);

/**
 * POST /me/notifications
 *
 * What this account wants to hear about.
 *
 * Four switches, and each one has to mean something before it is worth
 * offering: a preference that saves nowhere is a promise the account cannot
 * keep, which is why the settings screen went without this panel until the
 * field existed.
 *
 * Only the four known keys are read. Spreading req.body onto the document
 * would let a caller write whatever it liked into it.
 */
router.post(
  "/notifications",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok: false, error: "User missing" });

    const body = req.body || {};
    const keys = ["productUpdates", "billing", "seatsAndMembers", "coursesAndEvents"];

    user.notifications = user.notifications || {};
    for (const k of keys) {
      // Absent means "leave it alone", so a screen can send one switch without
      // resetting the other three.
      if (typeof body[k] === "boolean") user.notifications[k] = body[k];
    }

    await user.save();

    return res.json({
      ok: true,
      notifications: {
        productUpdates: user.notifications.productUpdates ?? true,
        billing: user.notifications.billing ?? true,
        seatsAndMembers: user.notifications.seatsAndMembers ?? true,
        coursesAndEvents: user.notifications.coursesAndEvents ?? false,
      },
    });
  }),
);

/**
 * POST /me/devices/revoke
 *
 * Free one of your own machines' activations.
 *
 * This already existed as POST /admin/users/device/revoke, which meant the
 * only way to move a licence from a dead laptop to a new one was to ask us to
 * do it. The seat belongs to the account and the machine belongs to the person
 * holding it, so there is no reason that has to be a support ticket.
 *
 * Deliberately narrower than the admin route: it takes no email and reads the
 * caller's own record, so the worst it can do is release a seat the caller
 * already paid for. It marks `revokedAt` rather than deleting the row, the way
 * the admin route does, because the audit trail is what answers "who released
 * this and when" later.
 *
 * Bumping refreshVersion is what makes it take effect: the desktop clients
 * re-check on their next call and the revoked machine stops being licensed.
 */
router.post(
  "/devices/revoke",
  requireAuth,
  asyncHandler(async (req, res) => {
    const fingerprint = String(req.body?.fingerprint || "").trim();
    const productKey = String(req.body?.productKey || "").trim();
    if (!fingerprint) {
      return res.status(400).json({ ok: false, error: "fingerprint is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok: false, error: "User missing" });

    await ensureUserEntitlementsMigrated(user);
    applyExpiryToUser(user);

    // No productKey means "this machine, everywhere" — which is what somebody
    // replacing a laptop actually wants, rather than revoking it once per
    // product they happen to own.
    const targets = (user.entitlements || []).filter(
      (e) => !productKey || e.productKey === productKey,
    );

    const freed = [];
    for (const ent of targets) {
      for (const d of activeDevices(ent)) {
        if (String(d.fingerprint || "") !== fingerprint) continue;
        d.revokedAt = new Date();
        freed.push(ent.productKey);
      }
    }

    if (!freed.length) {
      return res.status(404).json({ ok: false, error: "That machine is not active on this account" });
    }

    user.refreshVersion = (user.refreshVersion || 0) + 1;
    await user.save();

    return res.json({ ok: true, freed });
  }),
);

/**
 * GET /me/rail
 *
 * The counts the signed-in rail shows beside each item — projects, rate
 * library, certificates, seats, team. In the design these were sample
 * figures typed into the markup ("Projects 2", "Rate library 13"); this is
 * where the real ones come from.
 *
 * One endpoint rather than five, because the rail is on every app screen and
 * five round trips per navigation to draw six small numbers is not worth it.
 * Every count is best-effort: a rail badge is decoration, and a failure in
 * one collection must not be able to blank the navigation.
 */
router.get(
  "/rail",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const zero = (p) => p.catch(() => 0);

    const [projects, rateLib, certificates, user] = await Promise.all([
      zero(
        TakeoffProject.countDocuments({
          $or: [{ userId }, { "collaborators.userId": userId }],
        }),
      ),
      zero(
        RateGenLibrary.findOne({ userId })
          .select("customRates")
          .lean()
          .then((doc) => (doc?.customRates || []).length),
      ),
      zero(
        CourseEnrollment.countDocuments({
          userId,
          certificateUrl: { $exists: true, $nin: [null, ""] },
        }),
      ),
      User.findById(userId, {
        name: 1,
        email: 1,
        accountType: 1,
        organizationName: 1,
        entitlements: 1,
      })
        .lean()
        .catch(() => null),
    ]);

    // "Products & seats" counts what this account actually holds against the
    // catalogue, so the rail reads "3 of 7" the way his design does — but with
    // 7 being however many products we sell today, not a number frozen into
    // the markup.
    const owned = new Set(
      (user?.entitlements || []).map((e) => e.productKey).filter(Boolean),
    );
    const catalogue = await Product.countDocuments({ isCourse: { $ne: true } }).catch(
      () => 0,
    );

    res.json({
      projects,
      rates: rateLib,
      certificates,
      productsOwned: owned.size,
      productsTotal: catalogue,
      name: user?.name || "",
      email: user?.email || "",
      organizationName: user?.organizationName || "",
      accountType: user?.accountType || "personal",
    });
  }),
);

/**
 * POST /me/password  { currentPassword?, newPassword }
 *
 * Set the password an account signs in to the desktop software with.
 *
 * This exists because of a gap that only shows up on the Windows side. QUIV,
 * HERON, RateGen, Revit MEP, Time Pro and CIVIQ all authenticate through
 * POST /auth/login with an email and a password. Someone who created their
 * ADLM account with Google or Microsoft has no password at all, so every one
 * of those plugins would reject them with "Invalid credentials" — on an
 * account that is perfectly valid and may well be paid up.
 *
 * Two shapes, and the difference matters:
 *
 *   * No password yet (a social account). currentPassword is not required,
 *     because there is nothing to prove — the bearer token already proves who
 *     they are, and demanding a password they do not have would be a locked
 *     door with no key.
 *   * Changing an existing one. currentPassword IS required, so a stolen or
 *     borrowed session cannot silently take the account over by rewriting the
 *     credential the desktop apps trust.
 */
router.post(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const newPassword = String(req.body?.newPassword || "");
    const currentPassword = String(req.body?.currentPassword || "");

    const weak = validatePasswordStrength(newPassword);
    if (weak) return res.status(400).json({ error: weak, code: "WEAK_PASSWORD" });

    const user = await User.findById(req.user._id).select(
      "passwordHash email disabled isGod googleId microsoftId",
    );
    if (!user) return res.status(404).json({ error: "User missing" });
    if (user.disabled) {
      return res.status(403).json({ error: "Account disabled. Please contact support." });
    }

    const hadPassword = !!user.passwordHash;

    if (hadPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          error: "Enter your current password to change it.",
          code: "CURRENT_PASSWORD_REQUIRED",
        });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: "That current password is not right." });
      }
      if (currentPassword === newPassword) {
        return res
          .status(400)
          .json({ error: "That is the password you already have." });
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Deliberately NOT revoking existing refresh tokens.
    //
    // On a first-time set there is nothing to revoke and signing the person
    // out of the browser they are standing in would be baffling. On a change,
    // revoking everywhere is a defensible policy but a different decision from
    // this one, and doing it silently here would sign out the desktop plugins
    // mid-session. Worth deciding deliberately rather than as a side effect.
    return res.json({
      ok: true,
      created: !hadPassword,
      message: hadPassword
        ? "Password changed. Use it the next time you sign in."
        : "Password set. You can now sign in to the ADLM desktop software with it.",
    });
  }),
);

/**
 * GET /me/password/status
 *
 * Whether this account can sign in to the desktop software at all, and how it
 * was created. The website uses it to decide whether to prompt.
 */
router.get(
  "/password/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
      .select("passwordHash googleId microsoftId")
      .lean();
    if (!user) return res.status(404).json({ error: "User missing" });
    res.json({
      hasPassword: !!user.passwordHash,
      providers: {
        google: !!user.googleId,
        microsoft: !!user.microsoftId,
      },
    });
  }),
);

/**
 * GET /me/social
 *
 * Which providers this account is connected to, and which could be connected.
 * Drives the "Connected accounts" panel in the profile.
 */
router.get(
  "/social",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
      .select("googleId microsoftId autodeskId passwordHash email")
      .lean();
    if (!user) return res.status(404).json({ error: "User missing" });

    const available = configuredProviders();
    res.json({
      email: user.email,
      hasPassword: !!user.passwordHash,
      connected: {
        google: !!user.googleId,
        microsoft: !!user.microsoftId,
        autodesk: !!user.autodeskId,
      },
      available: {
        google: available.google,
        microsoft: available.microsoft,
        autodesk: available.autodesk,
      },
    });
  }),
);

/**
 * POST /me/social/connect  { provider, credential }
 *
 * Attach a Google, Microsoft or Autodesk account to the one already signed in,
 * so a later click on that button lands here instead of creating a second
 * account.
 *
 * The token is verified exactly as it is at sign-in — being signed in already
 * is permission to connect something, not permission to skip proving what is
 * being connected.
 *
 * The email is NOT required to match. Plenty of people sign in to ADLM with a
 * work address and hold an Autodesk or Microsoft account under a personal one,
 * and refusing that would be refusing the normal case. What is refused is a
 * provider account already attached to a DIFFERENT ADLM user, because that is
 * the one situation where connecting would quietly take something away from
 * somebody else.
 */
router.post(
  "/social/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = String(req.body?.provider || "").trim().toLowerCase();
    const field = PROVIDER_FIELD[provider];
    if (!field) return res.status(400).json({ error: "Unknown sign-in provider." });

    let identity;
    try {
      let credential = req.body?.credential;
      if (!credential && req.body?.code) {
        credential = await exchangeCodeForIdToken(provider, {
          code: String(req.body.code),
          codeVerifier: String(req.body.codeVerifier || ""),
          redirectUri: String(req.body.redirectUri || ""),
        });
      }
      identity = await verifySocialIdentity(provider, credential);
    } catch (e) {
      console.warn("[/me/social/connect] rejected:", e?.message || e);
      return res
        .status(401)
        .json({ error: "That account could not be verified. Please try again." });
    }

    const takenBy = await User.findOne({ [field]: identity.subject })
      .select("_id")
      .lean();
    if (takenBy && String(takenBy._id) !== String(req.user._id)) {
      return res.status(409).json({
        error: `That ${provider} account is already connected to another ADLM account.`,
        code: "ALREADY_LINKED",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User missing" });

    user[field] = identity.subject;
    if (!user.firstName && identity.firstName) user.firstName = identity.firstName;
    if (!user.lastName && identity.lastName) user.lastName = identity.lastName;
    await user.save();

    res.json({
      ok: true,
      provider,
      connectedEmail: identity.email,
      message: `Connected. You can now sign in with ${provider}.`,
    });
  }),
);

/**
 * DELETE /me/social/:provider
 *
 * Disconnect a provider.
 *
 * Refused when it is the only way in. Removing the last provider from an
 * account that has no password locks the owner out of their own account with
 * one click, and no amount of confirmation copy makes that a reasonable thing
 * to allow — so it is not allowed until a password exists.
 */
router.delete(
  "/social/:provider",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = String(req.params.provider || "").trim().toLowerCase();
    const field = PROVIDER_FIELD[provider];
    if (!field) return res.status(400).json({ error: "Unknown sign-in provider." });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User missing" });
    if (!user[field]) {
      return res.status(400).json({ error: `No ${provider} account is connected.` });
    }

    const others = Object.entries(PROVIDER_FIELD).filter(
      ([key, f]) => key !== provider && !!user[f],
    );
    if (!user.passwordHash && others.length === 0) {
      return res.status(400).json({
        error:
          "That is the only way into this account. Set a password first, then " +
          "you can disconnect it.",
        code: "LAST_CREDENTIAL",
      });
    }

    user[field] = null;
    await user.save();
    res.json({ ok: true, provider, message: `Disconnected your ${provider} account.` });
  }),
);

export default router;
