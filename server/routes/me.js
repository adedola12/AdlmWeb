// server/routes/me.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { ZONES, normalizeZone } from "../util/zones.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";

const router = express.Router();

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

function toEntitlementV2(ent) {
  normalizeLegacyEntitlement(ent);
  const act = activeDevices(ent);
  return {
    productKey: ent.productKey,
    status: ent.status,
    expiresAt: normalizeExpiry(ent.expiresAt),
    seats: Math.max(parseInt(ent.seats || 1, 10), 1),
    seatsUsed: act.length,
    devices: act.map((d) => ({
      fingerprint: maskFp(d.fingerprint),
      name: d.name || "",
      boundAt: d.boundAt || null,
      lastSeenAt: d.lastSeenAt || null,
    })),
  };
}

router.get("/", requireAuth, async (req, res) => {
  // Keep legacy response fields for compatibility…
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

  // …but also include live entitlement counts from DB (so dashboard is accurate)
  const user = await User.findById(req.user._id, {
    entitlements: 1,
    refreshVersion: 1,
  });
  if (user) await ensureUserEntitlementsMigrated(user);

  const entitlementsV2 = user
    ? (user.entitlements || []).map(toEntitlementV2)
    : [];

  return res.json({
    email,
    role,
    username,
    avatarUrl,
    zone,
    entitlements: req.user.entitlements, // legacy payload (do not break old clients)
    entitlementsV2, // ✅ new dashboard-ready payload
    refreshVersion: user?.refreshVersion || 1,
    firstName: firstName || "",
    lastName: lastName || "",
    whatsapp: whatsapp || "",
  });
});

/* used by desktop (legacy shape kept) */
router.get("/entitlements", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, { entitlements: 1 }).lean();

  const ent = (user?.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: normalizeExpiry(e.expiresAt),
  }));

  res.json(ent);
});

/* ✅ NEW: used by web/org dashboard to see device usage */
router.get("/entitlements-v2", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, { entitlements: 1 });
  if (!user) return res.status(404).json({ error: "User not found" });

  await ensureUserEntitlementsMigrated(user);

  return res.json({
    ok: true,
    entitlements: (user.entitlements || []).map(toEntitlementV2),
  });
});

/* web summary */
router.get("/summary", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, { entitlements: 1, email: 1 });
  if (!user) return res.status(404).json({ error: "User missing" });

  await ensureUserEntitlementsMigrated(user);

  const ents = (user.entitlements || []).map((e) => ({
    ...toEntitlementV2(e), // ✅ seats + devices
    isCourse: false,
  }));

  const keys = ents.map((e) => e.productKey);
  const prods = await Product.find({ key: { $in: keys } })
    .select("key isCourse")
    .lean();
  const byKey = Object.fromEntries(prods.map((p) => [p.key, !!p.isCourse]));

  const entitlements = ents.map((e) => ({
    ...e,
    isCourse: !!byKey[e.productKey],
  }));

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
    },
  )
    .sort({ decidedAt: -1 })
    .lean();

  const installKeys = Array.from(
    new Set(
      installs
        .flatMap((p) =>
          Array.isArray(p.lines) && p.lines.length
            ? p.lines.map((l) => l.productKey)
            : [p.productKey],
        )
        .filter(Boolean),
    ),
  );

  const installProducts = await Product.find({ key: { $in: installKeys } })
    .select("key name")
    .lean();

  const prodNameByKey = Object.fromEntries(
    installProducts.map((x) => [x.key, x.name]),
  );

  const installsEnriched = installs.map((p) => {
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

  return res.json({
    email: user.email,
    entitlements,
    installations: installsEnriched,
  });
});

// Profile details
router.get("/profile", requireAuth, async (req, res) => {
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
});

router.post("/profile", requireAuth, async (req, res) => {
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
    u.refreshVersion += 1;
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
});

export default router;
