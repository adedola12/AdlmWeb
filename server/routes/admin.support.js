// server/routes/admin.support.js
// Admin management of support tickets — list, view, update (status / schedule /
// notes / assignment), delete. Gated by the staff-grantable "support" area, so
// it can be delegated to a support mini-admin. Mounted at /admin/support-tickets
// (must be registered BEFORE the "/admin" catch-all in index.js).
import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { SupportTicket } from "../models/SupportTicket.js";
import { sendMail } from "../util/mailer.js";

const router = express.Router();
const gate = requirePermission("support");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const STATUSES = ["open", "scheduled", "in-progress", "resolved", "closed"];

// GET /admin/support-tickets?status=&search=
router.get(
  "/",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    const { status = "", search = "" } = req.query;
    const filter = {};
    if (status && STATUSES.includes(status)) filter.status = status;
    if (search) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$or = [
        { title: rx },
        { description: rx },
        { userEmail: rx },
        { userFullName: rx },
        { anyDeskAddress: rx },
      ];
    }
    const tickets = await SupportTicket.find(filter)
      .populate("assignedTo", "email firstName lastName")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, tickets });
  }),
);

// GET /admin/support-tickets/:id
router.get(
  "/:id",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id))
      return res.status(400).json({ ok: false, error: "Invalid ticket id" });
    const ticket = await SupportTicket.findById(req.params.id)
      .populate("assignedTo", "email firstName lastName")
      .lean();
    if (!ticket) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, ticket });
  }),
);

// PATCH /admin/support-tickets/:id — status / schedule / notes / assignment.
router.patch(
  "/:id",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id))
      return res.status(400).json({ ok: false, error: "Invalid ticket id" });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ ok: false, error: "Not found" });

    const prevStatus = ticket.status;

    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status))
        return res.status(400).json({ ok: false, error: "Invalid status" });
      ticket.status = req.body.status;
      if (req.body.status === "resolved" && !ticket.resolvedAt)
        ticket.resolvedAt = new Date();
    }
    if (req.body.adminNotes !== undefined)
      ticket.adminNotes = String(req.body.adminNotes || "");
    if (req.body.scheduledForFixingAt !== undefined) {
      ticket.scheduledForFixingAt = req.body.scheduledForFixingAt
        ? new Date(req.body.scheduledForFixingAt)
        : null;
    }
    if (req.body.assignedTo !== undefined) {
      ticket.assignedTo =
        req.body.assignedTo && isValidId(req.body.assignedTo)
          ? req.body.assignedTo
          : null;
    }

    await ticket.save();

    // Notify the user when the status meaningfully changes (best-effort).
    if (
      ticket.userEmail &&
      req.body.status &&
      req.body.status !== prevStatus &&
      ["scheduled", "in-progress", "resolved"].includes(ticket.status)
    ) {
      const when = ticket.scheduledForFixingAt
        ? new Date(ticket.scheduledForFixingAt).toDateString()
        : "";
      const lines = {
        scheduled: `Your support request "${ticket.title}" has been scheduled${
          when ? ` for ${when}` : ""
        }.`,
        "in-progress": `We're now working on your support request "${ticket.title}".`,
        resolved: `Your support request "${ticket.title}" has been marked resolved.`,
      };
      sendMail({
        to: ticket.userEmail,
        subject: "Update on your ADLM support request",
        html: `<p>Hi ${ticket.userFullName || "there"},</p>
               <p>${lines[ticket.status]}</p>
               <p>— The ADLM Team</p>`,
      }).catch((e) => console.error("[admin.support] status mail:", e?.message));
    }

    const populated = await SupportTicket.findById(ticket._id)
      .populate("assignedTo", "email firstName lastName")
      .lean();
    return res.json({ ok: true, ticket: populated });
  }),
);

// DELETE /admin/support-tickets/:id
router.delete(
  "/:id",
  requireAuth,
  gate,
  asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id))
      return res.status(400).json({ ok: false, error: "Invalid ticket id" });
    const deleted = await SupportTicket.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true });
  }),
);

export default router;
