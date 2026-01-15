// server/routes/admin.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";
import { Coupon } from "../models/Coupon.js";

// ✅ FIX: Product was used but not imported (this caused "Product is not defined")
import { Product } from "../models/Product.js";
// If your Product model is default export instead, use:
// import Product from "../models/Product.js";

import { autoEnrollFromPurchase } from "../util/autoEnroll.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();

// ✅ all endpoints here require admin
router.use(requireAuth, requireAdmin);

/* -------------------- helpers -------------------- */
const asyncHandler =
  (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function addMonthsToEntitlement(userDoc, productKey, monthsToAdd) {
  userDoc.entitlements = userDoc.entitlements || [];

  const now = dayjs();
  let ent = userDoc.entitlements.find((e) => e.productKey === productKey);

  if (!ent) {
    ent = {
      productKey,
      status: "active",
      expiresAt: now.add(monthsToAdd, "month").toDate(),
    };
    userDoc.entitlements.push(ent);
  } else {
    const base =
      ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
        ? dayjs(ent.expiresAt)
        : now;

    ent.status = "active";
    ent.expiresAt = base.add(monthsToAdd, "month").toDate();
  }
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
  })
);

router.post(
  "/users/entitlement",
  asyncHandler(async (req, res) => {
    const { email, productKey, months = 0, status } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    u.entitlements = u.entitlements || [];
    const now = dayjs();

    let ent = u.entitlements.find((e) => e.productKey === productKey);

    if (!ent) {
      ent = {
        productKey,
        status: status || "active",
        expiresAt: (months ? now.add(months, "month") : now.add(1, "month")).toDate(),
      };
      u.entitlements.push(ent);
    } else {
      if (typeof status === "string") ent.status = status;
      if (months > 0) {
        const base =
          ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
            ? dayjs(ent.expiresAt)
            : now;
        ent.expiresAt = base.add(months, "month").toDate();
      }
    }

    await u.save();
    return res.json({ ok: true, entitlements: u.entitlements });
  })
);

router.get(
  "/purchases",
  asyncHandler(async (req, res) => {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    const list = await Purchase.find(q).sort({ createdAt: -1 }).limit(500);
    return res.json(list);
  })
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

    const overrideMonths = Number(req.body?.months);

    // Build grants from purchase
    const grants = [];
    if (Array.isArray(purchase.lines) && purchase.lines.length > 0) {
      purchase.lines.forEach((ln) => {
        const qty = Number(ln.qty || 0);
        const months = ln.billingInterval === "yearly" ? qty * 12 : qty;
        if (months > 0 && ln.productKey) {
          grants.push({ productKey: ln.productKey, months });
        }
      });
    } else if (purchase.productKey) {
      const months = overrideMonths || purchase.requestedMonths || 1;
      grants.push({ productKey: purchase.productKey, months });
      purchase.approvedMonths = months;
    } else {
      return res
        .status(400)
        .json({ error: "Nothing to approve for this purchase" });
    }

    // Decide which products require installation.
    // Rule: isCourse === true => no installation, apply immediately.
    const keys = [...new Set(grants.map((g) => g.productKey).filter(Boolean))];

    // ✅ uses Product model (now imported)
    const prods = await Product.find({ key: { $in: keys } })
      .select("key isCourse")
      .lean();

    const isCourseByKey = Object.fromEntries(
      (prods || []).map((p) => [p.key, !!p.isCourse])
    );

    const immediate = [];
    const staged = [];

    for (const g of grants) {
      if (isCourseByKey[g.productKey]) immediate.push(g);
      else staged.push(g);
    }

    // Apply immediate entitlements (courses)
    if (immediate.length) {
      immediate.forEach((g) => addMonthsToEntitlement(user, g.productKey, g.months));
      await user.save();
    }

    // Update purchase status
    purchase.status = "approved";
    purchase.decidedBy = req.user?.email || "admin";
    purchase.decidedAt = new Date();

    // Installation object defaults
    purchase.installation = purchase.installation || {};
    purchase.installation.anydeskUrl =
      purchase.installation.anydeskUrl ||
      "https://anydesk.com/en/downloads/windows";
    purchase.installation.installVideoUrl =
      purchase.installation.installVideoUrl || "";

    if (!Array.isArray(purchase.installation.entitlementGrants)) {
      purchase.installation.entitlementGrants = [];
    }

    if (staged.length > 0) {
      purchase.installation.status = "pending";
      purchase.installation.entitlementGrants = staged; // store staged items
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

    // Coupon redemption: only redeem instantly for course-only purchases
    if (
      purchase.coupon?.couponId &&
      !purchase.coupon.redeemedApplied &&
      staged.length === 0
    ) {
      await Coupon.updateOne(
        { _id: purchase.coupon.couponId },
        { $inc: { redeemedCount: 1 } }
      );
      purchase.coupon.redeemedApplied = true;
    }

    await purchase.save();

    // Send email (do not fail approval if email fails)
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
                ? `<p>Your subscription will start after installation is completed by our team.</p>
                   <p><b>Next steps:</b></p>
                   <ol>
                     <li>Download AnyDesk: <a href="https://anydesk.com/en/downloads/windows">Click here</a></li>
                     <li>Send us your AnyDesk Address</li>
                     ${
                       purchase.installation.installVideoUrl
                         ? `<li>Watch installation process video: <a href="${purchase.installation.installVideoUrl}">Watch</a></li>`
                         : ""
                     }
                   </ol>`
                : `<p>Your subscription is now active. You can start using your product immediately.</p>`
            }
            <p>Thank you for choosing ADLM.</p>
          </div>
        `,
      });
    } catch (e) {
      console.error("[admin approve] sendMail failed:", e?.message || e);
    }

    // Enroll (safe)
    try {
      await autoEnrollFromPurchase(purchase);
    } catch (e) {
      console.error("[admin approve] autoEnrollFromPurchase failed:", e?.message || e);
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
  })
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
  })
);

router.get(
  "/installations",
  asyncHandler(async (req, res) => {
    const q = {
      status: "approved",
      $and: [
        {
          $or: [
            { "installation.status": "pending" },
            { "installation.entitlementsApplied": false },
            { "installation.entitlementsApplied": { $exists: false } },
          ],
        },
        { "installation.entitlementGrants.0": { $exists: true } },
      ],
    };

    const list = await Purchase.find(q).sort({ decidedAt: -1 }).limit(500);
    return res.json(list);
  })
);

router.post(
  "/installations/:id/complete",
  asyncHandler(async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });

    p.installation = p.installation || {};

    const wasComplete = p.installation.status === "complete";

    p.installation.status = "complete";
    p.installation.markedBy = req.user?.email || "admin";
    p.installation.markedAt = new Date();

    const grants = Array.isArray(p.installation.entitlementGrants)
      ? p.installation.entitlementGrants
      : [];

    if (!p.installation.entitlementsApplied && grants.length > 0) {
      const user = await User.findById(p.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      grants.forEach((g) => {
        const m = Number(g?.months || 0);
        if (g?.productKey && m > 0) addMonthsToEntitlement(user, g.productKey, m);
      });

      await user.save();
      p.installation.entitlementsApplied = true;
      p.installation.entitlementsAppliedAt = new Date();
    } else if (!p.installation.entitlementsApplied && grants.length === 0) {
      p.installation.entitlementsApplied = true;
      p.installation.entitlementsAppliedAt = new Date();
    }

    // Coupon redemption now finalizes here
    if (p.coupon?.couponId && !p.coupon.redeemedApplied) {
      await Coupon.updateOne(
        { _id: p.coupon.couponId },
        { $inc: { redeemedCount: 1 } }
      );
      p.coupon.redeemedApplied = true;
    }

    await p.save();

    return res.json({
      ok: true,
      purchase: p,
      message: wasComplete
        ? "Installation already complete. Ensured entitlements/coupon are finalized."
        : "Installation marked complete. Subscription started and coupon finalized.",
    });
  })
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
    u.refreshVersion = (u.refresh
