// server/routes/admin.audit.js
// Super-admin-only: read the audit trail and manage break-glass God accounts.
// Gated by the admin-exclusive "audit" permission area, so only super-admins
// (who implicitly hold every area) can reach it — it is never delegable.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { isGodEmail, godAccountsConfigured } from "../util/godAccount.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";

const router = express.Router();
const gate = requirePermission("audit");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GET /admin/audit-log — recent audit entries with light filtering.
router.get(
  "/",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    const { actorEmail = "", action = "", godOnly = "", limit = "200" } = req.query;
    const filter = {};
    if (actorEmail) filter.actorEmail = String(actorEmail).trim().toLowerCase();
    if (action) filter.action = new RegExp(String(action), "i");
    if (String(godOnly) === "true") filter.isGod = true;

    const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(lim).lean();
    return res.json({ ok: true, logs });
  }),
);

// GET /admin/audit-log/god-accounts — who holds the God flag, and whether the
// deploy env allowlist actually activates them.
router.get(
  "/god-accounts",
  requireAuth,
  gate,
  asyncHandler(async (_req, res) => {
    const users = await User.find({ isGod: true })
      .select("email firstName lastName role isGod createdAt")
      .lean();
    const accounts = users.map((u) => ({
      ...u,
      envAllowlisted: isGodEmail(u.email),
      active: u.isGod && isGodEmail(u.email),
    }));
    return res.json({
      ok: true,
      accounts,
      envConfigured: godAccountsConfigured(),
    });
  }),
);

// POST /admin/audit-log/god-accounts/grant { email }
// Sets the DB flag. The account only gains powers once the email is ALSO in the
// GOD_ACCOUNT_EMAILS deploy env var — we report that back so the admin knows
// whether a deploy change is still required.
router.post(
  "/god-accounts/grant",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    user.isGod = true;
    await user.save();

    await writeAudit({
      actorId: req.user?._id, actorEmail: req.user?.email, isGod: false,
      action: "god.grant", targetEmail: email, status: 200, ...reqAuditContext(req),
    });

    const envAllowlisted = isGodEmail(email);
    return res.json({
      ok: true,
      email,
      envAllowlisted,
      active: envAllowlisted,
      note: envAllowlisted
        ? "God access is active for this account."
        : "Flag set, but NOT yet active — add this email to GOD_ACCOUNT_EMAILS and redeploy to activate.",
    });
  }),
);

// POST /admin/audit-log/god-accounts/revoke { email }
router.post(
  "/god-accounts/revoke",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    user.isGod = false;
    await user.save();

    await writeAudit({
      actorId: req.user?._id, actorEmail: req.user?.email, isGod: false,
      action: "god.revoke", targetEmail: email, status: 200, ...reqAuditContext(req),
    });

    return res.json({
      ok: true,
      email,
      note: "DB flag cleared. Also remove this email from GOD_ACCOUNT_EMAILS for full revocation.",
    });
  }),
);

export default router;
