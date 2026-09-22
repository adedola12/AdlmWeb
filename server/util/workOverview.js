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

/** The project identity every facet row carries, so the client can link back. */
const ROW_IDENTITY = {
  projectId: "$_id",
  name: "$name",
  slug: "$slug",
  productKey: "$productKey",
  baseProductKey: "$baseProductKey",
};

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
          { $unwind: "$certificates" },
          { $sort: { "certificates.date": -1 } },
          { $limit: limit },
          certRow,
        ],
        // "Needs a decision": a draft certificate is the nearest honest
        // "not yet approved" we store. There is no "awaiting" status.
        draftCertificates: [
          { $unwind: "$certificates" },
          {
            $match: {
              $or: [
                { "certificates.status": "draft" },
                { "certificates.status": { $exists: false } },
              ],
            },
          },
          { $sort: { "certificates.date": -1 } },
          { $limit: limit },
          certRow,
        ],
        variations: [
          { $unwind: "$variations" },
          { $sort: { "variations.issuedAt": -1 } },
          { $limit: limit },
          variationRow,
        ],
        pendingVariations: [
          { $unwind: "$variations" },
          { $match: { "variations.status": "pending" } },
          { $sort: { "variations.issuedAt": -1 } },
          { $limit: limit },
          variationRow,
        ],
        tasks: [
          { $unwind: "$tasks" },
          {
            $match: {
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
                  $or: [
                    { "tasks.endDate": { $lte: soon } },
                    { "tasks.startDate": { $lte: now } },
                  ],
                },
              ],
            },
          },
          { $sort: { "tasks.endDate": 1 } },
          { $limit: limit },
          {
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
          },
        ],
        // How many bill lines carry each RateGen rate. appliedRateKey is the
        // rate's description text, so a renamed rate simply stops matching —
        // which is why the client says "N lines" and never "Unused".
        rateUsage: [
          { $unwind: "$rateKeys" },
          { $match: { rateKeys: { $nin: ["", null] } } },
          { $group: { _id: "$rateKeys", lines: { $sum: 1 } } },
          { $sort: { lines: -1 } },
          { $limit: usageLimit },
          { $project: { _id: 0, key: "$_id", lines: 1 } },
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
});

const certificate = (r) => ({
  ...identity(r),
  number: Number(r.number) || 0,
  date: iso(r.date),
  netPayable: Number(r.netPayable) || 0,
  cumulativeValue: Number(r.cumulativeValue) || 0,
  status: ["draft", "approved", "paid"].includes(r.status) ? r.status : "draft",
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
 * Turn the raw $facet result into the JSON the Work overview reads.
 * Everything is plain and defensive: a facet that came back empty (or not at
 * all) becomes an empty array, so one missing panel never blanks the page.
 */
export function shapeWorkOverview(raw) {
  const facet = Array.isArray(raw) ? raw[0] || {} : raw || {};
  const list = (k) => (Array.isArray(facet[k]) ? facet[k] : []);

  return {
    certificates: list("certificates").map(certificate),
    draftCertificates: list("draftCertificates").map(certificate),
    variations: list("variations").map(variation),
    pendingVariations: list("pendingVariations").map(variation),
    tasks: list("tasks").map(task),
    rateUsage: list("rateUsage")
      .filter((r) => str(r.key))
      .map((r) => ({ key: str(r.key), lines: Number(r.lines) || 0 })),
  };
}
