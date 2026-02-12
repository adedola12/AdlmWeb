// server/routes/me.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { ZONES, normalizeZone } from "../util/zones.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";

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

  return {
    productKey: ent.productKey,
    status: ent.status,
    expiresAt: normalizeExpiry(ent.expiresAt),

    // ✅ helpful UI fields
    isExpired: expired,
    daysLeft,

    seats: Math.max(parseInt(ent.seats || 1, 10), 1),
    seatsUsed: act.length,

    licenseType: ent.licenseType || "personal",
    organizationName: ent.organizationName || "",

    devices: act.map((d) => ({
      fingerprint: maskFp(d.fingerprint),
      name: d.name || "",
      boundAt: d.boundAt || null,
      lastSeenAt: d.lastSeenAt || null,
    })),
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

    return res.json({
      email,
      role,
      username,
      avatarUrl,
      zone,
      entitlements: entitlementsLegacy, // legacy payload (but now accurate)
      entitlementsV2,
      refreshVersion: user?.refreshVersion || 1,
      firstName: firstName || "",
      lastName: lastName || "",
      whatsapp: whatsapp || "",
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
    const ordersCount = await Purchase.countDocuments({ userId: req.user._id });

    return res.json({
      email: user.email,
      refreshVersion: user.refreshVersion || 1,

      // ✅ Dashboard expects these
      products, // for "My Products" tab + Active Products stat
      entitlements, // for Subscriptions tab (now includes productName/isCourse/billingInterval/installFee)
      installations: installsEnriched,

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
    });
  }),
);

router.post(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { username, avatarUrl, zone, firstName, lastName, whatsapp } =
      req.body || {};
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

    if (firstName !== undefined) u.firstName = String(firstName || "").trim();
    if (lastName !== undefined) u.lastName = String(lastName || "").trim();
    if (whatsapp !== undefined)
      u.whatsapp = String(whatsapp || "").replace(/[^\d+]/g, "");

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

export default router;
