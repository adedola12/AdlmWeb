// server/routes/me.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { rolePermissionList, isSuperAdminRole } from "../util/rbac.js";
import { ALL_AREA_KEYS } from "../config/permissions.js";
import { ZONES, normalizeZone } from "../util/zones.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";
import { Setting } from "../models/Setting.js";
import { Invoice } from "../models/Invoice.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();

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
      zone,
      entitlements: entitlementsLegacy, // legacy payload (but now accurate)
      entitlementsV2,
      refreshVersion: user?.refreshVersion || 1,
      firstName: firstName || "",
      lastName: lastName || "",
      whatsapp: whatsapp || "",
      stepUpEnabled: !!user?.security?.stepUpEnabled,
      isSuperAdmin: isSuperAdminRole(effectiveRole),
      permissions: rolePermissionList(effectiveRole, ALL_AREA_KEYS),
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
    let entitlements = entsBase.map((e) => {
      const p = prodByKey[e.productKey] || null;
      return {
        ...e,
        isCourse: !!p?.isCourse,
        productName: p?.name || e.productKey,
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
      Setting.findOne({ key: "global" }).select("installerHubUrl installerHubVideoUrl").lean(),
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
      firstName: firstName || "",
      lastName: lastName || "",
      whatsapp: whatsapp || "",
      location: location || "",
      firmName: firmName || "",
      nameLockedForCertificate: !!u.certificateNameLockedAt,
      stepUpEnabled: !!u.security?.stepUpEnabled,
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

    if (zone !== undefined) {
      const nz = normalizeZone(zone);
      if (!nz) return res.status(400).json({ error: "Invalid zone" });
      u.zone = nz;
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

export default router;
