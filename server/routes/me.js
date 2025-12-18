// server/routes/me.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { ZONES, normalizeZone } from "../util/zones.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";


const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  // include new fields from JWT (they are added in auth payload)
  const {
    email,
    role,
    entitlements,
    username,
    avatarUrl,
    zone,
    firstName,
    lastName,
    whatsapp,
  } = req.user;

  return res.json({
    email,
    role,
    username,
    avatarUrl,
    zone,
    entitlements,
    firstName: firstName || "",
    lastName: lastName || "",
    whatsapp: whatsapp || "",
  });
});

/* used by desktop */
router.get("/entitlements", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, { entitlements: 1 }).lean();
  const ent = (user?.entitlements || []).map((e) => ({
    productKey: e.productKey,
    status: e.status,
    expiresAt: e.expiresAt || null,
  }));
  res.json(ent);
});

/* web summary */
router.get("/summary", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id, {
    entitlements: 1,
    email: 1,
  }).lean();
  // const ent = (user?.entitlements || []).map((e) => ({
  //   productKey: e.productKey,
  //   status: e.status,
  //   expiresAt: e.expiresAt || null,
  //   isExpired: e.expiresAt ? dayjs(e.expiresAt).isBefore(dayjs()) : true,
  // }));

  const ents = (user.entitlements || []).map((e) => ({
    ...e,
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
    }
  )
    .sort({ decidedAt: -1 })
    .lean();

  // build a set of productKeys from installs (prefer lines, fallback to root productKey)
  const installKeys = Array.from(
    new Set(
      installs
        .flatMap((p) =>
          Array.isArray(p.lines) && p.lines.length
            ? p.lines.map((l) => l.productKey)
            : [p.productKey]
        )
        .filter(Boolean)
    )
  );

  const installProducts = await Product.find({ key: { $in: installKeys } })
    .select("key name")
    .lean();

  const prodNameByKey = Object.fromEntries(
    installProducts.map((x) => [x.key, x.name])
  );

  const installsEnriched = installs.map((p) => {
    // If multiple lines exist, pick the first (or you can join them)
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
    email: user?.email,
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

  // return updated user subset
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
