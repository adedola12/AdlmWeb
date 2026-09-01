// server/routes/admin.catalogue.js
//
// Products, the price book, and the rate data.
//
// THE PRICE BOOK IS COMPUTED, NOT READ
//
// This is the one that matters. A Product carries a dozen price fields —
// monthlyNGN, sixMonthNGN, yearlyNGN, their USD twins, and a discounted
// variant of each — and what a customer ACTUALLY pays is none of them on its
// own. It is what getEffectivePrices() decides: the discounted figure wins
// only when it is set and strictly lower, and USD falls back to converting
// the naira price when no explicit dollar price exists.
//
// Printing the raw fields would give an admin a screen that disagrees with
// checkout the moment somebody sets a discount and forgets it. So this calls
// the same function checkout and the renewal cron call — util/pricing.js, whose
// own header says it exists so "a renewal charge is computed by the exact same
// rules as a fresh checkout". The price book is a third caller of that rule,
// not a fourth copy of it.
//
// The screen shows the effective price AND the list price when they differ,
// because "why is this cheaper than the website says" is exactly the question
// a price book is opened to answer.

import express from "express";
import { writeAudit, reqAuditContext } from "../util/audit.js";
import { ChangelogProduct } from "../models/Changelog.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Product } from "../models/Product.js";
import { Software } from "../models/Software.js";
import { RateGenRate } from "../models/RateGenRate.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { User } from "../models/User.js";
import { SECTION_LABELS, normalizeSectionKey } from "./admin.rategen.rates.js";
import { fetchMasterMaterials, fetchMasterLabour } from "../util/rategenMaster.js";
import { normalizeZone } from "../util/zones.js";
import { getEffectivePrices } from "../util/pricing.js";
import { getFxRate } from "../util/fx.js";

const router = express.Router();

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Which products hold projects, and how many each licence allows.
 *
 * Mirrors routes/me.js, which is where it is enforced. The allowance is NOT
 * per product on this system — it is a personal figure and an organisation
 * figure, set in the environment, plus whatever extra slots an account has
 * been granted. His screen shows a number per product; ours shows the two
 * that actually govern, because inventing a third would be a figure on a
 * screen that nothing obeys.
 */
const PROJECT_PRODUCT_KEYS = new Set([
  "revit",
  "planswift",
  "mep",
  "civil3d",
  "revitmep",
  "archicad",
]);
const PERSONAL_PROJECT_LIMIT = Number(process.env.PERSONAL_PROJECT_LIMIT || 30);
const ORG_PROJECT_LIMIT = Number(process.env.ORG_PROJECT_LIMIT || 50);

/* ───────────────────────────────────────────────────────────── products ── */

router.get("/products", requireAuth, requirePermission("adminhub"), async (_req, res, next) => {
  try {
    const [products, software, logs] = await Promise.all([
      Product.find({}).sort({ sort: 1, name: 1 }).lean(),
      Software.find({}).sort({ createdAt: -1 }).lean(),
      // His "Latest release" is the release NOTE a customer reads on What's
      // New, not the installer file. They are different things: a build can be
      // uploaded without anybody being told, which is exactly the gap worth
      // seeing on this screen.
      ChangelogProduct.find({}).select("slug name releases").lean(),
    ]);

    // The newest installer per product name, which is the closest thing this
    // system has to "latest release". Software rows are named by hand, so the
    // match is a name contains rather than a key join, and a product with no
    // match says so rather than borrowing somebody else's version.
    const latestFor = (p) => {
      const name = String(p.name || "").toLowerCase();
      const key = String(p.key || "").toLowerCase();
      const hit = software.find((s) => {
        const sn = String(s.name || "").toLowerCase();
        return sn && (name.includes(sn.split(" ")[0]) || sn.includes(key));
      });
      return hit ? { name: hit.name, version: hit.version || "", at: hit.updatedAt } : null;
    };

    /** The newest release note written against this product, if any. */
    const noteFor = (p) => {
      const key = String(p.key || "").toLowerCase();
      const name = String(p.name || "").toLowerCase();
      const log = logs.find((l) => {
        const slug = String(l.slug || "").toLowerCase();
        const ln = String(l.name || "").toLowerCase();
        return slug === key || name.includes(ln) || ln.includes(name.split(":")[0].trim());
      });
      const r = log?.releases?.[0];
      return r
        ? { version: r.version || "", on: r.date || "", note: r.highlight || r.title || "" }
        : null;
    };

    const items = products.map((p) => {
      const pr = p.price || {};
      let state = "active";
      if (p.isComingSoon) state = "pending";
      else if (!p.isPublished) state = "disabled";

      return {
        id: String(p._id),
        key: p.key || "",
        name: p.name || p.key,
        tag: p.blurb || p.category || "",
        isCourse: !!p.isCourse,
        monthly: n0(pr.monthlyNGN),
        sixMonth: n0(pr.sixMonthNGN),
        yearly: n0(pr.yearlyNGN),
        install: n0(pr.installNGN),
        storageSlot: n0(p.storageSlotPriceNGN),
        release: latestFor(p),
        note: noteFor(p),
        // Only some products hold projects at all — RateGen and the courses
        // have no project bucket, so a storage figure against them would be a
        // number that governs nothing.
        holdsProjects: PROJECT_PRODUCT_KEYS.has(String(p.key || "").toLowerCase()),
        projects: PROJECT_PRODUCT_KEYS.has(String(p.key || "").toLowerCase())
          ? { personal: PERSONAL_PROJECT_LIMIT, org: ORG_PROJECT_LIMIT }
          : null,
        state,
        sort: n0(p.sort),
      };
    });

    const counts = { all: items.length };
    for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;

    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});


/* ─────────────────────────────────────────────────── products: the writes ── */

/**
 * A product's own record: what the website says about it and whether it is on
 * sale. The PRICE is not here — it has its own route because changing what a
 * thing costs is a different act from renaming it, and only one of the two is
 * worth writing to the audit log.
 */
router.post("/products", requireAuth, requirePermission("adminhub"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const key = String(b.key || "").trim().toLowerCase();
    if (!name) return res.status(400).json({ error: "A product needs a name." });
    if (!key) return res.status(400).json({ error: "A product needs a key — it is what orders and entitlements point at." });
    if (await Product.exists({ key })) {
      return res.status(409).json({ error: `A product already uses the key ${key}.` });
    }

    const made = await Product.create({
      key,
      name,
      blurb: String(b.tag || "").trim(),
      price: {
        monthlyNGN: n0(b.monthly),
        yearlyNGN: n0(b.yearly),
        installNGN: n0(b.install),
      },
      // A new product starts as Coming, never Live. Adding one here puts it in
      // the price book, the quotation builder and on the website, and none of
      // that should happen the instant somebody presses Create.
      isPublished: false,
      isComingSoon: true,
    });
    res.status(201).json({ id: String(made._id) });
  } catch (err) {
    next(err);
  }
});

router.put("/products/:id", requireAuth, requirePermission("adminhub"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const set = {};
    if (b.name !== undefined) set.name = String(b.name).trim();
    if (b.tag !== undefined) set.blurb = String(b.tag).trim();
    if (b.state !== undefined) {
      set.isPublished = b.state === "Live";
      set.isComingSoon = b.state === "Coming";
    }
    const hit = await Product.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!hit) return res.status(404).json({ error: "No such product" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Changing a price, with the reason written down.
 *
 * His form asks why and puts it in the audit log beside the old and new
 * figures, which is the right instinct: a price change with no reason cannot
 * be explained six months later when somebody asks why a renewal quote does
 * not match a proposal.
 *
 * Existing customers are NOT re-priced. They keep the figure they renew at
 * until their term ends, so this changes what a new customer pays — the route
 * says so in its reply rather than leaving somebody to wonder.
 */
router.post("/products/:id/price", requireAuth, requirePermission("adminhub"), async (req, res, next) => {
  try {
    const monthly = n0(req.body?.monthly);
    const yearly = n0(req.body?.yearly);
    const why = String(req.body?.why || "").trim();

    if (!why) {
      return res.status(400).json({
        error: "Say why. A price change with no reason cannot be explained later.",
      });
    }
    if (monthly < 0 || yearly < 0) {
      return res.status(400).json({ error: "A price cannot be negative." });
    }

    const p = await Product.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ error: "No such product" });

    const was = { monthly: n0(p.price?.monthlyNGN), yearly: n0(p.price?.yearlyNGN) };
    await Product.updateOne(
      { _id: p._id },
      { $set: { "price.monthlyNGN": monthly, "price.yearlyNGN": yearly } },
    );

    // How many seats are already on it, so the reply can say what was and was
    // not disturbed.
    const held = await User.aggregate([
      { $unwind: "$entitlements" },
      { $match: { "entitlements.productKey": String(p.key || "").toLowerCase(), "entitlements.status": "active" } },
      { $group: { _id: null, seats: { $sum: { $ifNull: ["$entitlements.seats", 1] } } } },
    ]);
    const seats = held[0]?.seats || 0;

    await writeAudit({
      actorId: req.user?._id,
      actorEmail: req.user?.email,
      action: "product.price.change",
      status: 200,
      ...reqAuditContext(req),
      meta: { product: p.name, key: p.key, was, now: { monthly, yearly }, why, seatsHeld: seats },
    });

    res.json({ ok: true, seats });
  } catch (err) {
    next(err);
  }
});

/**
 * Publish a release note against a product.
 *
 * This is what puts an entry on the public What's New page and tells the
 * customers on that product — so it writes to the changelog the public page
 * reads, not to a second list that would drift out of step with it.
 */
router.post("/products/:id/release", requireAuth, requirePermission("adminhub"), async (req, res, next) => {
  try {
    const version = String(req.body?.version || "").trim();
    const on = String(req.body?.on || "").trim();
    const note = String(req.body?.note || "").trim();

    if (!version) return res.status(400).json({ error: "A release needs a version." });
    if (!note) {
      return res.status(400).json({
        error: "A release note nobody can read is worse than no release note.",
      });
    }

    const p = await Product.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ error: "No such product" });

    const key = String(p.key || "").toLowerCase();
    let log = await ChangelogProduct.findOne({ slug: key });
    if (!log) {
      // Six of eight products have no changelog document at all, which is why
      // What's New could not show them. Creating one on the first release is
      // better than refusing, and better than a separate migration nobody runs.
      log = await ChangelogProduct.create({
        slug: key,
        name: p.name || key,
        tagline: p.blurb || "",
        status: p.isPublished ? "live" : "coming-soon",
        releases: [],
      });
    }

    await ChangelogProduct.updateOne(
      { _id: log._id },
      { $push: { releases: { $each: [{ version, date: on, highlight: note, changes: [] }], $position: 0 } } },
    );

    res.json({ ok: true, product: p.name, version });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────── price book ── */

router.get("/pricing", requireAuth, requirePermission("adminhub"), async (_req, res, next) => {
  try {
    const [products, fx] = await Promise.all([
      Product.find({}).sort({ sort: 1, name: 1 }).lean(),
      getFxRate().catch(() => 0.001),
    ]);

    const items = products.map((p) => {
      const ngn = getEffectivePrices(p, "NGN", fx);
      const usd = getEffectivePrices(p, "USD", fx);
      const pr = p.price || {};

      // The list price, for comparison. Where this differs from the effective
      // one, a discount is live and the screen should say so — that gap IS the
      // question a price book gets opened to answer.
      const list = {
        monthly: n0(pr.monthlyNGN),
        sixMonth: n0(pr.sixMonthNGN),
        yearly: n0(pr.yearlyNGN),
      };

      const discounted =
        (list.monthly && ngn.monthly < list.monthly) ||
        (list.sixMonth && ngn.sixMonth < list.sixMonth) ||
        (list.yearly && ngn.yearly < list.yearly);

      return {
        id: String(p._id),
        key: p.key || "",
        name: p.name || p.key,
        isCourse: !!p.isCourse,
        published: !!p.isPublished,
        ngn,
        usd,
        list,
        discounted,
        // A dollar price that was converted rather than set is worth knowing:
        // it moves when the FX rate moves.
        usdIsConverted: !(pr.yearlyUSD || pr.monthlyUSD),
      };
    });

    res.json({ items, fx, discounted: items.filter((i) => i.discounted).length });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────── rate data ── */

router.get("/rates", requireAuth, requirePermission("rategen"), async (req, res, next) => {
  try {
    const section = String(req.query.section || "").trim();

    // Read everything, then filter here, because the filter is on the
    // NORMALISED section and the stored key is not normalised. Nine distinct
    // keys sit in the database for eight sections: ground and groundwork are
    // both Groundwork, and concretework, paintwork, roofwork and windowsdoors
    // are none of them the canonical spelling. Filtering on the raw value
    // split one section in two and matched none of the others.
    // TWO COLLECTIONS, ONE LIBRARY
    //
    // A published rate is a RateGenRate: a description, a unit and a costed
    // build-up. But Carbon and Others is not stored that way at all — every
    // one of its 26 entries is a RateGenComputeItem, a recipe of material,
    // labour and constant lines with an output unit and no stored total,
    // because the total is worked out at pricing time from whatever the lines
    // cost today.
    //
    // The desktop reads both and shows one library. This screen read only the
    // first, which is why Carbon and Others sat at zero on the website while
    // the app listed it as a section people use.
    const [published, computed] = await Promise.all([
      RateGenRate.find({}).sort({ itemNo: 1, description: 1 }).limit(1000).lean(),
      RateGenComputeItem.find({}).sort({ section: 1, name: 1 }).limit(1000).lean(),
    ]);

    const asRecipe = (c) => ({
      _id: c._id,
      sectionKey: c.section,
      description: c.name,
      unit: c.outputUnit,
      overheadPercent: c.overheadPercentDefault,
      profitPercent: c.profitPercentDefault,
      breakdown: (c.lines || []).map((l) => ({
        refKind: l.kind,
        quantity: l.qtyPerUnit,
        unit: l.unit,
      })),
      // Deliberately no netCost or totalCost: a recipe has none until it is
      // priced. Inventing a zero would read as a free rate.
      recipe: true,
      enabled: c.enabled !== false,
      updatedAt: c.updatedAt,
    });

    const all = [...published, ...computed.map(asRecipe)];
    const recipes = computed.length;

    const rates = section
      ? all.filter((r) => normalizeSectionKey(r.sectionKey) === section)
      : all;

    const items = rates.map((r) => {
      const breakdown = r.breakdown || [];
      const labour = breakdown.filter((b) => String(b.refKind).toLowerCase() === "labour");
      return {
        id: String(r._id),
        section:
          SECTION_LABELS[normalizeSectionKey(r.sectionKey)] || r.sectionLabel || r.sectionKey || "",
        // The update endpoint validates sectionKey and refuses without it, so
        // a screen that edits a rate has to carry it.
        sectionKey: r.sectionKey || "",
        sectionLabel: r.sectionLabel || "",
        code: r.code || "",
        description: r.description || "",
        // The canonical key, so a deep link can tell RateGen which
        // section to open at.
        sectionKey: normalizeSectionKey(r.sectionKey),
        unit: r.unit || "",
        // A recipe carries no stored cost — see asRecipe above.
        recipe: !!r.recipe,
        net: r.recipe ? null : n0(r.netCost),
        overheadPercent: n0(r.overheadPercent),
        profitPercent: n0(r.profitPercent),
        total: r.recipe ? null : n0(r.totalCost),
        lines: breakdown.length,
        // Whether a rate can drive a programme as well as a price. Only 28 of
        // the 130 carry a labour line, which is why the Programme screen has
        // to be told its outputs.
        hasLabour: labour.length > 0,
        // A rate priced for one place. Both null means it applies everywhere.
        state: r.state || null,
        zone: r.zone || null,
        updatedAt: r.updatedAt || null,
      };
    });

    // The filter row is built from the CANONICAL nine, not from the sections
    // that happen to hold rates. Carbon and Others exists in the desktop
    // sidebar and in this system own allowed list, and it was missing from the
    // website purely because no rate has been written into it yet. An empty
    // section is a fact worth showing; an absent one reads as a section that
    // does not exist.
    const bySection = new Map();
    for (const r of all) {
      const k = normalizeSectionKey(r.sectionKey);
      bySection.set(k, (bySection.get(k) || 0) + 1);
    }
    const sections = Object.entries(SECTION_LABELS).map(([key, name]) => ({
      key,
      name,
      n: bySection.get(key) || 0,
    }));

    res.json({
      items,
      sections,
      total: all.length,
      recipes,
      withLabour: all.filter((r) =>
        (r.breakdown || []).some((b) => String(b.refKind).toLowerCase() === "labour"),
      ).length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/catalogue/rates/:id
 *
 * One rate with the lines it is built from.
 *
 * The list route deliberately does not carry breakdowns. A thousand rates at
 * five to ten lines each is a payload nobody reads, sent every time the screen
 * opens, to answer a question about the one rate somebody clicked. So the
 * build-up is fetched when it is opened.
 *
 * A compute item — the Carbon and Others recipes — is a rate in every way the
 * library cares about except that it has no stored cost, so it is served here
 * too rather than being a dead row that opens onto nothing.
 */
router.get("/rates/:id", requireAuth, requirePermission("rategen"), async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ error: "bad id" });

    const [rate, recipe] = await Promise.all([
      RateGenRate.findById(id).lean(),
      RateGenComputeItem.findById(id).lean(),
    ]);

    if (!rate && !recipe) return res.status(404).json({ error: "no such rate" });

    if (recipe && !rate) {
      return res.json({
        id: String(recipe._id),
        description: recipe.name || "",
        section: SECTION_LABELS[normalizeSectionKey(recipe.section)] || recipe.section || "",
        sectionKey: normalizeSectionKey(recipe.section),
        unit: recipe.outputUnit || "",
        recipe: true,
        // Null, not zero. A recipe has no cost until it is priced, and a zero
        // here would read as a free rate.
        net: null,
        total: null,
        overheadPercent: 0,
        profitPercent: 0,
        breakdown: (recipe.lines || []).map((l) => ({
          componentName: l.name || l.componentName || "",
          refKind: l.kind || l.refKind || "",
          quantity: n0(l.quantity),
          unit: l.unit || "",
          unitPrice: null,
          waste: n0(l.waste),
        })),
        updatedAt: recipe.updatedAt || null,
      });
    }

    res.json({
      id: String(rate._id),
      description: rate.description || "",
      section: SECTION_LABELS[normalizeSectionKey(rate.sectionKey)] || rate.sectionLabel || "",
      sectionKey: normalizeSectionKey(rate.sectionKey),
      code: rate.code || "",
      unit: rate.unit || "",
      recipe: false,
      net: n0(rate.netCost),
      total: n0(rate.totalCost),
      overheadPercent: n0(rate.overheadPercent),
      profitPercent: n0(rate.profitPercent),
      zone: rate.zone || null,
      state: rate.state || null,
      breakdown: (rate.breakdown || []).map((l) => ({
        componentName: l.componentName || l.refName || "",
        refKind: l.refKind || "",
        quantity: n0(l.quantity),
        unit: l.unit || "",
        unitPrice: n0(l.unitPrice),
        waste: n0(l.waste),
      })),
      updatedAt: rate.updatedAt || null,
    });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────── saved rates ── */

/**
 * What the desktop calls "Saved Rates": a rate somebody built for themselves.
 *
 * These never appeared on the website at all, and they are not in RateGenRate.
 * They live per user on RateGenLibrary, beside the overrides that person has
 * made to published rates. Thirty custom rates and nearly four thousand
 * overrides exist across 21 practices, and none of it was visible to an
 * administrator taking a support call.
 *
 * Read-only, deliberately. A rate somebody built for their own practice is
 * theirs; this exists so support can see what a caller is actually pricing
 * with, not so it can be changed from underneath them.
 */
router.get("/saved-rates", requireAuth, requirePermission("rategen"), async (_req, res, next) => {
  try {
    const libs = await RateGenLibrary.find({ "customRates.0": { $exists: true } })
      .select("userId customRates rateOverrides")
      .lean();

    const ids = [...new Set(libs.map((l) => String(l.userId)).filter(Boolean))];
    const users = await User.find({ _id: { $in: ids } })
      .select("_id firstName lastName email")
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const items = [];
    for (const l of libs) {
      const u = byId.get(String(l.userId));
      for (const c of l.customRates || []) {
        items.push({
          id: c.customRateId || String(c._id || ""),
          name: c.title || c.description || "Untitled rate",
          note: c.description || "",
          unit: c.unit || "",
          section: c.sectionLabel || SECTION_LABELS[normalizeSectionKey(c.sectionKey)] || "",
          who:
            [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
            u?.email ||
            "Unknown account",
          email: u?.email || "",
          materials: (c.materials || []).length,
          labour: (c.labour || []).length,
          net: n0(c.netCost),
          total: n0(c.totalCost),
          overheadPercent: n0(c.overheadPercent),
          profitPercent: n0(c.profitPercent),
          updatedAt: c.updatedAt || c.createdAt || null,
        });
      }
    }

    items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    res.json({
      items,
      total: items.length,
      // An override is a different thing from a custom rate: somebody changing
      // OUR figure rather than writing their own. The count is worth stating —
      // nearly four thousand of them say the published library is not matching
      // what people actually pay.
      overrides: libs.reduce((t, l) => t + (l.rateOverrides || []).length, 0),
      practices: libs.length,
    });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────── the component library ── */

/**
 * The materials and labour a rate is built from.
 *
 * These do NOT live in this database. They are in the RateGen master cluster
 * (ADLMRateDB) — 595 materials and 84 labour rows — and they are priced BY
 * ZONE, because the same bag of cement is not the same money in Lagos and in
 * Kano. The zone therefore has to be chosen before a rate is built, not after:
 * a build-up composed at south-west prices is a south-west rate.
 *
 * Read-only here by design. Master prices are edited in Rate Gen and pulled
 * down by every install through its own Update Prices; a second editor on the
 * website would be a second place for the same figure to be got wrong.
 */
router.get("/library", requireAuth, requirePermission("rategen"), async (req, res, next) => {
  try {
    const zone = normalizeZone(req.query.zone) || "south_west";
    const q = String(req.query.q || "").trim().toLowerCase();

    const [materials, labour] = await Promise.all([
      fetchMasterMaterials(zone),
      fetchMasterLabour(zone),
    ]);

    const shape = (rows, kind) =>
      rows
        .filter((r) => {
          if (!q) return true;
          return `${r.description} ${r.category}`.toLowerCase().includes(q);
        })
        .map((r) => ({
          kind,
          sn: r.sn,
          name: r.description,
          unit: r.unit || "",
          price: Number(r.price) || 0,
          category: r.category || "",
        }));

    const mats = shape(materials, "material");
    const labs = shape(labour, "labour");

    res.json({
      zone,
      materials: mats.slice(0, 300),
      labour: labs.slice(0, 300),
      counts: {
        materials: mats.length,
        labour: labs.length,
        allMaterials: materials.length,
        allLabour: labour.length,
      },
      sections: Object.entries(SECTION_LABELS).map(([key, name]) => ({ key, name })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
