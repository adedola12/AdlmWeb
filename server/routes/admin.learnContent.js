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
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
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

/** A YouTube id out of whatever form of link was pasted. */
const youtubeIdOf = (url) => {
  const s = String(url || "").trim();
  if (!s) return "";
  // Already an id rather than a link — 11 characters, no slashes.
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : "";
};

/* ─────────────────────────────────────────────────────────────── courses ── */

/**
 * Courses — the paid courses and the free videos in one register.
 *
 * They are one screen because they are the same object with a price on one of
 * them: both are a card on the public Learn page, both need a cover, and the
 * question asked of both is "is anybody getting through it".
 *
 * WHERE THEY STALL
 *
 * The column worth having, and the one that needs real work to produce. For
 * each course we count how many enrolments have completed each module, walk
 * the modules in order, and name the one with the largest fall from the module
 * before it. That is where people stop — not the module with the fewest
 * completions, which is always the last one and says nothing.
 */
router.get("/courses", ...learn, async (_req, res, next) => {
  try {
    const [courses, freeVideos, enrolments, quizzes, products] = await Promise.all([
      PaidCourse.find({}).sort({ sort: 1, title: 1 }).lean(),
      Learn.find({}).sort({ sort: 1, title: 1 }).lean(),
      CourseEnrollment.find({}).select("courseSku completedModules certificateIssuedAt").lean(),
      Quiz.aggregate([{ $group: { _id: "$courseSku", n: { $sum: 1 } } }]),
      // A course is priced as a product carrying its SKU. Reading the price off
      // the product rather than storing a second copy on the course is what
      // stops the register quoting a figure checkout would not charge.
      Product.find({ courseSku: { $nin: [null, ""] } }).select("courseSku price priceNGN").lean(),
    ]);

    const quizCount = new Map(quizzes.map((q) => [q._id, q.n]));
    const priceFor = new Map(products.map((p) => [p.courseSku, n0(p.priceNGN) || n0(p.price)]));

    // Enrolments grouped in memory: the completedModules array has to be walked
    // per module anyway, which an aggregate cannot do without unwinding it into
    // far more documents than there are enrolments.
    const byCourse = new Map();
    for (const e of enrolments) {
      const g = byCourse.get(e.courseSku) || { enrolled: 0, finished: 0, done: new Map() };
      g.enrolled += 1;
      if (e.certificateIssuedAt) g.finished += 1;
      for (const code of e.completedModules || []) {
        g.done.set(code, (g.done.get(code) || 0) + 1);
      }
      byCourse.set(e.courseSku, g);
    }

    const stallOf = (mods, g) => {
      if (!g || g.enrolled < 3 || mods.length < 2) return null;
      let worst = null;
      let prev = g.enrolled;
      for (const m of mods) {
        const got = g.done.get(m.code) || 0;
        const fell = prev - got;
        if (fell > 0 && (!worst || fell > worst.fell)) worst = { fell, m };
        prev = got;
      }
      // A drop nobody would act on is not worth colouring the row for.
      return worst && worst.fell >= Math.max(2, g.enrolled * 0.2)
        ? `${worst.m.title || worst.m.code}`
        : null;
    };

    const paid = courses.map((c) => {
      const mods = c.modules || [];
      const g = byCourse.get(c.sku);
      const recorded = mods.filter((m) => m.videoUrl).length;
      const secs = mods.reduce((t, m) => t + n0(m.durationSec), 0);
      return {
        id: String(c._id),
        kind: "paid",
        sku: c.sku || "",
        name: c.title || c.sku,
        blurb: c.blurb || "",
        cover: c.thumbnailUrl || null,
        preview: c.onboardingVideoUrl || null,
        modules: mods.length,
        recorded,
        minutes: Math.round(secs / 60),
        quizzes: quizCount.get(c.sku) || 0,
        transcribed: mods.filter((m) => m.transcriptStatus === "COMPLETED").length,
        price: priceFor.get(c.sku) ?? null,
        enrolled: g?.enrolled || 0,
        finished: g?.finished || 0,
        stall: stallOf(mods, g),
        published: !!c.isPublished,
        state: pubState(c.isPublished),
      };
    });

    // A free video is one clip and no modules, so "recorded" is whether the
    // clip exists at all rather than a count of lectures.
    const free = freeVideos.map((v) => ({
      id: String(v._id),
      kind: "free",
      sku: "",
      name: v.title || "Untitled",
      blurb: v.productLabel || "",
      cover: v.thumbnailUrl || null,
      preview: v.youtubeId ? `https://youtu.be/${v.youtubeId}` : null,
      modules: 0,
      recorded: v.youtubeId ? 1 : 0,
      minutes: Math.round(n0(v.durationSec) / 60),
      quizzes: 0,
      transcribed: 0,
      price: null,
      // Nothing counts a view per free video, so these stay at zero rather than
      // being filled with a number that means nothing.
      enrolled: 0,
      finished: 0,
      stall: null,
      published: !!v.isPublished,
      state: pubState(v.isPublished),
    }));

    const items = [...paid, ...free];
    res.json({
      items,
      counts: {
        all: items.length,
        paid: paid.length,
        free: free.length,
        ...tally(items),
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────── courses: the editor ── */

/**
 * A course's modules, for the panel behind "Modules".
 *
 * Numbered here rather than in the browser: the number is the module's place
 * in the course, and a render index would quietly become "position in the
 * list you are currently looking at".
 */
router.get("/courses/:id/modules", ...learn, async (req, res, next) => {
  try {
    const c = await PaidCourse.findById(req.params.id).select("modules title").lean();
    if (!c) return res.status(404).json({ error: "No such course" });
    const items = (c.modules || []).map((m, i) => ({
      n: i + 1,
      code: m.code || "",
      title: m.title || "",
      video: m.videoUrl || null,
      mins: Math.round(n0(m.durationSec) / 60),
      transcribed: m.transcriptStatus === "COMPLETED",
    }));
    res.json({ items, course: c.title || "" });
  } catch (err) {
    next(err);
  }
});

/**
 * The price is NOT stored on the course.
 *
 * It lives on the product carrying the course's SKU, which is what checkout
 * and the renewal cron read. Writing it here writes it there — one figure, one
 * home. If no product carries the SKU the course cannot be sold at all, and
 * the caller is told rather than having the number silently dropped.
 */
async function setCoursePrice(sku, price) {
  if (price == null || price === "" || !sku) return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return "That price is not a number.";
  const hit = await Product.findOneAndUpdate(
    { courseSku: sku },
    { $set: { price: n } },
    { new: true },
  ).lean();
  return hit ? null : `No product carries the SKU ${sku}, so the price was not set. Create the product first.`;
}

router.post("/courses", ...learn, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return res.status(400).json({ error: "A course needs a title." });

    if (b.kind === "free") {
      const v = await Learn.create({
        title: name,
        productLabel: String(b.blurb || "").trim(),
        thumbnailUrl: b.cover || "",
        youtubeId: youtubeIdOf(b.psrc),
        // Created as a draft whatever the checkbox said. Nothing is on the
        // Learn page before somebody has looked at it once.
        isPublished: false,
      });
      return res.status(201).json({ id: String(v._id), kind: "free" });
    }

    const sku = String(b.sku || "").trim();
    if (!sku) return res.status(400).json({ error: "A paid course needs a SKU." });
    if (await PaidCourse.exists({ sku })) {
      return res.status(409).json({ error: `A course with the SKU ${sku} already exists.` });
    }

    const c = await PaidCourse.create({
      sku,
      title: name,
      blurb: String(b.blurb || "").trim(),
      thumbnailUrl: b.cover || "",
      onboardingVideoUrl: b.psrc || "",
      isPublished: false,
      modules: [],
    });
    const priceNote = await setCoursePrice(sku, b.price);
    res.status(201).json({ id: String(c._id), kind: "paid", note: priceNote });
  } catch (err) {
    next(err);
  }
});

router.put("/courses/:id", ...learn, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return res.status(400).json({ error: "A course needs a title." });

    if (b.kind === "free") {
      const v = await Learn.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            title: name,
            productLabel: String(b.blurb || "").trim(),
            thumbnailUrl: b.cover || "",
            youtubeId: youtubeIdOf(b.psrc),
          },
        },
        { new: true },
      ).lean();
      if (!v) return res.status(404).json({ error: "No such video" });
      return res.json({ ok: true });
    }

    const c = await PaidCourse.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          title: name,
          sku: String(b.sku || "").trim(),
          blurb: String(b.blurb || "").trim(),
          thumbnailUrl: b.cover || "",
          onboardingVideoUrl: b.psrc || "",
        },
      },
      { new: true },
    ).lean();
    if (!c) return res.status(404).json({ error: "No such course" });

    const priceNote = await setCoursePrice(c.sku, b.price);
    res.json({ ok: true, note: priceNote });
  } catch (err) {
    next(err);
  }
});

/**
 * Publishing, with his two guards enforced here as well as in the browser.
 *
 * A guard that lives only in the client is a suggestion: anything that can
 * call the API can ignore it. These are the two states that cost real money —
 * a half-recorded course is a refund, and a coverless one is a grey box on the
 * Learn page.
 */
router.post("/courses/:id/publish", ...learn, async (req, res, next) => {
  try {
    const on = !!req.body?.published;
    const free = req.body?.kind === "free";

    if (free) {
      const v = await Learn.findById(req.params.id).lean();
      if (!v) return res.status(404).json({ error: "No such video" });
      if (on && !v.youtubeId) {
        return res.status(400).json({ error: "That video has no clip, so there is nothing to show." });
      }
      await Learn.updateOne({ _id: v._id }, { $set: { isPublished: on } });
      return res.json({ ok: true, published: on });
    }

    const c = await PaidCourse.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "No such course" });

    if (on) {
      const mods = c.modules || [];
      const short = mods.filter((m) => !m.videoUrl).length;
      if (mods.length && short) {
        return res.status(400).json({
          error:
            `Cannot publish — ${short} module${short === 1 ? " has" : "s have"} no video. ` +
            "Somebody would pay for a course that is not there.",
        });
      }
      if (!c.thumbnailUrl) {
        return res.status(400).json({
          error: "Cannot publish without a cover — it would be a grey box on the Learn page.",
        });
      }
    }

    await PaidCourse.updateOne({ _id: c._id }, { $set: { isPublished: on } });
    res.json({ ok: true, published: on });
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

/**
 * What's New — every release across every product, newest first.
 *
 * His screen is a flat list of releases, not a list of products, because that
 * is how a visitor reads /whats-new: one column of announcements. A product
 * with nothing to announce has no row there and needs none here.
 *
 * WHY THE PRODUCTS WITH NOTHING ARE STILL NAMED
 *
 * Eight products are on sale and two have a changelog document, so six were
 * simply absent from this screen — which reads as "those products have no
 * releases" when the truth is "nobody has ever written one". Those six are
 * counted and named under the table. A register that hides its own gaps is
 * how a product ships for a year without a single customer being told.
 *
 * REACH IS SEATS, NOT ACCOUNTS
 *
 * A release note is not just a web page — it is what gets told to the people
 * paying for that product. One account can hold several seats, so seats is the
 * number of installations that will see it.
 */
router.get("/changelogs", ...hub, async (_req, res, next) => {
  try {
    const [logs, products, reach] = await Promise.all([
      Changelog.find({}).sort({ order: 1, name: 1 }).lean(),
      Product.find({}).select("key name").lean(),
      User.aggregate([
        { $unwind: "$entitlements" },
        { $match: { "entitlements.status": "active" } },
        {
          $group: {
            _id: "$entitlements.productKey",
            seats: { $sum: { $ifNull: ["$entitlements.seats", 1] } },
          },
        },
      ]),
    ]);

    const seatsFor = new Map(reach.map((r) => [String(r._id || "").toLowerCase(), r.seats]));

    /**
     * A changelog's slug and a product's key are not the same vocabulary — the
     * catalogue still uses the CAD host it was named after (civil3d) while the
     * changelog uses the product (civiq). Matched on the slug first, then on
     * the name, and left unmatched rather than guessed at.
     */
    const keyFor = (log) => {
      const slug = String(log.slug || "").toLowerCase();
      if (seatsFor.has(slug)) return slug;
      const name = String(log.name || "").toLowerCase();
      const hit = products.find(
        (p) =>
          String(p.key).toLowerCase() === slug ||
          String(p.name).toLowerCase().includes(name) ||
          name.includes(String(p.name).toLowerCase().split(":")[0].trim()),
      );
      return hit ? String(hit.key).toLowerCase() : null;
    };

    const items = [];
    for (const log of logs) {
      const key = keyFor(log);
      for (const r of log.releases || []) {
        items.push({
          id: `${log._id}:${r.version}`,
          product: log.name || log.slug,
          slug: log.slug || "",
          version: r.version || "",
          // His label is free text ("June 2026", "2022"), so it is passed
          // through rather than parsed into a date that would print wrong.
          on: r.date || "",
          note: r.highlight || r.title || "",
          changes: (r.changes || []).reduce((t, g) => t + (g.items || []).length, 0),
          // null, not 0: "we cannot match this to a product" and "nobody holds
          // it" are different answers and the screen shows them differently.
          seats: key ? seatsFor.get(key) ?? 0 : null,
          state: String(log.status || "").toLowerCase() === "live" ? "active" : "draft",
        });
      }
    }

    // Newest first, and a release with no date sorts last rather than first.
    items.sort((a, b) => String(b.on).localeCompare(String(a.on)));

    const told = new Set(logs.map((l) => String(l.slug || "").toLowerCase()));
    const silent = products
      .filter((p) => {
        const k = String(p.key).toLowerCase();
        if (told.has(k)) return false;
        return !logs.some((l) => keyFor(l) === k);
      })
      .map((p) => p.name);

    res.json({
      items,
      silent,
      counts: { all: items.length, products: logs.length, silent: silent.length },
    });
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

/* ══════════════════════════════════════════════════ writing, not just reading ══
 *
 * Every register above could be read and none could be changed, so each one
 * carried an "Open the ... editor" button that threw you out of the screen you
 * were working in and into an older one. This is the other half.
 *
 * Declared as a table rather than written out eight times, because the eight
 * are genuinely the same operation — the only thing that differs is which
 * fields a row has and which flag means "the public can see it".
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Quiz QUESTIONS. A quiz row can be renamed, re-marked and published, but the
 * questions themselves are a nested editor with its own screen. Thirty-three
 * of these were drafted by a script from lecture transcripts and the point of
 * publishing one is that a person read it first — a fast inline edit is the
 * opposite of that.
 *
 * Changelog RELEASES, for the same reason: a release is a version, a date and
 * a list of changes, and it has its own editor.
 */

const WRITABLE = {
  lessons: {
    model: Learn,
    pub: "isPublished",
    label: "lesson",
    fields: ["title", "youtubeId", "thumbnailUrl", "durationSec", "productLabel", "sort"],
    // A lesson with no video is not a lesson. Checked here rather than only in
    // the browser, because the browser is not the only thing that can post.
    check: (b) => (!String(b.youtubeId || "").trim() ? "A lesson needs a YouTube video." : null),
  },
  quizzes: {
    model: Quiz,
    pub: "isPublished",
    label: "quiz",
    fields: ["title", "intro", "passMark", "maxAttempts"],
  },
  events: {
    model: Training,
    pub: null,
    label: "training",
    fields: ["title", "description", "mode", "date", "city", "country", "venue", "attendees"],
  },
  classrooms: {
    model: Classroom,
    pub: "isActive",
    label: "classroom",
    fields: ["title", "description", "classroomCode", "classroomUrl", "companyName"],
  },
  showcase: {
    model: Showcase,
    pub: "featured",
    label: "entry",
    fields: ["name", "code", "location", "logoUrl", "website"],
  },
  flyers: {
    model: Flyer,
    pub: "published",
    label: "flyer",
    fields: ["title", "thumbnailUrl"],
  },
  freebies: {
    model: Freebie,
    pub: "published",
    label: "freebie",
    fields: ["title", "description", "productKey", "imageUrl", "downloadUrl"],
  },
};

/** Only the declared fields, and only the ones actually supplied. */
function pick(spec, body) {
  const out = {};
  for (const k of spec.fields) {
    if (body[k] === undefined) continue;
    const v = body[k];
    // Numbers arrive from a form as strings. Left alone they would be stored
    // as strings and every later sort would order 10 before 9.
    out[k] = ["durationSec", "sort", "passMark", "maxAttempts", "attendees"].includes(k)
      ? n0(v)
      : v;
  }
  return out;
}

const spec = (req, res) => {
  const s = WRITABLE[req.params.screen];
  if (!s) {
    res.status(404).json({ error: "That register cannot be edited here." });
    return null;
  }
  return s;
};

router.post("/:screen", ...learn, async (req, res, next) => {
  try {
    const s = spec(req, res);
    if (!s) return undefined;
    const bad = s.check?.(req.body || {});
    if (bad) return res.status(400).json({ error: bad });

    const doc = pick(s, req.body || {});
    // Created hidden, whatever was ticked. Nothing reaches the public site
    // before somebody has looked at the row once.
    if (s.pub) doc[s.pub] = false;
    const made = await s.model.create(doc);
    res.status(201).json({ id: String(made._id) });
  } catch (err) {
    next(err);
  }
});

router.put("/:screen/:id", ...learn, async (req, res, next) => {
  try {
    const s = spec(req, res);
    if (!s) return undefined;
    const bad = s.check?.(req.body || {});
    if (bad) return res.status(400).json({ error: bad });

    const hit = await s.model.findByIdAndUpdate(
      req.params.id,
      { $set: pick(s, req.body || {}) },
      { new: true },
    ).lean();
    if (!hit) return res.status(404).json({ error: `No such ${s.label}` });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:screen/:id/publish", ...learn, async (req, res, next) => {
  try {
    const s = spec(req, res);
    if (!s) return undefined;
    if (!s.pub) {
      return res.status(400).json({ error: `A ${s.label} has nothing to publish.` });
    }
    const on = !!req.body?.published;

    const row = await s.model.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ error: `No such ${s.label}` });

    // The one guard worth having here: a lesson with no video would appear on
    // the public library as a card that plays nothing.
    if (on && s.model === Learn && !row.youtubeId) {
      return res.status(400).json({
        error: "That lesson has no video, so publishing it would put an empty card on the site.",
      });
    }

    await s.model.updateOne({ _id: row._id }, { $set: { [s.pub]: on } });
    res.json({ ok: true, published: on });
  } catch (err) {
    next(err);
  }
});

router.delete("/:screen/:id", ...learn, async (req, res, next) => {
  try {
    const s = spec(req, res);
    if (!s) return undefined;
    const gone = await s.model.findByIdAndDelete(req.params.id).lean();
    if (!gone) return res.status(404).json({ error: `No such ${s.label}` });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function tally(items) {
  const counts = { all: items.length };
  for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;
  return counts;
}

export default router;
