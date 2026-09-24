// server/routes/admin.waitlist.js
//
// Admin side of the marketing forms: read the list, work it, export it.
// Mounted at /admin/waitlist behind the "waitlist" permission area.
import express from "express";
import mongoose from "mongoose";
import { WaitlistEntry } from "../models/WaitlistEntry.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const router = express.Router();
const requireStaff = [requireAuth, requirePermission("waitlist")];

const STATUSES = ["new", "contacted", "converted", "archived"];

// GET /admin/waitlist?topic=&status=&q=&page=&limit=
router.get("/", requireStaff, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const filter = {};
    if (req.query.topic) filter.topic = String(req.query.topic);
    if (req.query.status && STATUSES.includes(String(req.query.status))) {
      filter.status = String(req.query.status);
    }
    if (req.query.q) {
      // Escaped so a search for "a.b" cannot be read as a pattern.
      const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { email: rx }, { org: rx }, { message: rx }];
    }

    const [items, total, topics, counts] = await Promise.all([
      WaitlistEntry.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WaitlistEntry.countDocuments(filter),
      WaitlistEntry.distinct("topic"),
      WaitlistEntry.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);

    return res.json({
      ok: true,
      items,
      total,
      page,
      limit,
      topics: topics.sort(),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  } catch (err) {
    console.error("[admin.waitlist] list failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /admin/waitlist/export.csv — same filters as the list.
router.get("/export.csv", requireStaff, async (req, res) => {
  try {
    const filter = {};
    if (req.query.topic) filter.topic = String(req.query.topic);
    if (req.query.status && STATUSES.includes(String(req.query.status))) {
      filter.status = String(req.query.status);
    }
    const rows = await WaitlistEntry.find(filter).sort({ createdAt: -1 }).lean();

    const cols = [
      "createdAt", "topic", "name", "email", "org",
      "civil3d", "message", "status", "note", "submissions", "sourcePath",
    ];
    // A leading =, +, - or @ makes Excel treat the cell as a formula, so a
    // submitted name like "=cmd|..." would execute on open. Prefix with a
    // quote to neutralise it, then escape quotes normally.
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => cell(r[c])).join(",")),
    ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="waitlist.csv"');
    return res.send(`﻿${csv}`); // BOM so Excel reads UTF-8
  } catch (err) {
    console.error("[admin.waitlist] export failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /admin/waitlist/:id — status and note only.
router.patch("/:id", requireStaff, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "Bad id" });
    }
    const patch = {};
    if (req.body?.status !== undefined) {
      if (!STATUSES.includes(String(req.body.status))) {
        return res.status(400).json({ ok: false, error: "Unknown status" });
      }
      patch.status = String(req.body.status);
    }
    if (req.body?.note !== undefined) {
      patch.note = String(req.body.note).slice(0, 2000);
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: "Nothing to update" });
    }

    const item = await WaitlistEntry.findByIdAndUpdate(req.params.id, patch, {
      new: true,
    }).lean();
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[admin.waitlist] patch failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// DELETE /admin/waitlist/:id
router.delete("/:id", requireStaff, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "Bad id" });
    }
    const out = await WaitlistEntry.findByIdAndDelete(req.params.id).lean();
    if (!out) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin.waitlist] delete failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
