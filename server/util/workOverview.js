// The Work overview's read-only aggregate (S18 / WH-07, WH-08, WH-09).
//
// His rebuilt overview asks four questions the projects rollup cannot answer,
// because the rollup only ever looks at a project's items:
//
//   money in motion   every project's certificates and variations, newest first
//   programme         tasks overdue, due within a fortnight, or under way
//   decisions         the drafts and pending variations that need a person
//   rate usage        how many bill lines each RateGen rate is actually on
//
// All four are a single aggregate with a $facet, so one trip answers the whole
// dashboard. Nothing here writes, and nothing here computes money that any
// other screen already computes: a certificate's netPayable and a variation's
// qty x rate are read exactly as they are stored, so no total moves.
//
// The shaping is split out from the pipeline so it can be tested without a
// database: buildWorkOverviewPipeline() makes the stages, shapeWorkOverview()
// turns the raw facet result into the JSON the client reads.

/**
 * The product a stored project key BELONGS to, as a Mongo expression.
 *
 * A material & labour schedule is stored as its own project under its own key
 * (revit-materials, planswift-materials, mep-materials, civil3d-materials, and
 * one stray revitmep-materials). They are not products of their own: a schedule
 * is derived from a bill measured in QUIV or HERON and is part of that
 * product's work.
 *
 * Shared by GET /me/projects-rollup and GET /me/work-overview so the two can
 * never disagree about which product a row belongs to.
 */
export function baseProductKeyExpr() {
  return {
    $let: {
      vars: { k: { $toLower: { $ifNull: ["$productKey", ""] } } },
      in: {
        $switch: {
          branches: [
            {
              case: { $in: ["$$k", ["revit-materials", "revit-material"]] },
              then: "revit",
            },
            {
              case: { $in: ["$$k", ["planswift-materials", "planswift-material"]] },
              then: "planswift",
            },
            {
              case: {
                $in: ["$$k", ["mep-materials", "mep-material", "revitmep-materials"]],
              },
              then: "mep",
            },
            {
              case: { $in: ["$$k", ["civil3d-materials", "civil3d-material"]] },
              then: "civil3d",
            },
            {
              case: { $in: ["$$k", ["archicad-materials", "archicad-material"]] },
              then: "archicad",
            },
          ],
          default: "$$k",
        },
      },
    },
  };
}

const toNum = (path) => ({ $convert: { input: path, to: "double", onError: 0, onNull: 0 } });

// Lagos is UTC+1 all year — no daylight saving — so a WAT calendar day is a
// fixed offset from UTC and needs no timezone database to find.
const WAT_OFFSET_MS = 60 * 60 * 1000;

/**
 * The instant today began in Lagos.
 *
 * A task is overdue when its end date fell on an EARLIER WAT day, which is the
 * same rule the client applies (client/src/lib/workOverview.js taskState). A
 * raw `endDate < now` would call a task that ends today overdue at 00:30, and
 * would then disagree with the row the dashboard is showing.
 */
export function watDayStart(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(t)) return new Date(0);
  return new Date(Math.floor((t + WAT_OFFSET_MS) / 86400000) * 86400000 - WAT_OFFSET_MS);
}

/**
 * Whether a (lean) user document holds an active, unexpired entitlement.
 *
 * Mirrors userHasActiveEntitlement() in routes/projects.js exactly, because it
 * answers the same question: may this person see money on work they do not own?
 * Pure, so the decision can be tested without a database.
 */
export function hasActiveEntitlement(user, key, now = Date.now()) {
  if (!user || !key) return false;
  const e = (user.entitlements || []).find(
    (x) => x && x.productKey === key && x.status === "active",
  );
  if (!e) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() < now) return false;
  return true;
}

/**
 * Certified to date, as a Mongo expression: what the APPROVED and PAID
 * certificates add up to.
 *
 * This is the definition the workspace uses — ProjectContractPanel's
 * certifiedToDate and reportEngine's totalCertified both sum `thisCertificate`
 * over the certificates that are not drafts. The rollup used to read the
 * cumulativeValue of the highest-numbered approved certificate instead, which
 * agrees only while approval runs contiguously from certificate 1: with cert 1
 * still a draft (10m) and cert 2 approved (cumulative 15m), the workspace said
 * 5m and the dashboard said 15m — crediting work nobody had approved.
 *
 * A certificate with no stored status is a draft (the schema's own default), so
 * it certifies nothing.
 */
export function certifiedToDateExpr(path = "$certificates") {
  return {
    $sum: {
      $map: {
        input: {
          $filter: {
            input: { $ifNull: [path, []] },
            as: "c",
            cond: { $in: [{ $ifNull: ["$$c.status", "draft"] }, ["approved", "paid"]] },
          },
        },
        as: "c",
        in: toNum("$$c.thisCertificate"),
      },
    },
  };
}

/**
 * The pieces of a project's work value that measured work alone leaves out,
 * as Mongo expressions for a $project stage.
 *
 * Certified value is built from measured work PLUS provisional sums,
 * preliminaries and approved variations (routes/projects.js
 * computeValueToDate). Comparing it with qty x rate alone therefore compared
 * two different things, and the Work overview's "% of measured work" read high
 * on any job carrying prelims. These three fields let the dashboard divide
 * like by like.
 *
 * The expressions mirror listProjects() in routes/projects.js, defaults
 * included, so a project reads the same on both screens.
 */
export function contractValueExprs() {
  return {
    provisionalTotal: {
      $sum: {
        $map: {
          input: { $ifNull: ["$provisionalSums", []] },
          as: "s",
          in: toNum("$$s.amount"),
        },
      },
    },
    // Approved variations only. A row with no status is work that has always
    // counted, so a missing status reads as approved.
    approvedVariationsTotal: {
      $sum: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: ["$variations", []] },
              as: "v",
              cond: {
                $not: { $in: [{ $ifNull: ["$$v.status", "approved"] }, ["pending", "rejected"]] },
              },
            },
          },
          as: "v",
          in: { $multiply: [toNum("$$v.qty"), toNum("$$v.rate")] },
        },
      },
    },
    preliminaryPercent: { $ifNull: ["$contract.preliminaryPercent", 7.5] },
  };
}

/**
 * The two percentages the ESTIMATE needs and certified value never does, as
 * expressions for a $project stage.
 *
 * Contingency and VAT are deliberately outside contractValueExprs() above,
 * because neither is ever certified: a certificate values measured work,
 * provisional sums, preliminaries and approved variations, and nothing else.
 * They exist only to finish the grand summary.
 *
 * Same fields and the same defaults as listProjects() in routes/projects.js
 * and as the schema itself (7.5 / 5 / 7.5), so a project estimates the same
 * on the gallery as it does on its own Bill.
 */
export function estimatePercentExprs() {
  return {
    contingencyPercent: { $ifNull: ["$contract.contingencyPercent", 5] },
    taxPercent: { $ifNull: ["$contract.taxPercent", 7.5] },
  };
}

/**
 * The grand-summary cascade, as $addFields stages, ending in `estimatedTotal`
 * — the one figure the gallery calls "Estimated".
 *
 * It is the SAME cascade as client/src/features/projects/lib/projectTotals.js
 * (the one module every screen reads) and as listProjects() in
 * routes/projects.js, in the same order:
 *
 *   prelims     = (measured + sums) × preliminary%      ← already added
 *   sub-total   = measured + sums + prelims
 *   contingency = sub-total × contingency%
 *   VAT         = (sub-total + contingency) × VAT%
 *   estimated   = sub-total + contingency + VAT + approved variations
 *
 * A second, subtly different cascade would be worse than no figure at all, so
 * me.projectsRollup.test.js evaluates these stages and compares them with
 * projectTotals() itself on the same input.
 *
 * One stage per step because a $addFields cannot read a field it is defining.
 * The caller must already have projected totalCost, provisionalTotal,
 * preliminaryTotal, approvedVariationsTotal and both percentages.
 */
export function estimatedTotalStages() {
  return [
    {
      $addFields: {
        estimateSubtotal: {
          $add: ["$totalCost", "$provisionalTotal", "$preliminaryTotal"],
        },
      },
    },
    {
      $addFields: {
        contingencyTotal: {
          $divide: [{ $multiply: ["$estimateSubtotal", "$contingencyPercent"] }, 100],
        },
      },
    },
    {
      $addFields: {
        taxTotal: {
          $divide: [
            {
              $multiply: [
                { $add: ["$estimateSubtotal", "$contingencyTotal"] },
                "$taxPercent",
              ],
            },
            100,
          ],
        },
      },
    },
    {
      $addFields: {
        estimatedTotal: {
          $add: [
            "$estimateSubtotal",
            "$contingencyTotal",
            "$taxTotal",
            "$approvedVariationsTotal",
          ],
        },
      },
    },
  ];
}

/** The project identity every facet row carries, so the client can link back. */
const ROW_IDENTITY = {
  projectId: "$_id",
  name: "$name",
  slug: "$slug",
  productKey: "$productKey",
  baseProductKey: "$baseProductKey",
  // Somebody else's project, reached as a collaborator. Money on these rows is
  // masked unless the reader may see rates — see shapeWorkOverview().
  shared: "$shared",
};

// What a $facet branch keeps BEFORE it unwinds and sorts.
//
// Every branch used to inherit the whole document — certificates, variations,
// tasks and one entry per bill line — so a $sort inside a branch dragged all of
// it through a blocking sort (MongoDB stops at 100MB), and the rate-usage
// branch unwound one copy of every certificate and task per bill line. Each
// branch now projects itself down to the identity plus the ONE array it reads,
// and projects its final row before it sorts, so the sort sees a handful of
// small fields.
const scope = (field) => ({
  $project: {
    name: 1,
    slug: 1,
    productKey: 1,
    baseProductKey: 1,
    shared: 1,
    [field]: 1,
  },
});

/**
 * Stages for GET /me/work-overview.
 *
 * @param {import("mongoose").Types.ObjectId} userId  the signed-in user
 * @param {object} [opts]
 * @param {Date}   [opts.now]            the real current time
 * @param {number} [opts.limit]          rows per facet
 * @param {number} [opts.dueWithinDays]  how far ahead "due soon" reaches
 * @param {number} [opts.usageLimit]     distinct rate keys returned
 */
export function buildWorkOverviewPipeline(userId, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const limit = Number(opts.limit) > 0 ? Math.min(50, Math.floor(Number(opts.limit))) : 8;
  const dueWithinDays = Number(opts.dueWithinDays) >= 0 ? Number(opts.dueWithinDays) : 14;
  const usageLimit = Number(opts.usageLimit) > 0 ? Math.floor(Number(opts.usageLimit)) : 300;
  const soon = new Date(now.getTime() + dueWithinDays * 86400000);
  const today = watDayStart(now);

  const certRow = {
    $project: {
      _id: 0,
      ...ROW_IDENTITY,
      number: toNum("$certificates.number"),
      date: "$certificates.date",
      netPayable: toNum("$certificates.netPayable"),
      cumulativeValue: toNum("$certificates.cumulativeValue"),
      // Older documents predate the field; the schema default is "draft".
      status: { $ifNull: ["$certificates.status", "draft"] },
    },
  };

  const variationRow = {
    $project: {
      _id: 0,
      ...ROW_IDENTITY,
      reference: { $ifNull: ["$variations.reference", ""] },
      description: { $ifNull: ["$variations.description", ""] },
      amount: { $multiply: [toNum("$variations.qty"), toNum("$variations.rate")] },
      issuedAt: "$variations.issuedAt",
      completed: { $eq: [{ $ifNull: ["$variations.completed", false] }, true] },
      // The valuations stream is adding an optional status to VariationSchema.
      // Everything that exists today, and anything created automatically,
      // counts as approved — so a missing status reads "approved" and no
      // total moves when the field lands.
      status: { $ifNull: ["$variations.status", "approved"] },
    },
  };

  const taskRow = {
    $project: {
      _id: 0,
      ...ROW_IDENTITY,
      task: { $ifNull: ["$tasks.name", ""] },
      endDate: "$tasks.endDate",
      startDate: "$tasks.startDate",
      percentComplete: toNum("$tasks.percentComplete"),
      isMilestone: { $eq: [{ $ifNull: ["$tasks.isMilestone", false] }, true] },
      assignedTo: { $ifNull: ["$tasks.assignedTo", ""] },
      status: { $ifNull: ["$tasks.status", "not-started"] },
    },
  };

  // A programme task that is due, as a $match on the unwound row.
  const taskIsDue = {
    $and: [
      { "tasks.isSummary": { $ne: true } },
      { "tasks.status": { $ne: "completed" } },
      { "tasks.endDate": { $ne: null } },
      {
        $or: [
          { "tasks.percentComplete": { $lt: 100 } },
          { "tasks.percentComplete": { $exists: false } },
        ],
      },
      {
        $or: [{ "tasks.endDate": { $lte: soon } }, { "tasks.startDate": { $lte: now } }],
      },
    ],
  };

  // The same task, as an expression, for the honest count below.
  const taskIsOverdue = {
    $and: [
      { $ne: [{ $ifNull: ["$$t.isSummary", false] }, true] },
      { $ne: ["$$t.status", "completed"] },
      { $ne: [{ $ifNull: ["$$t.endDate", null] }, null] },
      { $lt: [toNum("$$t.percentComplete"), 100] },
      { $lt: ["$$t.endDate", today] },
    ],
  };

  return [
    {
      $match: {
        // pmTrackerOnly projects are deliberately NOT excluded here: the
        // rollup drops them because they hold no bill, but a PM-only project
        // is exactly the kind that holds programme tasks.
        $or: [{ userId }, { "collaborators.userId": userId }],
      },
    },
    {
      $project: {
        name: 1,
        slug: 1,
        productKey: 1,
        baseProductKey: baseProductKeyExpr(),
        shared: { $ne: ["$userId", userId] },
        certificates: { $ifNull: ["$certificates", []] },
        variations: { $ifNull: ["$variations", []] },
        tasks: { $ifNull: ["$projectManagement.tasks", []] },
        // Only the applied rate key, never the whole item: carrying every
        // item through a $facet on a 48-project account is the difference
        // between a fast dashboard and a slow one.
        rateKeys: {
          $map: {
            input: { $ifNull: ["$items", []] },
            as: "i",
            in: { $ifNull: ["$$i.appliedRateKey", ""] },
          },
        },
      },
    },
    {
      $facet: {
        certificates: [
          scope("certificates"),
          { $unwind: "$certificates" },
          certRow,
          { $sort: { date: -1 } },
          { $limit: limit },
        ],
        // "Needs a decision": a draft certificate is the nearest honest
        // "not yet approved" we store. There is no "awaiting" status.
        draftCertificates: [
          scope("certificates"),
          { $unwind: "$certificates" },
          {
            $match: {
              $or: [
                { "certificates.status": "draft" },
                { "certificates.status": { $exists: false } },
              ],
            },
          },
          certRow,
          { $sort: { date: -1 } },
          { $limit: limit },
        ],
        variations: [
          scope("variations"),
          { $unwind: "$variations" },
          variationRow,
          { $sort: { issuedAt: -1 } },
          { $limit: limit },
        ],
        pendingVariations: [
          scope("variations"),
          { $unwind: "$variations" },
          { $match: { "variations.status": "pending" } },
          variationRow,
          { $sort: { issuedAt: -1 } },
          { $limit: limit },
        ],
        tasks: [
          scope("tasks"),
          { $unwind: "$tasks" },
          { $match: taskIsDue },
          taskRow,
          { $sort: { endDate: 1 } },
          { $limit: limit },
        ],
        // How many bill lines carry each RateGen rate. appliedRateKey is the
        // rate's description text, so a renamed rate simply stops matching —
        // which is why the client says "N lines" and never "Unused".
        rateUsage: [
          { $project: { _id: 0, rateKeys: 1 } },
          { $unwind: "$rateKeys" },
          { $match: { rateKeys: { $nin: ["", null] } } },
          { $group: { _id: "$rateKeys", lines: { $sum: 1 } } },
          { $sort: { lines: -1 } },
          { $limit: usageLimit },
          { $project: { _id: 0, key: "$_id", lines: 1 } },
        ],
        // How many things of each kind are REALLY waiting, across every
        // project — not how many the capped facets above happened to return.
        // The dashboard's "Needs a decision" tile quotes this, so a person
        // with 30 draft certificates is not told there are 8.
        counts: [
          {
            $project: {
              _id: 0,
              draftCertificates: {
                $size: {
                  $filter: {
                    input: "$certificates",
                    as: "c",
                    cond: { $eq: [{ $ifNull: ["$$c.status", "draft"] }, "draft"] },
                  },
                },
              },
              pendingVariations: {
                $size: {
                  $filter: {
                    input: "$variations",
                    as: "v",
                    cond: { $eq: ["$$v.status", "pending"] },
                  },
                },
              },
              overdueTasks: {
                $size: { $filter: { input: "$tasks", as: "t", cond: taskIsOverdue } },
              },
            },
          },
          {
            $group: {
              _id: null,
              draftCertificates: { $sum: "$draftCertificates" },
              pendingVariations: { $sum: "$pendingVariations" },
              overdueTasks: { $sum: "$overdueTasks" },
            },
          },
          { $project: { _id: 0 } },
        ],
      },
    },
  ];
}

const str = (v) => (v == null ? "" : String(v));
const iso = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const identity = (r) => ({
  projectId: str(r.projectId),
  name: str(r.name),
  slug: str(r.slug),
  productKey: str(r.productKey),
  baseProductKey: str(r.baseProductKey || r.productKey),
  shared: r.shared === true,
});

const certificate = (r) => ({
  ...identity(r),
  number: Number(r.number) || 0,
  date: iso(r.date),
  netPayable: Number(r.netPayable) || 0,
  cumulativeValue: Number(r.cumulativeValue) || 0,
  status: ["draft", "approved", "paid"].includes(r.status) ? r.status : "draft",
  moneyHidden: false,
});

const variation = (r) => ({
  ...identity(r),
  reference: str(r.reference),
  description: str(r.description),
  amount: Number(r.amount) || 0,
  issuedAt: iso(r.issuedAt),
  completed: r.completed === true,
  // Anything that is not explicitly pending or rejected counts as approved,
  // which is what every variation stored before the field existed is.
  status: ["pending", "rejected"].includes(r.status) ? r.status : "approved",
  moneyHidden: false,
});

const task = (r) => ({
  ...identity(r),
  task: str(r.task),
  endDate: iso(r.endDate),
  startDate: iso(r.startDate),
  percentComplete: Math.max(0, Math.min(100, Number(r.percentComplete) || 0)),
  isMilestone: r.isMilestone === true,
  assignedTo: str(r.assignedTo),
  status: str(r.status) || "not-started",
});

/**
 * Money on a project the reader does not own, when the reader may not see
 * rates, is hidden exactly as the project API hides it.
 *
 * GET /projects/:key/:id runs every collaborator's payload through maskRates(),
 * which zeroes each certificate's cumulativeValue and netPayable and every
 * variation's rate — unless the collaborator holds an active RateGen
 * subscription (routes/projects.js resolveProjectAccess: canSeeRates is true
 * for the owner always, and for a collaborator only with rategen). The
 * dashboard reads the same projects, so it hides the same figures; the row
 * itself stays, flagged, so the screen can say "hidden" rather than "nothing".
 */
const hideCertMoney = (c) => ({ ...c, netPayable: 0, cumulativeValue: 0, moneyHidden: true });
const hideVariationMoney = (v) => ({ ...v, amount: 0, moneyHidden: true });

const countOf = (v) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Turn the raw $facet result into the JSON the Work overview reads.
 * Everything is plain and defensive: a facet that came back empty (or not at
 * all) becomes an empty array, so one missing panel never blanks the page.
 *
 * @param {Array|object} raw
 * @param {object} [opts]
 * @param {boolean} [opts.canSeeRates]  the reader holds RateGen. Defaults to
 *   false, so a caller that forgets to ask hides money rather than leaking it.
 */
export function shapeWorkOverview(raw, opts = {}) {
  const facet = Array.isArray(raw) ? raw[0] || {} : raw || {};
  const list = (k) => (Array.isArray(facet[k]) ? facet[k] : []);
  const canSeeRates = opts.canSeeRates === true;
  const hidden = (r) => r.shared === true && !canSeeRates;

  const certs = (k) => list(k).map(certificate).map((c) => (hidden(c) ? hideCertMoney(c) : c));
  const vars = (k) =>
    list(k).map(variation).map((v) => (hidden(v) ? hideVariationMoney(v) : v));

  const counts = list("counts")[0] || {};

  return {
    certificates: certs("certificates"),
    draftCertificates: certs("draftCertificates"),
    variations: vars("variations"),
    pendingVariations: vars("pendingVariations"),
    tasks: list("tasks").map(task),
    rateUsage: list("rateUsage")
      .filter((r) => str(r.key))
      .map((r) => ({ key: str(r.key), lines: Number(r.lines) || 0 })),
    // How many there really are, so a capped list is never presented as the
    // whole of it. Rate usage is a count of bill lines, not money, and the
    // project API does not hide it, so it is never masked.
    counts: {
      draftCertificates: countOf(counts.draftCertificates),
      pendingVariations: countOf(counts.pendingVariations),
      overdueTasks: countOf(counts.overdueTasks),
    },
  };
}
