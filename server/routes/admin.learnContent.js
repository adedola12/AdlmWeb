// server/routes/admin.learnContent.js
//
// The Learning and Content registers.
//
// His admin-catalogue.js covers Catalogue, Learning, Content and System in one
// file for the reason he gives there: they are one table with different
// columns. Same here — ten registers, one router, because the shape of the
// question is identical and only the join changes.
//
// WHAT EACH ONE HAD TO BE JOINED TO
//
// A register is only worth opening if it answers something the raw collection
// cannot. So:
//
//   Courses     — a course document says nothing about whether anybody is on
//                 it. Enrolments and completions are counted per SKU, because
//                 "27 enrolled, 3 finished" is the fact that decides whether a
//                 course is working.
//   Quizzes     — 34 exist and 33 are drafts written by a script from the
//                 lecture transcripts. Published vs draft is the only state
//                 that matters, and it is what stops a machine-written
//                 question reaching a student.
//   Free lessons— watch counts would be the useful join and nothing records
//                 them per lesson, so the register says what it can and does
//                 not invent engagement.
//
// Everything else is a straight read with its publish state made legible.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { Quiz } from "../models/Quiz.js";
// The model is exported as FreeVideo; the file is Learn.js.
import { FreeVideo as Learn } from "../models/Learn.js";
import { Classroom } from "../models/Classroom.js";
import { Training } from "../models/Training.js";
// Exported as ChangelogProduct — one row per product, with its releases.
import { ChangelogProduct as Changelog } from "../models/Changelog.js";
// Exported as IndustryLeader — the marketing screen calls them showcase.
import { IndustryLeader as Showcase } from "../models/Showcase.js";
import { Flyer } from "../models/Flyer.js";
import { Freebie } from "../models/Freebie.js";

const router = express.Router();

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const learn = [requireAuth, requirePermission("learn")];
const hub = [requireAuth, requirePermission("adminhub")];

/** published | draft — one word, so the tone table can colour it. */
const pubState = (on) => (on ? "active" : "draft");

/* ─────────────────────────────────────────────────────────────── courses ── */

router.get("/courses", ...learn, async (_req, res, next) => {
  try {
    const [courses, enrolments] = await Promise.all([
      PaidCourse.find({}).sort({ sort: 1, title: 1 }).lean(),
      // Grouped in the database rather than pulled and counted here: 27 rows
      // today, but a course that works will not stay at 27.
      CourseEnrollment.aggregate([
        {
          $group: {
            _id: "$courseSku",
            enrolled: { $sum: 1 },
            finished: { $sum: { $cond: [{ $ifNull: ["$certificateIssuedAt", false] }, 1, 0] } },
            modulesDone: { $sum: { $size: { $ifNull: ["$completedModules", []] } } },
          },
        },
      ]),
    ]);

    const bySku = new Map(enrolments.map((e) => [e._id, e]));

    const items = courses.map((c) => {
      const e = bySku.get(c.sku) || { enrolled: 0, finished: 0, modulesDone: 0 };
      const modules = (c.modules || []).length;
      return {
        id: String(c._id),
        sku: c.sku || "",
        name: c.title || c.sku,
        blurb: c.blurb || "",
        modules,
        // How many of those lectures have a transcript, which is what the
        // player's transcript tab and the quiz drafts both depend on.
        transcribed: (c.modules || []).filter((m) => m.transcriptStatus === "COMPLETED").length,
        enrolled: e.enrolled,
        finished: e.finished,
        // Where they stall, in his words: the average share of the course
        // people have actually got through.
        progress: e.enrolled && modules ? Math.round((e.modulesDone / (e.enrolled * modules)) * 100) : 0,
        state: pubState(c.isPublished),
      };
    });

    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────── quizzes ── */

router.get("/quizzes", ...learn, async (_req, res, next) => {
  try {
    const [quizzes, courses] = await Promise.all([
      Quiz.find({}).sort({ courseSku: 1, moduleCode: 1 }).lean(),
      PaidCourse.find({}).select("sku title modules").lean(),
    ]);

    const titleFor = new Map(courses.map((c) => [c.sku, c.title]));
    const moduleName = new Map();
    for (const c of courses) {
      for (const m of c.modules || []) moduleName.set(`${c.sku}/${m.code}`, m.title);
    }

    const items = quizzes.map((q) => ({
      id: String(q._id),
      course: titleFor.get(q.courseSku) || q.courseSku || "",
      module: moduleName.get(`${q.courseSku}/${q.moduleCode}`) || q.moduleCode || "",
      name: q.title || "Untitled check",
      questions: (q.questions || []).length,
      passMark: n0(q.passMark),
      maxAttempts: n0(q.maxAttempts),
      state: pubState(q.isPublished),
      updatedAt: q.updatedAt || null,
    }));

    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────── free lessons ── */

router.get("/lessons", ...learn, async (_req, res, next) => {
  try {
    const rows = await Learn.find({}).sort({ sort: 1, createdAt: -1 }).lean();
    const items = rows.map((l) => ({
      id: String(l._id),
      name: l.title || "Untitled",
      youtubeId: l.youtubeId || "",
      sort: n0(l.sort),
      state: pubState(l.isPublished),
      createdAt: l.createdAt || null,
    }));
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────────── events ── */

router.get("/events", ...[requireAuth, requirePermission("trainings")], async (_req, res, next) => {
  try {
    const rows = await Training.find({}).sort({ date: -1 }).lean();
    const now = Date.now();
    const items = rows.map((t) => ({
      id: String(t._id),
      name: t.title || "Untitled",
      mode: t.mode || "",
      where: [t.venue, t.city, t.country].filter(Boolean).join(", "),
      date: t.date || null,
      attendees: n0(t.attendees),
      // Past and upcoming are the only two states a training has, and nothing
      // records a capacity — so there is no "full", and the screen does not
      // pretend otherwise.
      state: t.date && new Date(t.date).getTime() < now ? "closed" : "active",
    }));
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────── classrooms ── */

router.get("/classrooms", ...[requireAuth, requirePermission("trainings")], async (_req, res, next) => {
  try {
    const rows = await Classroom.find({}).sort({ createdAt: -1 }).lean();
    const items = rows.map((c) => ({
      id: String(c._id),
      name: c.title || "Untitled",
      who: c.userName || c.userEmail || "",
      email: c.userEmail || "",
      company: c.companyName || "",
      code: c.classroomCode || "",
      url: c.classroomUrl || "",
      state: c.isActive ? "active" : "closed",
      createdAt: c.createdAt || null,
    }));
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────── what's new ── */

router.get("/changelogs", ...hub, async (_req, res, next) => {
  try {
    const rows = await Changelog.find({}).sort({ order: 1, name: 1 }).lean();
    const items = rows.map((c) => {
      const releases = c.releases || [];
      const latest = releases[0] || null;
      return {
        id: String(c._id),
        name: c.name || c.slug,
        slug: c.slug || "",
        tagline: c.tagline || "",
        category: c.category || "",
        releases: releases.length,
        latest: latest ? latest.version || latest.name || "" : "",
        latestAt: latest ? latest.date || latest.on || null : null,
        state: String(c.status || "").toLowerCase() === "live" ? "active" : c.status || "draft",
      };
    });
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────── marketing ── */

router.get("/showcase", ...[requireAuth, requirePermission("showcase")], async (_req, res, next) => {
  try {
    const rows = await Showcase.find({}).sort({ featured: -1, name: 1 }).lean();
    const items = rows.map((s) => ({
      id: String(s._id),
      name: s.name || "",
      code: s.code || "",
      website: s.website || "",
      logoUrl: s.logoUrl || "",
      state: s.featured ? "active" : "calm",
      featured: !!s.featured,
      createdAt: s.createdAt || null,
    }));
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────────── flyers ── */

router.get("/flyers", ...[requireAuth, requirePermission("flyers")], async (_req, res, next) => {
  try {
    const rows = await Flyer.find({}).sort({ createdAt: -1 }).lean();
    const items = rows.map((f) => ({
      id: String(f._id),
      name: f.title || "Untitled",
      template: f.template || "",
      thumbnailUrl: f.thumbnailUrl || "",
      by: f.createdBy || "",
      state: pubState(f.published),
      createdAt: f.createdAt || null,
    }));
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────── freebies ── */

router.get("/freebies", ...[requireAuth, requirePermission("freebies")], async (_req, res, next) => {
  try {
    const rows = await Freebie.find({}).sort({ createdAt: -1 }).lean();
    const items = rows.map((f) => ({
      id: String(f._id),
      name: f.title || "Untitled",
      blurb: f.description || "",
      videos: (f.videos || []).length,
      downloadUrl: f.downloadUrl || "",
      by: f.createdBy || "",
      state: pubState(f.published),
      createdAt: f.createdAt || null,
    }));
    res.json({ items, counts: tally(items) });
  } catch (err) {
    next(err);
  }
});

/** Counts by state, for the filter row. */
function tally(items) {
  const counts = { all: items.length };
  for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;
  return counts;
}

export default router;
