import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";
import { Coupon } from "../models/Coupon.js";
import { autoEnrollFromPurchase } from "../util/autoEnroll.js";
import { sendMail } from "../util/mailer.js"; // ✅ FIX: missing import

const router = express.Router();

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
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
});

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

router.post(
  "/users/entitlement",
  requireAuth,
  requireAdmin,
  async (req, res) => {
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
        expiresAt: (months
          ? now.add(months, "month")
          : now.add(1, "month")
        ).toDate(),
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
  }
);

router.get("/purchases", requireAuth, requireAdmin, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const list = await Purchase.find(q).sort({ createdAt: -1 }).limit(500);
  return res.json(list);
});

router.post(
  "/purchases/:id/approve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    if (purchase.status !== "pending")
      return res.status(400).json({ error: "Purchase not pending" });

    const user = await User.findById(purchase.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const overrideMonths = Number(req.body?.months);

    // Apply entitlements
    if (Array.isArray(purchase.lines) && purchase.lines.length > 0) {
      purchase.lines.forEach((ln) => {
        const months =
          ln.billingInterval === "yearly" ? (ln.qty || 0) * 12 : ln.qty || 0;
        if (months > 0) addMonthsToEntitlement(user, ln.productKey, months);
      });
    } else if (purchase.productKey) {
      const months = overrideMonths || purchase.requestedMonths || 1;
      addMonthsToEntitlement(user, purchase.productKey, months);
      purchase.approvedMonths = months;
    } else {
      return res
        .status(400)
        .json({ error: "Nothing to approve for this purchase" });
    }

    // Coupon redemption increments ONLY once (idempotent)
    if (purchase.coupon?.couponId && !purchase.coupon.redeemedApplied) {
      await Coupon.updateOne(
        { _id: purchase.coupon.couponId },
        { $inc: { redeemedCount: 1 } }
      );
      purchase.coupon.redeemedApplied = true;
    }

    await user.save();

    purchase.status = "approved";
    purchase.decidedBy = req.user.email;
    purchase.decidedAt = new Date();

    // mark installation as pending
    purchase.installation = purchase.installation || {};
    purchase.installation.status = "pending";
    purchase.installation.anydeskUrl =
      purchase.installation.anydeskUrl ||
      "https://anydesk.com/en/downloads/windows";
    purchase.installation.installVideoUrl =
      purchase.installation.installVideoUrl || "";

    await purchase.save();

    // send email (safe)
    try {
      await sendMail({
        to: user.email,
        subject: "ADLM Purchase Approved — Installation Pending",
        html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>Your purchase has been approved ✅</h2>
          <p>Your subscription is now active, and our team will proceed with software installation.</p>
          <p><b>Next steps:</b></p>
          <ol>
            <li>Download AnyDesk: <a href="https://anydesk.com/en/downloads/windows">Click here</a></li>
            <li>Send us your AnyDesk Address</li>
            ${
              purchase.installation.installVideoUrl
                ? `<li>Watch installation process video: <a href="${purchase.installation.installVideoUrl}">Watch</a></li>`
                : ""
            }
          </ol>
          <p>Thank you for choosing ADLM.</p>
        </div>
      `,
      });
    } catch (e) {
      console.error("[admin approve] sendMail failed:", e?.message || e);
    }

    await autoEnrollFromPurchase(purchase);

    return res.json({
      ok: true,
      purchase,
      entitlements: user.entitlements,
      message: "Purchase approved and entitlements updated.",
    });
  }
);

router.post(
  "/purchases/:id/reject",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });
    if (p.status !== "pending")
      return res.status(400).json({ error: "Purchase not pending" });

    p.status = "rejected";
    p.decidedBy = req.user.email;
    p.decidedAt = new Date();
    await p.save();

    return res.json({ ok: true, purchase: p });
  }
);

router.get("/installations", requireAuth, requireAdmin, async (req, res) => {
  const q = { status: "approved", "installation.status": "pending" };
  const list = await Purchase.find(q).sort({ decidedAt: -1 }).limit(500);
  return res.json(list);
});

router.post(
  "/installations/:id/complete",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });

    p.installation = p.installation || {};
    p.installation.status = "complete";
    p.installation.markedBy = req.user.email;
    p.installation.markedAt = new Date();

    await p.save();
    return res.json({ ok: true, purchase: p });
  }
);

router.post(
  "/users/reset-device",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { email, productKey } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
    if (!ent) return res.status(404).json({ error: "Entitlement not found" });

    ent.deviceFingerprint = undefined;
    ent.deviceBoundAt = undefined;
    u.refreshVersion = (u.refreshVersion || 0) + 1;

    await u.save();
    return res.json({ ok: true });
  }
);

export default router;
