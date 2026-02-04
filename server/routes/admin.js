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

const ANYDESK_WINDOWS_URL = "https://anydesk.com/en/downloads/windows";

const APP_URL =
  String(process.env.PUBLIC_APP_URL || "").trim() || "http://localhost:5173";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

function hasOrgMeta({ licenseType, organizationName, organization } = {}) {
  const lt = String(licenseType || "").toLowerCase();
  const org1 = String(organizationName || "").trim();
  const org2 = String(organization?.name || "").trim();
  return lt === "organization" || !!org1 || !!org2;
}

function inferLicenseTypeFromMeta(licenseType, organizationName, organization) {
  return hasOrgMeta({ licenseType, organizationName, organization })
    ? "organization"
    : "personal";
}

function lineHasPeriods(ln) {
  return Object.prototype.hasOwnProperty.call(ln || {}, "periods");
}

function isEntExpiredAt(expiresAt) {
  if (!expiresAt) return false;
  const end = dayjs(expiresAt).endOf("day");
  return end.isValid() && end.isBefore(dayjs());
}

/**
 * ✅ Normalize entitlement object (legacy migration + safety)
 */
function normalizeLegacyEnt(ent) {
  if (!ent) return;

  if (!ent.seats || ent.seats < 1) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];

  const orgName = String(ent.organizationName || "").trim();
  const ltRaw = String(ent.licenseType || "").toLowerCase();

  // infer ONLY from orgName if missing/invalid
  if (ltRaw !== "personal" && ltRaw !== "organization") {
    ent.licenseType = orgName ? "organization" : "personal";
  }

  // If marked org but no orgName + legacy single-device fingerprint -> likely personal legacy
  if (
    ent.licenseType === "organization" &&
    !orgName &&
    ent.seats > 1 &&
    (!!ent.deviceFingerprint || (ent.devices || []).length <= 1)
  ) {
    ent.licenseType = "personal";
    ent.seats = 1;
  }

  // Personal must not have multi-seat
  if (ent.licenseType === "personal" && ent.seats > 1) ent.seats = 1;

  // legacy fallback deviceFingerprint -> devices[]
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

/**
 * ✅ Enforce expiry rule:
 * - If expired and status was active => set status = "expired"
 * - If not expired but status = "expired" (after renewal) => restore to active
 */
function applyExpiryToUser(userDoc) {
  if (!userDoc) return false;

  let changed = false;
  userDoc.entitlements = userDoc.entitlements || [];

  for (const ent of userDoc.entitlements) {
    normalizeLegacyEnt(ent);

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

  if (changed) {
    userDoc.refreshVersion = (userDoc.refreshVersion || 0) + 1;
  }

  return changed;
}

/**
 * Parse a purchase line into a normalized grant, with legacy fix:
 * - If personal + no periods field + qty > 1 => qty was duration (periods), NOT seats.
 */
function parseLineForGrant(purchase, ln) {
  const productKey = String(ln?.productKey || "").trim();
  if (!productKey) return null;

  const interval = normInterval(ln?.billingInterval);
  const intervalMonths = interval === "yearly" ? 12 : 1;

  const purchaseOrgName = String(purchase?.organization?.name || "").trim();
  const lineOrgName = String(ln?.organizationName || "").trim();

  const lt = inferLicenseTypeFromMeta(
    ln?.licenseType || purchase?.licenseType,
    lineOrgName || purchaseOrgName,
    purchase?.organization,
  );

  const rawQty = Math.max(Number(ln?.qty ?? 1), 1);
  const hasPeriods = lineHasPeriods(ln);
  const rawPeriods = hasPeriods ? Math.max(Number(ln?.periods ?? 1), 1) : 1;

  let seats = lt === "organization" ? rawQty : 1;
  let periods = rawPeriods;

  // ✅ legacy fix: personal duration stored in qty
  if (lt === "personal" && !hasPeriods && rawQty > 1) {
    periods = rawQty;
    seats = 1;
  }

  const months = periods * intervalMonths;

  return {
    productKey,
    months,
    seats,
    licenseType: lt,
    organizationName:
      lt === "organization" ? purchaseOrgName || lineOrgName : "",
  };
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

  const metaLt = inferLicenseTypeFromMeta(
    meta?.licenseType,
    meta?.organizationName,
    meta?.organization,
  );

  // org can have seats, personal is always 1
  const seatsFinal =
    metaLt === "organization" ? Math.max(Number(seatsToSet || 1), 1) : 1;

  const organizationName =
    metaLt === "organization"
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
      licenseType: metaLt,
      organizationName: organizationName || undefined,
    });
    return;
  }

  normalizeLegacyEnt(ent);

  // ✅ if expired, start from NOW; if still valid, extend from current expiry
  const base =
    ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
      ? dayjs(ent.expiresAt)
      : now;

  ent.status = "active";
  ent.expiresAt = base.add(monthsToAdd, "month").toDate();

  // org is "sticky" (don’t accidentally downgrade)
  const targetLt = ent.licenseType === "organization" ? "organization" : metaLt;

  if (targetLt === "organization") {
    ent.licenseType = "organization";
    ent.seats = Math.max(Number(ent.seats || 1), seatsFinal);
    if (organizationName) ent.organizationName = organizationName;
  } else {
    ent.licenseType = "personal";
    ent.seats = 1;
    ent.organizationName = undefined;
  }
}

/**
 * Normalize + merge grants by productKey.
 * IMPORTANT: do NOT infer org from seats alone (legacy qty can be duration).
 */
function normalizeGrants(grants, defaults = {}) {
  const map = new Map();

  const defOrg = String(defaults.organizationName || "").trim();
  const defLt = inferLicenseTypeFromMeta(
    defaults.licenseType,
    defOrg,
    defaults.organization,
  );

  for (const g of Array.isArray(grants) ? grants : []) {
    const k = String(g?.productKey || "").trim();
    const m = Number(g?.months || 0);

    if (!k || !Number.isFinite(m) || m <= 0) continue;

    const orgName = String(g?.organizationName || defOrg).trim();
    const lt = inferLicenseTypeFromMeta(g?.licenseType || defLt, orgName, null);

    const sRaw = Math.max(Number(g?.seats || 1), 1);
    const s = lt === "organization" ? sRaw : 1;

    const prev = map.get(k) || {
      months: 0,
      seats: 1,
      licenseType: defLt,
      organizationName: defOrg,
    };

    const mergedOrgName = String(
      prev.organizationName || orgName || defOrg,
    ).trim();

    const mergedLt = inferLicenseTypeFromMeta(
      prev.licenseType === "organization" || lt === "organization"
        ? "organization"
        : "personal",
      mergedOrgName,
      null,
    );

    const nextSeats = mergedLt === "organization" ? Math.max(prev.seats, s) : 1;

    map.set(k, {
      months: prev.months + m,
      seats: nextSeats,
      licenseType: mergedLt,
      organizationName: mergedLt === "organization" ? mergedOrgName : "",
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

function buildGrantsFromPurchase(purchase, overrideMonths = 0) {
  const grants = [];

  const purchaseOrgName = String(purchase?.organization?.name || "").trim();
  const purchaseLt = inferLicenseTypeFromMeta(
    purchase?.licenseType,
    purchaseOrgName,
    purchase?.organization,
  );

  if (Array.isArray(purchase.lines) && purchase.lines.length > 0) {
    for (const ln of purchase.lines) {
      const parsed = parseLineForGrant(purchase, ln);
      if (!parsed) continue;

      grants.push({
        productKey: parsed.productKey,
        months: parsed.months,
        seats: parsed.seats,
        licenseType: parsed.licenseType,
        organizationName:
          parsed.licenseType === "organization"
            ? parsed.organizationName || purchaseOrgName
            : "",
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
      licenseType: purchaseLt,
      organizationName: purchaseLt === "organization" ? purchaseOrgName : "",
    });
  }

  return normalizeGrants(grants, {
    licenseType: purchaseLt,
    organizationName: purchaseOrgName,
    organization: purchase?.organization,
  });
}

async function getIsCourseMap(keys) {
  if (!keys?.length) return {};
  const prods = await Product.find({ key: { $in: keys } })
    .select("key isCourse")
    .lean();
  return Object.fromEntries((prods || []).map((p) => [p.key, !!p.isCourse]));
}

function buildApproveEmailHtml({
  firstName,
  receiptLink,
  anydeskLink,
  isPendingInstall,
}) {
  const name = String(firstName || "").trim() || "there";

  const btn = (href, label, bg) => `
    <a href="${href}"
       style="display:inline-block;padding:12px 16px;border-radius:10px;
              background:${bg};color:#ffffff;text-decoration:none;font-weight:600;
              margin-right:10px;margin-top:8px">
      ${label}
    </a>
  `;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 10px 0">Purchase Approved ✅</h2>
      <p style="margin:0 0 12px 0">Hello ${name},</p>

      ${
        isPendingInstall
          ? `<p style="margin:0 0 12px 0">
               Your purchase has been approved. Installation is currently <b>pending</b>.
               Our team will complete installation and activate your subscription.
             </p>`
          : `<p style="margin:0 0 12px 0">
               Your purchase has been approved and your access is now <b>active</b>.
             </p>`
      }

      <div style="margin:10px 0 18px 0">
        ${btn(receiptLink, "Open Receipt (Print / PDF)", "#2563eb")}
        ${btn(anydeskLink, "Download AnyDesk (Windows)", "#0f172a")}
      </div>

      <p style="margin:0 0 6px 0;color:#475569;font-size:13px">
        Tip: If you cannot download PDF, click <b>Print</b> and choose “Save as PDF”.
      </p>

      <p style="margin:18px 0 0 0">Thank you,<br/>ADLM Studio</p>
    </div>
  `;
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
      refreshVersion: 1,
    }).sort({ createdAt: -1 });

    // ✅ enforce expiry -> status becomes "expired" (no ghost-active entitlements)
    const saves = [];
    for (const u of list) {
      if (applyExpiryToUser(u)) saves.push(u.save());
    }
    if (saves.length) await Promise.all(saves);

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

    applyExpiryToUser(u);

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

    // ✅ ensure user expiry statuses are enforced before applying new months
    applyExpiryToUser(user);

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
      purchase.installation.anydeskUrl || ANYDESK_WINDOWS_URL;
    purchase.installation.installVideoUrl =
      purchase.installation.installVideoUrl || "";

    if (staged.length > 0) {
      purchase.installation.status = "pending";
      purchase.installation.entitlementGrants = normalizeGrants(staged, {
        licenseType: purchase.licenseType,
        organizationName: purchase.organization?.name,
        organization: purchase?.organization,
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

    // ✅ Save first (so receipt link is valid and state is consistent)
    await purchase.save();

    const receiptLink = joinUrl(APP_URL, `/receipt/${purchase._id}`);
    const anydeskLink = purchase.installation.anydeskUrl || ANYDESK_WINDOWS_URL;

    // ✅ ONE email only (no transporter, no duplicates)
    try {
      const isPendingInstall = staged.length > 0;
      const firstName =
        purchase.firstName || user.firstName || user.username || "";

      await sendMail({
        to: purchase.email || user.email,
        subject: isPendingInstall
          ? "ADLM Purchase Approved — Installation Pending"
          : "ADLM Purchase Approved — Activated",
        html: buildApproveEmailHtml({
          firstName,
          receiptLink,
          anydeskLink,
          isPendingInstall,
        }),
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

    const purchaseOrgName = String(p.organization?.name || "").trim();
    const purchaseLt = inferLicenseTypeFromMeta(
      p.licenseType,
      purchaseOrgName,
      p.organization,
    );

    // ✅ normalize whatever is stored
    let grants = normalizeGrants(p.installation.entitlementGrants, {
      licenseType: purchaseLt,
      organizationName: purchaseOrgName,
      organization: p.organization,
    });

    // ✅ If grants missing (legacy), rebuild from purchase lines/productKey
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

      applyExpiryToUser(user);

      installGrants.forEach((g) =>
        addMonthsToEntitlement(user, g.productKey, Number(g.months), g.seats, {
          licenseType: g.licenseType || purchaseLt,
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

    applyExpiryToUser(u);

    u.entitlements = u.entitlements || [];
    const now = dayjs();

    let ent = u.entitlements.find((e) => e.productKey === productKey);

    const org = String(organizationName || "").trim();
    const lt = inferLicenseTypeFromMeta(licenseType, org, null);

    const seatsFinal =
      lt === "organization" ? Math.max(Number(seats || 1), 1) : 1;

    if (!ent) {
      ent = {
        productKey,
        status: status || "active",
        seats: seatsFinal,
        expiresAt: (months
          ? now.add(months, "month")
          : now.add(1, "month")
        ).toDate(),
        licenseType: lt,
        organizationName: lt === "organization" ? org || undefined : undefined,
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

      // org is sticky; don’t downgrade unintentionally
      const targetLt = ent.licenseType === "organization" ? "organization" : lt;

      if (targetLt === "organization") {
        ent.licenseType = "organization";
        ent.seats = Math.max(Number(ent.seats || 1), seatsFinal);
        if (org) ent.organizationName = org;
      } else {
        ent.licenseType = "personal";
        ent.seats = 1;
        ent.organizationName = undefined;
      }
    }

    applyExpiryToUser(u);

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

    applyExpiryToUser(u);

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

    applyExpiryToUser(u);

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

    applyExpiryToUser(u);

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

    applyExpiryToUser(u);

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

    applyExpiryToUser(u);

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
