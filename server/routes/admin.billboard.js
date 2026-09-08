// The billboard: the band that rotates low on every public page.
//
// The admin half is ordinary CRUD. The two things worth reading are the
// public half at the bottom — which is what actually decides whether a
// visitor sees a slide — and the reorder, which writes the whole order in one
// pass so two slides can never claim the same position.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { BillboardSlide, slideState, today } from "../models/BillboardSlide.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";

const router = express.Router();
const hub = [requireAuth, requirePermission("adminhub")];

const shape = (s, now) => ({
  id: String(s._id),
  kind: s.kind,
  tag: s.tag,
  title: s.title,
  sub: s.sub || "",
  art: s.art || "",
  cta: s.cta,
  href: s.href,
  date: s.date || "",
  time: s.time || "",
  venue: s.venue || "",
  from: s.from || "",
  to: s.to || "",
  on: !!s.on,
  order: s.order || 0,
  state: slideState(s, now),
});

function readSlide(b = {}) {
  const kind = b.kind === "event" ? "event" : "notice";
  return {
    kind,
    tag: String(b.tag || "").trim(),
    title: String(b.title || "").trim(),
    sub: String(b.sub || "").trim(),
    art: String(b.art || "").trim(),
    cta: String(b.cta || "").trim(),
    href: String(b.href || "").trim(),
    // A notice that used to be an event keeps no stale date, or the band
    // would print a "when" line for something that has no when.
    date: kind === "event" ? String(b.date || "").trim() : "",
    time: kind === "event" ? String(b.time || "").trim() : "",
    venue: kind === "event" ? String(b.venue || "").trim() : "",
    from: String(b.from || "").trim(),
    to: String(b.to || "").trim(),
    on: !!b.on,
  };
}

function complain(d) {
  if (!d.tag) return "It needs an eyebrow — two or three words above the headline.";
  if (!d.title) return "It needs a headline.";
  if (d.title.length > 120) {
    return "Too long for the band — it wraps to four lines and loses the button.";
  }
  if (!d.cta) return "Say what the button says.";
  if (!d.href) return "Say where the button goes.";
  if (d.kind === "event" && !d.date) return "An event needs the date it happens.";
  if (d.from && d.to && d.to < d.from) return "It cannot stop before it starts.";
  return null;
}

/* ──────────────────────────────────────────────────────────────── the admin ── */

router.get("/", ...hub, async (_req, res, next) => {
  try {
    const now = today();
    const rows = await BillboardSlide.find({}).sort({ order: 1, createdAt: 1 }).lean();
    const items = rows.map((s) => shape(s, now));

    const counts = { all: items.length };
    for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;

    res.json({ items, counts, today: now });
  } catch (err) {
    next(err);
  }
});

router.post("/", ...hub, async (req, res, next) => {
  try {
    const d = readSlide(req.body);
    const bad = complain(d);
    if (bad) return res.status(400).json({ error: bad });

    // New slides go to the end of the rotation.
    const last = await BillboardSlide.findOne({}).sort({ order: -1 }).select("order").lean();
    const made = await BillboardSlide.create({ ...d, order: (last?.order || 0) + 1 });
    res.status(201).json({ id: String(made._id), state: slideState(made) });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", ...hub, async (req, res, next) => {
  try {
    const d = readSlide(req.body);
    const bad = complain(d);
    if (bad) return res.status(400).json({ error: bad });

    const hit = await BillboardSlide.findByIdAndUpdate(req.params.id, { $set: d }, { new: true });
    if (!hit) return res.status(404).json({ error: "No such slide" });
    res.json({ ok: true, state: slideState(hit) });
  } catch (err) {
    next(err);
  }
});

/** Take it down, or put it back. Separate from the edit: it is one decision. */
router.post("/:id/publish", ...hub, async (req, res, next) => {
  try {
    const on = !!req.body?.on;
    const hit = await BillboardSlide.findByIdAndUpdate(
      req.params.id,
      { $set: { on } },
      { new: true },
    );
    if (!hit) return res.status(404).json({ error: "No such slide" });
    res.json({ ok: true, on, state: slideState(hit) });
  } catch (err) {
    next(err);
  }
});

/**
 * Move a slide up or down the rotation.
 *
 * The whole order is rewritten from the resulting array rather than swapping
 * two numbers. Swapping looks cheaper and goes wrong the first time two rows
 * share an order — which they will, because `order` starts at 0 for anything
 * created before this route existed.
 */
router.post("/:id/move", ...hub, async (req, res, next) => {
  try {
    const dir = Number(req.body?.dir) < 0 ? -1 : 1;
    const rows = await BillboardSlide.find({}).sort({ order: 1, createdAt: 1 }).select("_id").lean();

    const i = rows.findIndex((r) => String(r._id) === req.params.id);
    if (i < 0) return res.status(404).json({ error: "No such slide" });

    const j = i + dir;
    if (j < 0 || j >= rows.length) return res.json({ ok: true, moved: false });

    [rows[i], rows[j]] = [rows[j], rows[i]];
    await Promise.all(
      rows.map((r, n) => BillboardSlide.updateOne({ _id: r._id }, { $set: { order: n + 1 } })),
    );
    res.json({ ok: true, moved: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", ...hub, async (req, res, next) => {
  try {
    const gone = await BillboardSlide.findByIdAndDelete(req.params.id).lean();
    if (!gone) return res.status(404).json({ error: "No such slide" });

    await writeAudit({
      actorId: req.user?._id,
      actorEmail: req.user?.email,
      action: "billboard.delete",
      status: 200,
      ...reqAuditContext(req),
      meta: { title: gone.title, kind: gone.kind },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

/* ─────────────────────────────────────────────────────────────── the public ── */

/**
 * What a visitor actually sees, in rotation order.
 *
 * Unauthenticated, and the only place the schedule is enforced: the admin
 * screen shows every slide with its state, this shows the live ones. A slide
 * that has ended is simply absent — nobody has to take it down.
 */
export const publicBillboard = express.Router();

publicBillboard.get("/", async (_req, res, next) => {
  try {
    const now = today();
    const rows = await BillboardSlide.find({ on: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const slides = rows
      .filter((s) => slideState(s, now) === "live")
      .map((s) => ({
        kind: s.kind,
        tag: s.tag,
        title: s.title,
        sub: s.sub || "",
        art: s.art || "",
        cta: s.cta,
        href: s.href,
        date: s.date || "",
        time: s.time || "",
        venue: s.venue || "",
      }));

    res.json({ slides });
  } catch (err) {
    next(err);
  }
});
