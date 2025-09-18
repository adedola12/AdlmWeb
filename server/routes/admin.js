import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js"; // <-- IMPORTANT

const router = express.Router();

// Admin: list users
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const list = await User.find(
    {},
    { email: 1, role: 1, disabled: 1, entitlements: 1, createdAt: 1 }
  ).sort({ createdAt: -1 });
  return res.json(list);
});

// Admin: set/extend entitlement (manual override tool you already had)
// body: { email, productKey, months, status }
router.post(
  "/users/entitlement",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { email, productKey, months = 0, status } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

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

// Admin: list purchases (?status=pending|approved|rejected)
router.get("/purchases", requireAuth, requireAdmin, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const list = await Purchase.find(q).sort({ createdAt: -1 }).limit(500);
  return res.json(list);
});

// Admin: approve a purchase and apply entitlement
// body: { months } optional; if omitted, uses purchase.requestedMonths
router.post(
  "/purchases/:id/approve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });
    if (p.status !== "pending")
      return res.status(400).json({ error: "Purchase not pending" });

    const months = Number(req.body?.months) || p.requestedMonths || 1;

    const u = await User.findById(p.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const now = dayjs();
    let ent = u.entitlements.find((e) => e.productKey === p.productKey);

    if (!ent) {
      ent = {
        productKey: p.productKey,
        status: "active",
        expiresAt: now.add(months, "month").toDate(),
      };
      u.entitlements.push(ent);
    } else {
      const base =
        ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
          ? dayjs(ent.expiresAt)
          : now;
      ent.status = "active";
      ent.expiresAt = base.add(months, "month").toDate();
    }

    await u.save();

    p.status = "approved";
    p.decidedBy = req.user.email;
    p.decidedAt = new Date();
    p.approvedMonths = months;
    await p.save();

    return res.json({ ok: true, purchase: p, entitlements: u.entitlements });
  }
);

// Admin: reject a purchase
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

// POST /admin/users/reset-device { email }
// POST /admin/users/reset-device  { email, productKey }
router.post("/users/reset-device", requireAuth, requireAdmin, async (req, res) => {
  const { email, productKey } = req.body || {};
  const u = await User.findOne({ email });
  if (!u) return res.status(404).json({ error: "User not found" });

  const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
  if (!ent) return res.status(404).json({ error: "Entitlement not found" });

  ent.deviceFingerprint = undefined;
  ent.deviceBoundAt = undefined;
  u.refreshVersion += 1;   // kick all current sessions
  await u.save();

  return res.json({ ok: true });
});



export default router;
