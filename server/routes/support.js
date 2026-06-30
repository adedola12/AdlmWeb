// server/routes/support.js
// User-facing support tickets: raise a technical-help request (with AnyDesk
// address for remote support) and list your own tickets. Mounted at
// /api/support. Admin management lives in admin.support.js.
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { SupportTicket } from "../models/SupportTicket.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const ADMIN_NOTIFY =
  process.env.SUPPORT_NOTIFY_EMAIL ||
  process.env.ADMIN_EMAIL ||
  "admin@adlmstudio.net";

// POST /api/support/tickets — create a ticket as the logged-in user.
router.post(
  "/tickets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
    if (!uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const anyDeskAddress = String(req.body?.anyDeskAddress || "").trim();
    const category = String(req.body?.category || "technical").trim();
    const productKey = String(req.body?.productKey || "").trim().toLowerCase();

    // Which ADLM software raised this. Reusable by web + any plugin: take an
    // explicit `source` from the body, else fall back to the productKey, the
    // x-adlm-client header, or "web". `appVersion` helps debugging per release.
    const source = (
      String(req.body?.source || "").trim() ||
      productKey ||
      String(req.get("x-adlm-client") || "").trim() ||
      "web"
    ).toLowerCase();
    const appVersion = String(
      req.body?.appVersion || req.get("x-adlm-app-version") || "",
    ).trim();

    if (!title) return res.status(400).json({ ok: false, error: "Title is required" });
    if (!description)
      return res.status(400).json({ ok: false, error: "Description is required" });

    const fullName =
      `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() ||
      req.user?.username ||
      "";

    const ticket = await SupportTicket.create({
      userId: uid,
      userEmail: (req.user?.email || "").toLowerCase(),
      userFullName: fullName,
      whatsapp: req.user?.whatsapp || "",
      title,
      description,
      anyDeskAddress,
      category: [
        "technical",
        "billing",
        "account",
        "general",
        "feature-request",
      ].includes(category)
        ? category
        : "technical",
      productKey,
      source,
      appVersion,
      status: "open",
    });

    // Confirm to the user (best-effort).
    if (ticket.userEmail) {
      sendMail({
        to: ticket.userEmail,
        subject: "We received your support request",
        html: `<p>Hi ${fullName || "there"},</p>
               <p>Thanks — we've logged your support request and the ADLM
               technical team will reach out${
                 anyDeskAddress ? " (we may connect via AnyDesk)" : ""
               }.</p>
               <p><b>Issue:</b> ${title}</p>
               <p><b>Reference:</b> ${ticket._id}</p>
               <p>— The ADLM Team</p>`,
      }).catch((e) => console.error("[support] user confirm mail:", e?.message));
    }

    // Notify the team (best-effort).
    sendMail({
      to: ADMIN_NOTIFY,
      subject: `New support ticket: ${title}`,
      html: `<p><b>New support ticket</b></p>
             <p><b>From:</b> ${fullName} (${ticket.userEmail})</p>
             <p><b>WhatsApp:</b> ${ticket.whatsapp || "—"}</p>
             <p><b>Category:</b> ${ticket.category}${
               productKey ? ` · <b>Product:</b> ${productKey}` : ""
             }</p>
             <p><b>Raised from:</b> ${source}${appVersion ? ` v${appVersion}` : ""}</p>
             <p><b>AnyDesk:</b> ${anyDeskAddress || "—"}</p>
             <p><b>Issue:</b> ${title}</p>
             <p style="white-space:pre-wrap">${description}</p>`,
    }).catch((e) => console.error("[support] admin notify mail:", e?.message));

    return res.json({ ok: true, ticket });
  }),
);

// GET /api/support/tickets/mine — the caller's own tickets.
router.get(
  "/tickets/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
    if (!uid) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const tickets = await SupportTicket.find({ userId: uid })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, tickets });
  }),
);

export default router;
