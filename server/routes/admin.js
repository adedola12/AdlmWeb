// server/routes/admin.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";
import { Coupon } from "../models/Coupon.js";
import { Product } from "../models/Product.js";
import { autoEnrollFromPurchase } from "../util/autoEnroll.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();

// ✅ all endpoints here require admin
router.use(requireAuth, requireAdmin);

/* -------------------- helpers -------------------- */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const normInterval = (v) =>
  String(v || "monthly")
    .toLowerCase()
    .trim();
function inferLicenseTypeFromSeats(licenseType, seats) {
  const s = Math.max(Number(seats || 1), 1);
  const lt = String(licenseType || "").toLowerCase();
  return lt === "organization" || s > 1 ? "organization" : "personal";
}

function normalizeLegacyEnt(ent) {
  if (!ent) return;

  if (!ent.seats || ent.seats < 1) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];

  // ✅ infer correct licenseType from seats (fix wrong "personal" on multi-seat)
  const seats = Math.max(Number(ent.seats || 1), 1);
  const inferred = inferLicenseTypeFromSeats(ent.licenseType, seats);
  ent.licenseType = inferred;

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

function addMonthsToEntitlement(
  userDoc,
  productKey,
  monthsToAdd,
  seatsToSet = 1,
  meta = {},
) {
  userDoc.entitlements = userDoc.entitlements || [];
  const now = dayjs();

  const seatsFinal = Math.max(Number(seatsToSet || 1), 1);

  // ✅ if seats > 1 => organization (even if meta says personal)
  const licenseType = inferLicenseTypeFromSeats(meta?.licenseType, seatsFinal);

  const organizationName =
    licenseType === "organization"
      ? String(meta?.organizationName || "").trim()
      : "";

  let ent = userDoc.entitlements.find((e) => e.productKey === productKey);

  if (!ent) {
    userDoc.entitlements.push({
      productKey,
      status: "active",
      seats: seatsFinal,
      expiresAt: now.add(monthsToAdd, "month").toDate(),
      devices: [],
      licenseType,
      organizationName: organizationName || undefined,
    });
  } else {
    normalizeLegacyEnt(ent);

    const base =
      ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
        ? dayjs(ent.expiresAt)
        : now;

    ent.status = "active";
    ent.expiresAt = base.add(monthsToAdd, "month").toDate();
    ent.seats = Math.max(Number(ent.seats || 1), seatsFinal);

    // ✅ keep org metadata consistent
    ent.licenseType = inferLicenseTypeFromSeats(ent.licenseType, ent.seats);

    if (ent.licenseType === "organization") {
      if (organizationName) ent.organizationName = organizationName;
    }
  }
}

/**
 * Normalize grants and also infer org if seats > 1.
 */
function normalizeGrants(grants, defaults = {}) {
  const map = new Map();

  const defLt = inferLicenseTypeFromSeats(
    defaults.licenseType,
    defaults.seats || 1,
  );
  const defOrg = String(defaults.organizationName || "").trim();

  for (const g of Array.isArray(grants) ? grants : []) {
    const k = String(g?.productKey || "").trim();
    const m = Number(g?.months || 0);
    const s = Math.max(Number(g?.seats || 1), 1);

    if (!k || !Number.isFinite(m) || m <= 0) continue;

    const lt = inferLicenseTypeFromSeats(g?.licenseType || defLt, s);
    const orgName = String(g?.organizationName || defOrg).trim();

    const prev = map.get(k) || {
      months: 0,
      seats: 1,
      licenseType: defLt,
      organizationName: defOrg,
    };

    const nextSeats = Math.max(prev.seats, s);
    const nextLt = inferLicenseTypeFromSeats(
      prev.licenseType === "organization" || lt === "organization"
        ? "organization"
        : "personal",
      nextSeats,
    );

    map.set(k, {
      months: prev.months + m,
      seats: nextSeats,
      licenseType: nextLt,
      organizationName: prev.organizationName || orgName || "",
    });
  }

  return [...map.entries()].map(([productKey, v]) => ({
    productKey,
    months: v.months,
    seats: v.seats,
    licenseType: v.licenseType,
    organizationName: v.organizationName,
  }));
}

// Legacy-safe: build grants from purchase lines OR legacy fields
function buildGrantsFromPurchase(purchase, overrideMonths = 0) {
  const grants = [];

  const purchaseSeats = Array.isArray(purchase?.lines)
    ? purchase.lines.reduce(
        (acc, ln) => acc + Math.max(Number(ln?.qty || 1), 1),
        0,
      )
    : 1;

  // ✅ infer purchase license by seats too
  const purchaseLicenseType = inferLicenseTypeFromSeats(
    purchase?.licenseType,
    purchaseSeats,
  );
  const purchaseOrgName = String(purchase?.organization?.name || "").trim();

  if (Array.isArray(purchase.lines) && purchase.lines.length > 0) {
    for (const ln of purchase.lines) {
      const productKey = String(ln?.productKey || "").trim();
      const seats = Math.max(Number(ln?.qty || 1), 1);

      const periods = Math.max(Number(ln?.periods || 1), 1);
      const interval = normInterval(ln?.billingInterval);

      if (!productKey) continue;

      const intervalMonths = interval === "yearly" ? 12 : 1;
      const months = periods * intervalMonths;

      // ✅ if line seats > 1 => org
      const lt = inferLicenseTypeFromSeats(
        ln?.licenseType || purchaseLicenseType,
        seats,
      );

      grants.push({
        productKey,
        months,
        seats,
        licenseType: lt,
        organizationName:
          purchaseOrgName || String(ln?.organizationName || "").trim(),
      });
    }
  } else if (purchase.productKey) {
    const months =
      Number(purchase.approvedMonths || 0) ||
      Number(overrideMonths || 0) ||
      Number(purchase.requestedMonths || 0) ||
      1;

    grants.push({
      productKey: String(purchase.productKey).trim(),
      months,
      seats: 1,
      licenseType: purchaseLicenseType,
      organizationName: purchaseOrgName,
    });
  }

  return normalizeGrants(grants, {
    licenseType: purchaseLicenseType,
    organizationName: purchaseOrgName,
    seats: purchaseSeats,
  });
}


async function getIsCourseMap(keys) {
  if (!keys?.length) return {};
  const prods = await Product.find({ key: { $in: keys } })
    .select("key isCourse")
    .lean();
  return Object.fromEntries((prods || []).map((p) => [p.key, !!p.isCourse]));
}

/* -------------------- routes -------------------- */
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    const find = {};
    if (q) {
      const rx = new RegExp(String(q).trim(), "i");
      find.$or = [{ email: rx }, { username: rx }];
    }

    const list = await User.find(find, {
      email: 1,
      username: 1,
      role: 1,
      disabled: 1,
      entitlements: 1,
      createdAt: 1,
    }).sort({ createdAt: -1 });

    return res.json(list);
  }),
);

router.post(
  "/users/disable",
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const disabled = !!req.body?.disabled;

    if (!email) return res.status(400).json({ error: "email required" });

    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    u.disabled = disabled;
    u.refreshVersion = (u.refreshVersion || 0) + 1;
    await u.save();

    return res.json({ ok: true, disabled: u.disabled });
  }),
);

router.get(
  "/purchases",
  asyncHandler(async (req, res) => {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    const list = await Purchase.find(q).sort({ createdAt: -1 }).limit(500);
    return res.json(list);
  }),
);

router.post(
  "/purchases/:id/approve",
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    if (purchase.status !== "pending")
      return res.status(400).json({ error: "Purchase not pending" });

    const user = await User.findById(purchase.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const overrideMonths = Number(req.body?.months || 0);

    const grants = buildGrantsFromPurchase(purchase, overrideMonths);
    if (grants.length === 0)
      return res
        .status(400)
        .json({ error: "Nothing to approve for this purchase" });

    const keys = [...new Set(grants.map((g) => g.productKey).filter(Boolean))];
    const isCourseByKey = await getIsCourseMap(keys);

    const immediate = [];
    const staged = [];
    for (const g of grants) {
      if (isCourseByKey[g.productKey]) immediate.push(g);
      else staged.push(g);
    }

    // Apply course entitlements immediately
    if (immediate.length) {
      immediate.forEach((g) =>
        addMonthsToEntitlement(user, g.productKey, g.months, g.seats, {
          licenseType: g.licenseType,
          organizationName: g.organizationName,
        }),
      );
      await user.save();
    }

    purchase.status = "approved";
    purchase.decidedBy = req.user?.email || "admin";
    purchase.decidedAt = new Date();

    // Installation defaults
    purchase.installation = purchase.installation || {};
    purchase.installation.anydeskUrl =
      purchase.installation.anydeskUrl ||
      "https://anydesk.com/en/downloads/windows";
    purchase.installation.installVideoUrl =
      purchase.installation.installVideoUrl || "";

    if (staged.length > 0) {
      purchase.installation.status = "pending";
      // ✅ store normalized grants (schema must include licenseType/orgName)
      purchase.installation.entitlementGrants = normalizeGrants(staged, {
        licenseType: purchase.licenseType,
        organizationName: purchase.organization?.name,
      });
      purchase.installation.entitlementsApplied = false;
      purchase.installation.entitlementsAppliedAt = null;
    } else {
      purchase.installation.status = "complete";
      purchase.installation.markedBy = req.user?.email || "admin";
      purchase.installation.markedAt = new Date();
      purchase.installation.entitlementGrants = [];
      purchase.installation.entitlementsApplied = true;
      purchase.installation.entitlementsAppliedAt = new Date();
    }

    // Coupon redemption only for course-only approvals
    if (
      purchase.coupon?.couponId &&
      !purchase.coupon.redeemedApplied &&
      staged.length === 0
    ) {
      await Coupon.updateOne(
        { _id: purchase.coupon.couponId },
        { $inc: { redeemedCount: 1 } },
      );
      purchase.coupon.redeemedApplied = true;
    }

    await purchase.save();

    // email (non-blocking)
    try {
      const isPendingInstall = staged.length > 0;
      await sendMail({
        to: user.email,
        subject: isPendingInstall
          ? "ADLM Purchase Approved — Installation Pending"
          : "ADLM Purchase Approved — Activated",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5">
            <h2>Your purchase has been approved ✅</h2>
            ${
              isPendingInstall
                ? `<p>Your subscription will start after installation is completed by our team.</p>`
                : `<p>Your subscription is now active. You can start using your product immediately.</p>`
            }
            <p>Thank you for choosing ADLM.</p>
          </div>
        `,
      });
    } catch (e) {
      console.error("[admin approve] sendMail failed:", e?.message || e);
    }

    try {
      await autoEnrollFromPurchase(purchase);
    } catch (e) {
      console.error(
        "[admin approve] autoEnrollFromPurchase failed:",
        e?.message || e,
      );
    }

    return res.json({
      ok: true,
      purchase,
      entitlements: user.entitlements,
      message:
        staged.length > 0
          ? "Purchase approved. Entitlements will start after installation is completed."
          : "Purchase approved and activated.",
    });
  }),
);

router.post(
  "/purchases/:id/reject",
  asyncHandler(async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });
    if (p.status !== "pending")
      return res.status(400).json({ error: "Purchase not pending" });

    p.status = "rejected";
    p.decidedBy = req.user?.email || "admin";
    p.decidedAt = new Date();
    await p.save();

    return res.json({ ok: true, purchase: p });
  }),
);

router.get(
  "/installations",
  asyncHandler(async (req, res) => {
    const q = {
      status: "approved",
      $or: [
        { "installation.status": "pending" },
        { "installation.entitlementsApplied": false },
        { "installation.entitlementsApplied": { $exists: false } }, // legacy
      ],
    };

    const list = await Purchase.find(q).sort({ decidedAt: -1 }).limit(500);
    return res.json(list);
  }),
);

router.post(
  "/installations/:id/complete",
  asyncHandler(async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });

    p.installation = p.installation || {};
    const wasComplete = p.installation.status === "complete";

    const purchaseLicenseType =
      String(p.licenseType || "personal").toLowerCase() === "organization"
        ? "organization"
        : "personal";
    const purchaseOrgName = String(p.organization?.name || "").trim();

    // ✅ If grants missing (legacy), rebuild from purchase lines/productKey
    let grants = normalizeGrants(p.installation.entitlementGrants, {
      licenseType: purchaseLicenseType,
      organizationName: purchaseOrgName,
    });

    if (grants.length === 0) {
      grants = buildGrantsFromPurchase(p, 0);
      p.installation.entitlementGrants = grants;
    }

    // Only apply NON-COURSE items on installation complete
    const keys = [...new Set(grants.map((g) => g.productKey).filter(Boolean))];
    const isCourseByKey = await getIsCourseMap(keys);
    const installGrants = grants.filter((g) => !isCourseByKey[g.productKey]);

    p.installation.status = "complete";
    p.installation.markedBy = req.user?.email || "admin";
    p.installation.markedAt = new Date();

    if (
      p.installation.entitlementsApplied !== true &&
      installGrants.length > 0
    ) {
      const user = await User.findById(p.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      installGrants.forEach((g) =>
        addMonthsToEntitlement(user, g.productKey, Number(g.months), g.seats, {
          licenseType: g.licenseType || purchaseLicenseType,
          organizationName: g.organizationName || purchaseOrgName,
        }),
      );

      await user.save();

      p.installation.entitlementsApplied = true;
      p.installation.entitlementsAppliedAt = new Date();
    } else if (
      p.installation.entitlementsApplied !== true &&
      installGrants.length === 0
    ) {
      p.installation.entitlementsApplied = true;
      p.installation.entitlementsAppliedAt = new Date();
    }

    // Coupon redemption finalizes here (install completion moment)
    if (p.coupon?.couponId && !p.coupon.redeemedApplied) {
      await Coupon.updateOne(
        { _id: p.coupon.couponId },
        { $inc: { redeemedCount: 1 } },
      );
      p.coupon.redeemedApplied = true;
    }

    await p.save();

    return res.json({
      ok: true,
      purchase: p,
      appliedGrants: installGrants,
      message: wasComplete
        ? "Installation already complete. Ensured entitlements/coupon are finalized."
        : "Installation marked complete. Subscription started and coupon finalized.",
    });
  }),
);

router.post(
  "/users/entitlement",
  asyncHandler(async (req, res) => {
    const {
      email,
      productKey,
      months = 0,
      status,
      seats,
      licenseType,
      organizationName,
    } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    u.entitlements = u.entitlements || [];
    const now = dayjs();

    let ent = u.entitlements.find((e) => e.productKey === productKey);

    const lt =
      String(licenseType || "personal").toLowerCase() === "organization"
        ? "organization"
        : "personal";
    const org =
      lt === "organization" ? String(organizationName || "").trim() : "";

    if (!ent) {
      ent = {
        productKey,
        status: status || "active",
        seats: Math.max(Number(seats || 1), 1),
        expiresAt: (months
          ? now.add(months, "month")
          : now.add(1, "month")
        ).toDate(),
        licenseType: lt,
        organizationName: org || undefined,
      };
      u.entitlements.push(ent);
    } else {
      normalizeLegacyEnt(ent);
      if (typeof status === "string") ent.status = status;
      if (months > 0) {
        const base =
          ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
            ? dayjs(ent.expiresAt)
            : now;
        ent.expiresAt = base.add(months, "month").toDate();
      }
      if (seats != null)
        ent.seats = Math.max(
          Number(ent.seats || 1),
          Math.max(Number(seats || 1), 1),
        );
      if (lt === "organization") {
        ent.licenseType = "organization";
        if (org) ent.organizationName = org;
      }
    }

    await u.save();
    return res.json({ ok: true, entitlements: u.entitlements });
  }),
);

router.post(
  "/users/reset-device",
  asyncHandler(async (req, res) => {
    const { email, productKey } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
    if (!ent) return res.status(404).json({ error: "Entitlement not found" });

    ent.deviceFingerprint = undefined;
    ent.deviceBoundAt = undefined;
    ent.devices = [];
    u.refreshVersion = (u.refreshVersion || 0) + 1;

    await u.save();
    return res.json({ ok: true });
  }),
);

router.post(
  "/users/entitlement/delete",
  asyncHandler(async (req, res) => {
    const { email, productKey } = req.body || {};
    if (!email || !productKey)
      return res.status(400).json({ error: "email and productKey required" });

    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const before = (u.entitlements || []).length;
    u.entitlements = (u.entitlements || []).filter(
      (e) => e.productKey !== productKey,
    );

    if (u.entitlements.length === before) {
      return res.status(404).json({ error: "Entitlement not found" });
    }

    u.refreshVersion = (u.refreshVersion || 0) + 1;
    await u.save();

    return res.json({ ok: true, entitlements: u.entitlements });
  }),
);

function activeDevices(ent) {
  return (ent.devices || []).filter((d) => !d.revokedAt);
}

router.get(
  "/users/devices",
  asyncHandler(async (req, res) => {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    const productKey = String(req.query.productKey || "").trim();

    if (!email || !productKey) {
      return res.status(400).json({ error: "email and productKey required" });
    }

    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
    if (!ent) return res.status(404).json({ error: "Entitlement not found" });

    normalizeLegacyEnt(ent);
    await u.save();

    return res.json({
      ok: true,
      productKey,
      seats: ent.seats || 1,
      seatsUsed: activeDevices(ent).length,
      devices: (ent.devices || []).map((d) => ({
        fingerprint: d.fingerprint,
        name: d.name || "",
        boundAt: d.boundAt || null,
        lastSeenAt: d.lastSeenAt || null,
        revokedAt: d.revokedAt || null,
      })),
    });
  }),
);

router.post(
  "/users/device/revoke",
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const productKey = String(req.body?.productKey || "").trim();
    const fingerprint = String(req.body?.fingerprint || "").trim();

    if (!email || !productKey || !fingerprint) {
      return res
        .status(400)
        .json({ error: "email, productKey, fingerprint required" });
    }

    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
    if (!ent) return res.status(404).json({ error: "Entitlement not found" });

    normalizeLegacyEnt(ent);

    const dev = (ent.devices || []).find(
      (d) => d.fingerprint === fingerprint && !d.revokedAt,
    );
    if (!dev) return res.status(404).json({ error: "Device not active" });

    dev.revokedAt = new Date();
    u.refreshVersion = (u.refreshVersion || 0) + 1;
    await u.save();

    return res.json({
      ok: true,
      message: "Device revoked",
      seats: ent.seats || 1,
      seatsUsed: activeDevices(ent).length,
    });
  }),
);

router.post(
  "/users/device/delete",
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const productKey = String(req.body?.productKey || "").trim();
    const fingerprint = String(req.body?.fingerprint || "").trim();

    if (!email || !productKey || !fingerprint) {
      return res
        .status(400)
        .json({ error: "email, productKey, fingerprint required" });
    }

    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
    if (!ent) return res.status(404).json({ error: "Entitlement not found" });

    normalizeLegacyEnt(ent);

    const before = (ent.devices || []).length;
    ent.devices = (ent.devices || []).filter(
      (d) => d.fingerprint !== fingerprint,
    );

    if ((ent.devices || []).length === before) {
      return res.status(404).json({ error: "Device not found" });
    }

    // keep legacy fields consistent
    if (ent.deviceFingerprint === fingerprint) {
      ent.deviceFingerprint = ent.devices?.[0]?.fingerprint;
      ent.deviceBoundAt = ent.devices?.[0]?.boundAt || undefined;
    }

    u.refreshVersion = (u.refreshVersion || 0) + 1;
    await u.save();

    return res.json({
      ok: true,
      message: "Device deleted",
      seats: ent.seats || 1,
      seatsUsed: activeDevices(ent).length,
    });
  }),
);

export default router;
