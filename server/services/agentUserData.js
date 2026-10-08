// server/services/agentUserData.js
// Read-only account data for the AI agent's authenticated tools. Every export
// takes the caller's OWN userId (resolved server-side from the Bearer token in
// routes/agent.js) and hard-scopes every query to it. The model never supplies
// a userId — it only ever passes a project name or nothing — so there is no way
// for Ada to read another user's projects, money, or subscriptions.

import mongoose from "mongoose";
import { projectStage, stageLabel, STAGES, stageIsOpen } from "../util/projectStage.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { computePmDashboard, computeProjectScope } from "./pmCompute.js";
import { productLabel } from "./reportEngine.js";
import { similarityScore } from "../util/fuzzyMatch.js";
import { canonicalKind, kindLabel } from "../util/resourceKind.js";
import { RateGenRate } from "../models/RateGenRate.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { mergeRatesWithUserData } from "../util/rategenUserRates.js";
import { resolveProjectAccess } from "../util/projectAccess.js";
import { buildPricingProposal } from "../util/pricingProposal.js";
import { buildAreaProposal, buildSetRatesProposal } from "../util/priceByArea.js";
import { RateUsage } from "../models/RateUsage.js";
import { usageIndex } from "../util/rateSuggestions.js";
import { parseReportRange, buildPeriodSummary } from "./reportPeriod.js";
import { projectTips } from "../util/projectTips.js";
import {
  ownOnly,
  isSampleProject,
  sampleProposalRefusal,
  samplePeriodReportRefusal,
  sampleBanner,
  mentionsSample,
  withoutSampleWord,
} from "../util/agentSampleGuard.js";
import { hasActiveEntitlement } from "../middleware/requireEntitlement.js";

function oid(id) {
  return new mongoose.Types.ObjectId(String(id));
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Ada quotes money to users, so format it the way the app does (₦, no decimals).
function naira(v) {
  return `₦${Math.round(safeNum(v)).toLocaleString("en-NG")}`;
}

function fmtDate(v) {
  if (!v) return "–";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "–" : d.toISOString().slice(0, 10);
}

// ── Portfolio summary ──────────────────────────────────────────────────────
// One aggregation over the user's OWN takeoff projects (excludes PM-tracker-
// only and the uncapped -materials duplicates are kept but flagged). Mirrors
// the /me/projects-rollup + projects-list valuation math so the numbers match
// what the user sees in the Portfolio Dashboard.
export async function getPortfolioSummary(userId) {
  const uid = oid(userId);
  const num = (p) => ({ $convert: { input: p, to: "double", onError: 0, onNull: 0 } });
  const markedFlag = {
    $eq: [
      {
        $ifNull: [
          { $cond: ["$isMaterials", "$$item.purchased", "$$item.completed"] },
          false,
        ],
      },
      true,
    ],
  };
  const lineAmount = { $multiply: [num("$$item.qty"), num("$$item.rate")] };
  const valuationFactor = {
    $cond: [
      markedFlag,
      1,
      { $divide: [{ $max: [0, { $min: [100, num("$$item.percentComplete")] }] }, 100] },
    ],
  };

  const rows = await TakeoffProject.aggregate([
    // ownOnly: a sample is never part of the user's portfolio (util/agentSampleGuard.js).
    { $match: ownOnly({ userId: uid, pmTrackerOnly: { $ne: true } }) },
    {
      $addFields: {
        safeItems: { $ifNull: ["$items", []] },
        isMaterials: {
          $regexMatch: {
            input: { $toLower: { $ifNull: ["$productKey", ""] } },
            regex: "-material",
          },
        },
      },
    },
    {
      $project: {
        productKey: 1,
        name: 1,
        origin: 1,
        updatedAt: 1,
        // "Who is this job for" had no answer at all: the client was never
        // projected, so Ada could list a portfolio and not name a single one.
        clientName: 1,
        // The five facts the stage is worked out from (util/projectStage.js).
        // Without them a tendered job is indistinguishable from a priced one,
        // and "all my open projects" cannot be answered.
        contractLocked: { $ifNull: ["$contract.locked", false] },
        tenderedAt: { $ifNull: ["$contract.tenderedAt", null] },
        finalized: { $ifNull: ["$finalAccount.finalized", false] },
        certificateCount: { $size: { $ifNull: ["$certificates", []] } },
        // Which disciplines have a 3D (IFC) model attached — the question
        // "which of my projects has a model" has no other answer source.
        modelArch: { $gt: [{ $strLenCP: { $ifNull: ["$models.architectural.url", ""] } }, 0] },
        modelStruct: { $gt: [{ $strLenCP: { $ifNull: ["$models.structural.url", ""] } }, 0] },
        modelMep: { $gt: [{ $strLenCP: { $ifNull: ["$models.mep.url", ""] } }, 0] },
        itemCount: { $size: "$safeItems" },
        totalCost: { $sum: { $map: { input: "$safeItems", as: "item", in: lineAmount } } },
        valuedAmount: {
          $sum: {
            $map: {
              input: "$safeItems",
              as: "item",
              in: { $multiply: [lineAmount, valuationFactor] },
            },
          },
        },
        progressShare: {
          $sum: { $map: { input: "$safeItems", as: "item", in: valuationFactor } },
        },
      },
    },
  ]);

  if (!rows.length) {
    return "The user has no takeoff projects yet.";
  }

  const byProduct = new Map();
  let grandCost = 0;
  let grandValued = 0;
  let grandItems = 0;
  let grandMarked = 0;
  // "What is the total value of all my OPEN projects" is the question people
  // actually ask, and it is not the same number as the whole portfolio: a
  // finalised account is a finished job whose money is settled.
  let openCost = 0;
  let openCount = 0;
  const byStage = new Map();
  for (const r of rows) {
    r.stage = projectStage(r);
    byStage.set(r.stage, (byStage.get(r.stage) || 0) + 1);
    if (stageIsOpen(r.stage)) {
      openCount += 1;
      openCost += safeNum(r.totalCost);
    }
    grandCost += safeNum(r.totalCost);
    grandValued += safeNum(r.valuedAmount);
    grandItems += safeNum(r.itemCount);
    grandMarked += safeNum(r.progressShare);
    const key = r.productKey || "other";
    const g = byProduct.get(key) || { count: 0, cost: 0, valued: 0 };
    g.count += 1;
    g.cost += safeNum(r.totalCost);
    g.valued += safeNum(r.valuedAmount);
    byProduct.set(key, g);
  }
  const overall = grandItems > 0 ? (grandMarked / grandItems) * 100 : 0;

  const lines = [];
  lines.push(`Total projects: ${rows.length}`);
  lines.push(
    `Open projects (everything except a finalised account): ${openCount}, worth ${naira(openCost)}`,
  );
  lines.push(`Combined project value (sum of BoQ qty×rate): ${naira(grandCost)}`);
  lines.push(`Value of work completed to date: ${naira(grandValued)}`);
  lines.push(`Outstanding (remaining) value: ${naira(grandCost - grandValued)}`);
  lines.push(`Overall delivery progress: ${overall.toFixed(1)}%`);
  lines.push("");
  lines.push("By stage:");
  for (const st of STAGES) {
    const n = byStage.get(st.key) || 0;
    if (n) lines.push(`- ${st.label}: ${n} project(s)`);
  }
  lines.push("");
  lines.push("Breakdown by product:");
  for (const [key, g] of [...byProduct.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
    lines.push(
      `- ${productLabel(key)}: ${g.count} project(s), value ${naira(g.cost)}, done ${naira(g.valued)}`,
    );
  }
  // 3D models: only a model actually attached counts. A QUIV project is not
  // "a 3D project" unless one was pushed or uploaded.
  const modelled = rows
    .map((r) => ({
      r,
      parts: [
        r.modelArch && "architectural",
        r.modelStruct && "structural",
        r.modelMep && "MEP",
      ].filter(Boolean),
    }))
    .filter((x) => x.parts.length);
  lines.push("");
  if (modelled.length) {
    lines.push(`Projects with a 3D model attached (${modelled.length}):`);
    for (const { r, parts } of modelled) {
      lines.push(`- ${r.name || "Untitled"} (${productLabel(r.productKey)}): ${parts.join(", ")} model`);
    }
  } else {
    lines.push(
      "Projects with a 3D model attached: none. A model is attached when the project is saved from QUIV (or uploaded on the project's 3D Model view).",
    );
  }

  // Every project, newest first, so questions naming or filtering projects
  // ("which of my projects...", "list my HERON jobs") can be answered.
  const listed = [...rows]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 60);
  lines.push("");
  lines.push(
    `Projects (newest first${rows.length > listed.length ? `, first ${listed.length} of ${rows.length}` : ""}):`,
  );
  for (const r of listed) {
    const pct = safeNum(r.itemCount) > 0 ? (safeNum(r.progressShare) / safeNum(r.itemCount)) * 100 : 0;
    const model = r.modelArch || r.modelStruct || r.modelMep ? ", 3D model attached" : "";
    const imported = r.origin === "boq-import" ? ", imported from Excel" : "";
    // The client and the stage. "Who is the Lekki job for" and "which of these
    // are still live" were both unanswerable without them.
    const client = String(r.clientName || "").trim();
    const forWhom = client ? ` for ${client}` : "";
    lines.push(
      `- ${r.name || "Untitled"}${forWhom}: ${productLabel(r.productKey)}, ${stageLabel(r.stage)}, ${r.itemCount} lines, value ${naira(r.totalCost)}, ${pct.toFixed(0)}% done${model}${imported}, updated ${fmtDate(r.updatedAt)}`,
    );
  }

  // The clients, so "who are my clients" is one answer rather than a list the
  // model has to re-read line by line.
  const clients = [...new Set(rows.map((r) => String(r.clientName || "").trim()).filter(Boolean))];
  lines.push("");
  if (clients.length) {
    lines.push(`Clients on these projects (${clients.length}): ${clients.join(", ")}`);
  } else {
    lines.push(
      "No client is recorded on any of these projects. The client is set on the project's own page.",
    );
  }

  lines.push("");
  lines.push(
    "Note: MEP-family and some materials projects can show ₦0 value when rates aren't on the bill lines. Figures match the Portfolio Dashboard.",
  );
  return lines.join("\n");
}

// ── Project resolution ─────────────────────────────────────────────────────
// Fuzzy-find ONE of the user's own projects by name. Returns either
// { project } (loaded, owner-scoped) or { error } — a sentence Ada can relay.
// Shared by every project-scoped tool so they all disambiguate identically.
//
// SAMPLES (work-board item ada-reads-samples, 8 Oct 2026). A tool that passes
// { allowSample: true } may also get ONE read-only sample back, marked
// { sample: true }, and only when:
//   - the user is standing on that sample's page and named no project, or
//   - the name Ada passed says "sample" ("the 5-bedroom duplex sample").
// A name that merely resembles a sample never reaches one, the user's own
// project always wins, and only samples the user can open on the website
// (an active licence for that product) are considered. Nothing here widens a
// cross-project query: those use ownOnly() and never call this.
/**
 * THE PROJECT THE USER IS LOOKING AT.
 *
 * `ref` is whatever the page's address carries — an ObjectId on the classic
 * workspace, a slug on the new one. Resolved against the caller's own projects,
 * so a ref belonging to somebody else finds nothing rather than leaking a name.
 */
async function projectFromRef(userId, ref, productKey) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const uid = oid(userId);
  const where = ownOnly({ userId: uid });
  if (productKey) where.productKey = String(productKey).trim().toLowerCase();
  const fields = { name: 1, productKey: 1, updatedAt: 1, pmTrackerOnly: 1 };
  if (/^[a-f\d]{24}$/i.test(raw)) {
    const byId = await TakeoffProject.findOne({ ...where, _id: raw }, fields).lean();
    if (byId) return byId;
  }
  return TakeoffProject.findOne({ ...where, slug: raw }, fields).lean();
}

const SAMPLE_FIELDS = { name: 1, productKey: 1, slug: 1, updatedAt: 1, isSample: 1 };

// The website opens a product's samples to anyone holding an active licence
// for it (routes/projects.js accessFilter sits behind requireEntitlementParam).
// Ada sees exactly the same samples, never more.
function canOpenSample(viewer, sample) {
  return !!viewer && sample?.isSample === true && hasActiveEntitlement(viewer, sample.productKey);
}

/** The whole sample document, by id. Only ever matches a sample. */
async function loadSample(id) {
  const doc = await TakeoffProject.findOne({ _id: id, isSample: true }).lean();
  return doc?.isSample === true ? doc : null;
}

/** The sample whose page the user is on, if they may open it. */
async function sampleFromRef(ref, productKey, viewer) {
  const raw = String(ref || "").trim();
  if (!raw || !viewer) return null;
  const where = { isSample: true };
  if (productKey) where.productKey = String(productKey).trim().toLowerCase();
  let hit = null;
  if (/^[a-f\d]{24}$/i.test(raw)) {
    hit = await TakeoffProject.findOne({ ...where, _id: raw }, SAMPLE_FIELDS).lean();
  }
  if (!hit) hit = await TakeoffProject.findOne({ ...where, slug: raw.toLowerCase() }, SAMPLE_FIELDS).lean();
  if (!canOpenSample(viewer, hit)) return null;
  return loadSample(hit._id);
}

/** The samples this user may open, newest first. */
async function visibleSamples(viewer) {
  if (!viewer) return [];
  const rows = await TakeoffProject.find({ isSample: true }, SAMPLE_FIELDS).sort({ updatedAt: -1 }).lean();
  return (rows || []).filter((s) => canOpenSample(viewer, s));
}

/**
 * The sample a "...sample" name means. Matched with the word "sample" taken
 * out of both sides; the product of the page the user is on wins a tie (the
 * same house is a sample in QUIV, PlanSwift and ArchiCAD), then the shortest
 * name (the closest fit).
 */
async function sampleByName(query, viewer, pageProductKey) {
  const samples = await visibleSamples(viewer);
  if (!samples.length) return { samples };
  const q = withoutSampleWord(query).toLowerCase();
  if (!q) return { samples };
  const scored = samples.map((s) => {
    const name = withoutSampleWord(s.name).toLowerCase();
    return { s, score: name.includes(q) ? 1 : similarityScore(q, name) };
  });
  const top = Math.max(...scored.map((x) => x.score));
  if (top < 0.5) return { samples };
  const page = String(pageProductKey || "").trim().toLowerCase();
  const ties = scored
    .filter((x) => x.score === top)
    .sort(
      (a, b) =>
        (b.s.productKey === page) - (a.s.productKey === page) ||
        String(a.s.name).length - String(b.s.name).length,
    );
  const chosen = ties[0].s;
  const notes = [];
  const otherNames = [...new Set(ties.map((x) => x.s.name).filter((n) => n !== chosen.name))];
  if (otherNames.length) {
    notes.push(
      `Note: "${withoutSampleWord(query)}" also matches the sample(s) ${otherNames
        .slice(0, 4)
        .map((n) => `"${n}"`)
        .join(", ")}; these figures are from "${chosen.name}". Say which one you read and offer the others.`,
    );
  }
  const products = [...new Set(ties.filter((x) => x.s.name === chosen.name).map((x) => x.s.productKey))];
  if (products.length > 1) {
    notes.push(
      `Note: this sample exists for ${products.map(productLabel).join(", ")}; these figures are from the ${productLabel(chosen.productKey)} version. Mention that.`,
    );
  }
  return { samples, chosen, score: top, note: notes.join("\n") };
}

function sampleNamesHint(samples) {
  if (!samples?.length) return "";
  const names = [...new Set(samples.map((s) => s.name))].slice(0, 12).join(", ");
  return ` Read-only sample projects they can also ask about (pass the name with the word "sample"): ${names}.`;
}

async function resolveProject(userId, projectName, context = {}, { allowSample = false } = {}) {
  const uid = oid(userId);
  const query = String(projectName || "").trim();
  // Only a tool that asked for samples, for a signed-in user, ever sees one.
  const viewer = allowSample ? context.sampleViewer || null : null;

  // WHAT THE USER IS LOOKING AT, WHEN THEY DID NOT SAY A NAME.
  //
  // "how much is left to buy on this job" used to be unanswerable: the tool
  // asked which project they meant, while the page they were standing on
  // already knew. The client now sends its own address with every message and
  // it is used ONLY when no name was given — naming a project still wins, so
  // "and what about Lekki Mall" works from any page.
  // Ada is told the page's reference and passes it as the name where a tool
  // requires one; a database id or slug never matches a project NAME, so it is
  // read as "this page" too.
  const ref = String(context.projectRef || "").trim();
  if (!query || (ref && query === ref)) {
    const here = await projectFromRef(uid, context.projectRef, context.productKey);
    if (here) return { project: here };
    // The page is a sample the user opened: that sample, read-only.
    const sample = await sampleFromRef(context.projectRef, context.productKey, viewer);
    if (sample) return { project: sample, sample: true };
    return { error: "Ask the user which project they mean (by name)." };
  }

  const candidates = await TakeoffProject.find(
    ownOnly({ userId: uid }),
    { name: 1, productKey: 1, updatedAt: 1, pmTrackerOnly: 1 },
  )
    .sort({ updatedAt: -1 })
    .lean();

  // A sample is looked up by name only when the name says "sample".
  const wantsSample = !!viewer && mentionsSample(query);
  if (!candidates.length && !wantsSample) {
    const hint = viewer ? sampleNamesHint(await visibleSamples(viewer)) : "";
    return { error: `The user has no projects yet.${hint}` };
  }

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarityScore(query, c.name || "");
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // A direct case-insensitive substring hit wins outright ("multi storey" →
  // "Multi Storey Bill"); candidates are newest-first so the freshest wins.
  const sub = candidates.find((c) =>
    String(c.name || "").toLowerCase().includes(query.toLowerCase()),
  );
  if (sub) {
    best = sub;
    bestScore = 1;
  }

  // The user's own project wins: a sample is taken only when the name says
  // "sample", no own project contains that name, and the sample fits at least
  // as well as the user's best.
  let samples = [];
  if (wantsSample && !sub) {
    const pick = await sampleByName(query, viewer, context.productKey);
    samples = pick.samples || [];
    if (pick.chosen && pick.score >= bestScore) {
      const project = await loadSample(pick.chosen._id);
      if (!project) return { error: "That sample project could not be loaded." };
      return { project, sample: true, note: pick.note || "" };
    }
  } else if (viewer && (!best || bestScore < 0.5)) {
    samples = await visibleSamples(viewer);
  }

  // 0.5, not 0.3: at 0.3 a single shared filler word was enough for "zzz
  // nonexistent project" to resolve to "Project Takeoff" and answer with a
  // real project's figures. Better to ask than to quote the wrong bill.
  if (!best || bestScore < 0.5) {
    const names = candidates.slice(0, 12).map((c) => c.name).join(", ");
    const own = names ? ` The user's projects are: ${names}.` : " The user has no projects of their own yet.";
    return {
      error: `No project clearly matches "${query}".${own}${sampleNamesHint(samples)} Ask them which one they mean — do NOT answer with figures from a guessed project.`,
    };
  }

  const project = await TakeoffProject.findOne(ownOnly({ _id: best._id, userId: uid })).lean();
  if (!project) return { error: "That project could not be loaded." };

  // Duplicate project names are common (a re-save creates another "New
  // Takeoff"). Flag it so Ada can say which one it read.
  const sameName = candidates.filter(
    (c) => String(c.name || "").toLowerCase() === String(best.name || "").toLowerCase(),
  ).length;
  const note =
    sameName > 1
      ? `Note: the user has ${sameName} projects named "${best.name}" — these figures are from the most recently updated one. Mention that.`
      : "";
  return { project, note };
}

/** The sample label for a tool's answer, or "" for the user's own project. */
function bannerFor(project) {
  return isSampleProject(project) ? sampleBanner(project) : "";
}

/** `text`, with the sample label in front when the project is a sample. */
function labelled(project, text) {
  return bannerFor(project) + text;
}

// ── Single project detail ──────────────────────────────────────────────────
// Summarise one project's value, progress and schedule.
export async function getProjectDetails(userId, projectName, context = {}) {
  const { project, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;

  const scope = computeProjectScope(project);
  let dash = null;
  try {
    dash = computePmDashboard(project);
  } catch {
    dash = null;
  }

  const lines = [];
  lines.push(`Project: ${project.name} (${productLabel(project.productKey)})`);
  lines.push(`Total project value: ${naira(scope.projectTotal)}`);
  lines.push(`Work done (earned) to date: ${naira(scope.totalEarned)}`);
  lines.push(`Actual cost recorded: ${naira(scope.totalActual)}`);
  const prog = scope.projectTotal > 0 ? (safeNum(scope.totalEarned) / scope.projectTotal) * 100 : 0;
  lines.push(`Progress: ${prog.toFixed(1)}%`);
  lines.push(
    `Contract: ${project?.contract?.locked ? `locked (sum ${naira(project.contract.contractSum)})` : "not locked"}`,
  );
  if (dash?.headline) {
    lines.push(
      `Schedule/earned-value — CPI ${dash.headline.CPI} (cost), SPI ${dash.headline.SPI} (schedule), ${dash.totals?.completedTasks ?? 0}/${dash.totals?.totalTasks ?? 0} tasks done, ${dash.headline.overdueCount ?? 0} overdue.`,
    );
    if (dash.projectFinish) lines.push(`Planned finish: ${fmtDate(dash.projectFinish)}.`);
  }
  lines.push(
    "Tell the user they can open the full Project or PM report from the project's page for the detailed breakdown.",
  );
  if (note) lines.push(note);
  return labelled(project, lines.join("\n"));
}

// ── Bill / Budget primitives ───────────────────────────────────────────────
// A project holds THREE line collections (see models/TakeoffProject.js):
//   items[]        — the bill of quantities (measured work items)
//   budgetItems[]  — the consolidated Material & Labour breakdown (Budget tab)
//   materialItems[]— the raw plugin-pushed breakdown budgetItems is built from
// budgetItems is the canonical breakdown, but it is consolidated lazily when a
// project is opened, so fall back to materialItems for projects not opened
// since that feature shipped. Quantity roll-ups don't depend on bill linkage,
// so the fallback is safe.
function budgetRows(project) {
  const b = Array.isArray(project?.budgetItems) ? project.budgetItems : [];
  if (b.length) return b;
  return Array.isArray(project?.materialItems) ? project.materialItems : [];
}

function billRows(project) {
  return Array.isArray(project?.items) ? project.items : [];
}

// Material | Labour | Plant | Consumable | Equipment. Blank/unknown → "Other".
// The vocabulary is util/resourceKind.js; only the "Other" fallback is local,
// because a sales answer would rather say "Other" than repeat a word the QS
// typed into a kind column.
function kindOf(row) {
  const k = canonicalKind(row?.componentKind);
  return k ? kindLabel(k) : "Other";
}

function resourceName(row) {
  return (
    String(row?.materialName || "").trim() ||
    String(row?.description || "").trim() ||
    String(row?.takeoffLine || "").trim() ||
    "(unnamed)"
  );
}

function unitOf(row) {
  return String(row?.unit || "").trim() || "no unit";
}

// Units are hand-typed across plugins and rate libraries, so the same unit
// arrives as "bags"/"bag", "Nr"/"nr", "m³"/"m3". Fold them to one key so a
// total doesn't split into three lines; the display spelling is the one seen
// most often for that key (see addQty).
function unitKey(unit) {
  let u = String(unit || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!u) return "no unit";
  u = u.replace(/³/g, "3").replace(/²/g, "2");
  if (u === "sqm" || u === "sq m") u = "m2";
  if (u === "cum" || u === "cu m") u = "m3";
  if (u === "nos" || u === "no." || u === "nr.") u = "nr";
  // Simple plural → singular ("bags" → "bag"). Guarded so "ss" endings and
  // 2-char units (kg, m2, ea) are never mangled.
  if (u.length > 3 && u.endsWith("s") && !u.endsWith("ss")) u = u.slice(0, -1);
  return u;
}

// The rate a budget row is costed at. MUST be `rate` — the Budget tab's Amount
// column is qty × rate (ProjectBudgetTab.jsx) and deriveBillRates.js sums the
// same. `budgetRate` is the DERIVED PER-BILL-UNIT rate, so using it here
// multiplies a resource quantity by a bill-level rate and inflates the cost by
// orders of magnitude.
function rowRate(row) {
  return safeNum(row?.rate);
}

function fmtQty(v) {
  const n = safeNum(v);
  // Quantities are read aloud by Ada — keep them tidy but never lose precision
  // on small figures (0.35 m³ of concrete matters).
  if (Math.abs(n) >= 100) return n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
  return String(Number(n.toFixed(2)));
}

// Does a word in `hay` START with `token`? Anchored at a word boundary but
// open-ended, so "cement" hits "Cement (Dangote 42.5N)" and "cementitious"
// but NOT "reinforcement" or "replacement" — a plain substring test silently
// folded rebar tonnage into cement bag counts.
function wordStartsWith(hay, token) {
  if (!token) return false;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${esc}`, "i").test(hay);
}

// Does this row's name match what the user asked for ("cement", "20mm rebar")?
// Every query token must start a word in the row text; a fuzzy token-set score
// catches rewordings.
function matchesResource(text, query) {
  const hay = String(text || "").toLowerCase();
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;
  if (wordStartsWith(hay, q)) return true;
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length && tokens.every((t) => wordStartsWith(hay, t))) return true;
  return similarityScore(query, text || "") >= 0.5;
}

// Quantity accumulator keyed by canonical unit. Each bucket also tallies how
// often each raw spelling was seen so the total can be shown in the user's own
// wording ("bags", not "bag").
function addQty(map, unit, qty) {
  const key = unitKey(unit);
  const raw = String(unit || "").trim() || "no unit";
  const b = map.get(key) || { qty: 0, labels: new Map() };
  b.qty += safeNum(qty);
  b.labels.set(raw, safeNum(b.labels.get(raw)) + 1);
  map.set(key, b);
}

// Roll the accumulator into "1,250 bags; 43.5 m3" — quantities in different
// units can never be added, so they stay separate.
function formatQtyByUnit(map) {
  const parts = [...map.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .map(([, b]) => {
      const label = [...b.labels.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || "";
      return `${fmtQty(b.qty)} ${label}`.trim();
    });
  return parts.length ? parts.join("; ") : "0";
}

// ── Resource / material quantity lookup ────────────────────────────────────
// "How much cement do I need on Dutum Demo?" — scans the Material & Labour
// breakdown (and the bill lines as a fallback) for rows matching `resource`,
// then totals the quantity PER UNIT. Scoped to one project when projectName is
// given, otherwise across every project the user owns.
export async function getResourceQuantity(userId, resource, projectName, context = {}) {
  const query = String(resource || "").trim();
  if (!query) {
    return "Ask the user which material, labour or resource they want the quantity for (e.g. cement, rebar, mason).";
  }

  let projects = [];
  let resolveNote = "";
  // A named sample is answered on its own, labelled; never in a total with anything else.
  let banner = "";
  if (String(projectName || "").trim()) {
    const { project, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
    if (error) return error;
    projects = [project];
    resolveNote = note || "";
    banner = bannerFor(project);
  } else {
    // origin "takeoff-derived" projects are auto-created "<name> - material"
    // twins of a takeoff — their lines are the SAME materials as the parent's.
    // Counting both would silently double every quantity, so the twins are
    // excluded from an all-projects total (naming one explicitly still works).
    // ownOnly: a total across projects never counts a sample.
    projects = await TakeoffProject.find(
      ownOnly({
        userId: oid(userId),
        pmTrackerOnly: { $ne: true },
        origin: { $ne: "takeoff-derived" },
      }),
      {
        name: 1,
        productKey: 1,
        budgetItems: 1,
        materialItems: 1,
        items: 1,
        updatedAt: 1,
      },
    )
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean();
    if (!projects.length) return "The user has no takeoff projects yet.";
  }

  const grandQty = new Map(); // unit → qty (matched resource rows)
  let grandCost = 0;
  let grandProcured = 0; // value already procured/purchased
  const nameCounts = new Map(); // distinct resource names that matched
  const perProject = [];
  let usedBillFallback = false;

  for (const project of projects) {
    const projQty = new Map();
    const kinds = new Set();
    let projCost = 0;
    let hits = 0;

    let rows = budgetRows(project).filter((r) => matchesResource(resourceName(r), query));
    // Nothing in the breakdown? Fall back to bill lines — some products
    // (MEP/CIVIQ, BoQ imports) carry the resource on the work item itself.
    let fromBill = false;
    if (!rows.length) {
      rows = billRows(project).filter((r) =>
        matchesResource(
          `${r?.materialName || ""} ${r?.description || ""} ${r?.takeoffLine || ""}`,
          query,
        ),
      );
      fromBill = rows.length > 0;
      if (fromBill) usedBillFallback = true;
    }

    for (const r of rows) {
      const qty = safeNum(r.qty);
      const unit = unitOf(r);
      const amount = qty * (fromBill ? safeNum(r.rate) : rowRate(r));
      addQty(projQty, unit, qty);
      addQty(grandQty, unit, qty);
      projCost += amount;
      grandCost += amount;
      if (!fromBill) {
        kinds.add(kindOf(r));
        if (r.procured === true) grandProcured += amount;
        else grandProcured += amount * (Math.min(100, Math.max(0, safeNum(r.procuredPercent))) / 100);
      }
      const nm = resourceName(r);
      nameCounts.set(nm, safeNum(nameCounts.get(nm)) + 1);
      hits += 1;
    }

    if (hits > 0) {
      perProject.push(
        `- ${project.name}: ${formatQtyByUnit(projQty)} (${hits} line${hits === 1 ? "" : "s"}, cost ${naira(projCost)}${
          fromBill ? ", from bill lines — no material breakdown on this project" : ""
        }${kinds.size ? `, ${[...kinds].join("+")}` : ""})`,
      );
    }
  }

  if (!perProject.length) {
    const scope = projects.length === 1 ? `project "${projects[0].name}"` : "any of their projects";
    return `${banner}No material, labour or bill line matching "${query}" was found in ${scope}. Say so plainly — do NOT estimate a quantity. Suggest they check the Budget (Material & Labour) tab, or that the resource may be named differently there (ask what wording their bill uses).`;
  }

  const lines = [];
  lines.push(
    `Resource query: "${query}" — ${projects.length === 1 ? `project "${projects[0].name}"` : `across ${projects.length} project(s)`}.`,
  );
  lines.push(`TOTAL QUANTITY: ${formatQtyByUnit(grandQty)}`);
  lines.push(`Total cost of those lines: ${naira(grandCost)}`);
  if (grandProcured > 0) {
    lines.push(
      `Already procured/purchased: ${naira(grandProcured)} of that (${((grandProcured / grandCost) * 100).toFixed(0)}%).`,
    );
  }
  if (perProject.length > 1) {
    lines.push("");
    lines.push("By project:");
    lines.push(...perProject.slice(0, 25));
    lines.push(
      "This is a total across SEPARATE projects — say so, and offer the per-project figures. Auto-generated '<name> - material' twin projects are excluded so nothing is double-counted.",
    );
  }
  const names = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (names.length) {
    lines.push("");
    lines.push(
      `Matched resource names: ${names.map(([n, c]) => `${n} (${c}×)`).join(", ")}. Mention these so the user can confirm the match is right.`,
    );
  }
  lines.push("");
  lines.push(
    "Quantities in different units are listed separately — NEVER add them together. Quote these figures exactly; do not convert units (e.g. m³ → bags) unless the user gives you the conversion factor.",
  );
  if (usedBillFallback) {
    lines.push(
      "Some figures came from bill work items rather than a material breakdown, so they are the measured work quantity, not a purchased material quantity — say so.",
    );
  }
  if (resolveNote) lines.push(resolveNote);
  return banner + lines.join("\n");
}

// ── Budget (Material & Labour) breakdown ───────────────────────────────────
// The whole cost plan for one project: Material vs Labour vs Plant totals,
// procurement status, and the biggest resources by cost.
export async function getProjectBudget(userId, projectName, context = {}) {
  const { project, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;

  const rows = budgetRows(project);
  if (!rows.length) {
    return labelled(project, `Project "${project.name}" has no Material & Labour breakdown yet. The breakdown is pushed by the desktop plugin when the project is saved (MEP projects don't send one). Tell the user plainly, and point them to the project's Budget tab.`);
  }

  const byKind = new Map(); // kind → { cost, count, procured }
  const byResource = new Map(); // name → { qty per unit, cost, kind }
  let total = 0;
  let procuredValue = 0;

  for (const r of rows) {
    const kind = kindOf(r);
    const qty = safeNum(r.qty);
    const amount = qty * rowRate(r);
    total += amount;

    const pct = r.procured === true ? 1 : Math.min(100, Math.max(0, safeNum(r.procuredPercent))) / 100;
    procuredValue += amount * pct;

    const k = byKind.get(kind) || { cost: 0, count: 0, procured: 0 };
    k.cost += amount;
    k.count += 1;
    k.procured += amount * pct;
    byKind.set(kind, k);

    const nm = resourceName(r);
    const g = byResource.get(nm) || { qty: new Map(), cost: 0, kind };
    addQty(g.qty, unitOf(r), qty);
    g.cost += amount;
    byResource.set(nm, g);
  }

  const lines = [];
  lines.push(`Budget (Material & Labour breakdown) for "${project.name}" (${productLabel(project.productKey)}):`);
  lines.push(`Total budgeted cost: ${naira(total)} across ${rows.length} resource lines.`);
  lines.push(
    `Procured / purchased so far: ${naira(procuredValue)}${total > 0 ? ` (${((procuredValue / total) * 100).toFixed(1)}%)` : ""}; outstanding to buy: ${naira(total - procuredValue)}.`,
  );
  lines.push("");
  lines.push("By component type:");
  for (const [kind, k] of [...byKind.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
    const share = total > 0 ? ((k.cost / total) * 100).toFixed(1) : "0.0";
    lines.push(`- ${kind}: ${naira(k.cost)} (${share}%), ${k.count} line(s), procured ${naira(k.procured)}`);
  }

  const top = [...byResource.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 15);
  lines.push("");
  lines.push("Biggest resources by cost:");
  for (const [nm, g] of top) {
    lines.push(`- ${nm} [${g.kind}]: ${formatQtyByUnit(g.qty)} — ${naira(g.cost)}`);
  }
  if (byResource.size > top.length) {
    lines.push(`(…and ${byResource.size - top.length} more resources. Ask for one by name to get its exact quantity.)`);
  }

  const basis = project?.valuationSettings?.basis === "budget" ? "budget" : "boq";
  lines.push("");
  lines.push(
    `Valuation basis: ${basis === "budget" ? "Budget (bill % derived from the material/labour breakdown)" : "BoQ (each bill line valued on its own % complete)"}.`,
  );
  lines.push(
    "Quote these figures exactly. Lines with a ₦0 rate simply aren't priced yet — say that rather than treating them as free.",
  );
  if (note) lines.push(note);
  return labelled(project, lines.join("\n"));
}

// ── Bill of Quantities lines ───────────────────────────────────────────────
// The measured work items themselves — qty, unit, rate, amount, % complete —
// optionally filtered to lines matching a search phrase.
export async function getProjectBill(userId, projectName, search, context = {}) {
  const { project, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;

  const all = billRows(project);
  if (!all.length) {
    return labelled(project, `Project "${project.name}" has no bill lines yet.`);
  }

  const q = String(search || "").trim();
  const rows = q
    ? all.filter((r) =>
        matchesResource(
          `${r?.description || ""} ${r?.materialName || ""} ${r?.takeoffLine || ""} ${r?.category || ""} ${r?.trade || ""}`,
          q,
        ),
      )
    : all;

  if (!rows.length) {
    const cats = [...new Set(all.map((r) => String(r.category || "").trim()).filter(Boolean))].slice(0, 15);
    return labelled(
      project,
      `No bill line in "${project.name}" matches "${q}". Its ${all.length} lines are grouped under: ${cats.join(", ") || "(no categories)"}. Ask the user to rephrase — do NOT invent a line.`,
    );
  }

  const enriched = rows.map((r) => {
    const qty = safeNum(r.qty);
    const rate = safeNum(r.rate);
    const done = r.completed === true ? 100 : Math.min(100, Math.max(0, safeNum(r.percentComplete)));
    return { r, qty, rate, amount: qty * rate, done };
  });

  const total = enriched.reduce((s, e) => s + e.amount, 0);
  const earned = enriched.reduce((s, e) => s + e.amount * (e.done / 100), 0);

  // Quantity totals per unit — answers "how much concrete is measured?".
  const qtyByUnit = new Map();
  for (const e of enriched) addQty(qtyByUnit, unitOf(e.r), e.qty);

  const lines = [];
  lines.push(
    `Bill of Quantities for "${project.name}" (${productLabel(project.productKey)})${q ? ` — lines matching "${q}"` : ""}:`,
  );
  lines.push(`${enriched.length} line(s)${q ? ` of ${all.length} total` : ""}.`);
  lines.push(`Measured quantity: ${formatQtyByUnit(qtyByUnit)}`);
  lines.push(`Value: ${naira(total)}; work done to date: ${naira(earned)}${total > 0 ? ` (${((earned / total) * 100).toFixed(1)}%)` : ""}.`);
  lines.push("");

  const show = [...enriched].sort((a, b) => b.amount - a.amount).slice(0, 30);
  lines.push(q ? "Matching lines (largest first):" : "Largest lines by value:");
  for (const e of show) {
    const desc = String(e.r.description || e.r.takeoffLine || "(no description)").slice(0, 90);
    lines.push(
      `- ${desc} — ${fmtQty(e.qty)} ${unitOf(e.r)} @ ${naira(e.rate)} = ${naira(e.amount)}, ${e.done.toFixed(0)}% done${e.r.category ? ` [${e.r.category}]` : ""}`,
    );
  }
  if (enriched.length > show.length) {
    lines.push(`(…and ${enriched.length - show.length} more lines — ask for a narrower search to see them.)`);
  }
  lines.push("");
  lines.push(
    "Quote these exactly. A ₦0 rate means the line isn't priced yet. For the material/labour behind a line, use get_project_budget or get_resource_quantity.",
  );
  if (note) lines.push(note);
  return labelled(project, lines.join("\n"));
}

// ── Bill lines shaped for the ADLM AI Service ──────────────────────────────
// The AI service (/api/ai/boq-check, /api/ai/outliers) takes
// [{ ref, description, unit, quantity, rate }]. This resolves the project the
// same way every other tool does and hands back the raw rows, so Ada's
// rate-check / error-scan tools run against the user's REAL bill rather than
// anything the model retyped. `search` narrows a big bill; `limit` keeps the
// request (and the AI service's per-call cost) bounded.
export async function getBillItemsForAi(userId, projectName, search, limit = 200, opts = {}, context = {}) {
  const { project, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return { error };

  const all = billRows(project);
  if (!all.length) return { error: `Project "${project.name}" has no bill lines to check yet.` };

  const q = String(search || "").trim();
  let rows = q
    ? all.filter((r) =>
        matchesResource(
          `${r?.description || ""} ${r?.materialName || ""} ${r?.takeoffLine || ""} ${r?.category || ""} ${r?.trade || ""}`,
          q,
        ),
      )
    : all;

  if (!rows.length) {
    return { error: `No bill line in "${project.name}" matches "${q}". Ask the user to rephrase.` };
  }

  // A ₦0 line isn't cheap, it's UNPRICED. Sending it to the market check gets
  // back "100% below market", which is noise, and (because the library can't
  // benchmark it) burns a model call per line. The error scan still wants
  // them — an unpriced line is worth flagging — so this is opt-in.
  let unpriced = 0;
  if (opts.requireRate) {
    const priced = rows.filter((r) => safeNum(r.rate) > 0);
    unpriced = rows.length - priced.length;
    if (!priced.length) {
      return {
        error: `Every bill line in "${project.name}"${q ? ` matching "${q}"` : ""} has a ₦0 rate, so there is nothing to benchmark. Tell the user their bill isn't priced yet and offer to help them price it (suggest_rate can build a rate up for any work item).`,
      };
    }
    rows = priced;
  }

  // Biggest-value lines first: if the bill is truncated, the money that
  // matters is what got checked.
  const ranked = [...rows].sort(
    (a, b) => safeNum(b.qty) * safeNum(b.rate) - safeNum(a.qty) * safeNum(a.rate),
  );
  const capped = ranked.slice(0, Math.max(1, Math.min(500, limit)));

  const items = capped.map((r, i) => ({
    ref: String(i + 1),
    description: String(r.description || r.takeoffLine || r.materialName || "").slice(0, 300),
    unit: unitOf(r) === "no unit" ? "" : unitOf(r),
    quantity: safeNum(r.qty),
    rate: safeNum(r.rate),
  }));

  return {
    project: { name: project.name, productKey: project.productKey },
    // A sample's lines can be checked, read-only; the answer is labelled.
    sample: isSampleProject(project),
    banner: bannerFor(project),
    items,
    truncated: capped.length < rows.length ? rows.length - capped.length : 0,
    unpriced,
    note: note || "",
  };
}

// ── Subscriptions / account ────────────────────────────────────────────────
// Summarises the user's entitlements (already loaded on ctx.user) plus a live
// per-product project-slot count. Owner-scoped; no cross-user reads.
export async function getAccountSummary(user) {
  const ents = Array.isArray(user?.entitlements) ? user.entitlements : [];
  if (!ents.length) {
    return "The user has no active subscriptions yet — a good moment to recommend a first purchase.";
  }

  const now = Date.now();
  const isExpired = (e) =>
    e.status !== "active" || (e.expiresAt && new Date(e.expiresAt).getTime() < now);

  const lines = ["The user's subscriptions:"];
  for (const e of ents) {
    const label = productLabel(e.productKey);
    const state = isExpired(e) ? "EXPIRED/inactive" : "active";
    const lt = e.licenseType === "organization" ? "Organization" : "Personal";
    const exp = e.expiresAt ? `, expires ${fmtDate(e.expiresAt)}` : "";
    const seats = e.seats && e.seats > 1 ? `, ${e.seats} seats` : "";
    lines.push(`- ${label} (${e.productKey}): ${state}, ${lt}${seats}${exp}`);
  }

  // Live project-slot usage per product (owned, non-PM-tracker), so Ada can
  // answer "how many projects can I still create?".
  try {
    const uid = oid(user._id);
    // TWO THINGS WERE WRONG WITH THIS COUNT.
    //
    // It counted the auto-created *-materials siblings as projects of their
    // own, so a QS with five HERON jobs was told they had ten, listed under a
    // product called "HERON Materials". Real slot accounting never counts them
    // (routes/projects.js, projectLimitForProduct and its caller).
    //
    // And it captioned the answer "used of 30-slot base cap per product", which
    // is the PERSONAL cap. An organisation licence gets 50, and any product can
    // carry purchased extraProjectSlots on top. Ada's own tool description
    // promises "how many projects can I still create", so a wrong cap is a
    // wrong answer to the question she is advertising.
    const counts = await TakeoffProject.aggregate([
      {
        $match: ownOnly({
          userId: uid,
          pmTrackerOnly: { $ne: true },
          productKey: { $not: /-material/i },
        }),
      },
      { $group: { _id: "$productKey", count: { $sum: 1 } } },
    ]);
    if (counts.length) {
      const isOrg = ents.some(
        (e) => e?.licenseType === "organization" && e?.status === "active",
      );
      const base = isOrg ? 50 : 30;
      lines.push("");
      lines.push(
        `Project usage (${isOrg ? "organisation" : "personal"} licence: ${base} slots per product, plus any purchased):`,
      );
      for (const c of counts.sort((a, b) => b.count - a.count)) {
        const ent = ents.find((e) => e?.productKey === c._id && e?.status === "active");
        const extra = safeNum(ent?.extraProjectSlots);
        const cap = base + extra;
        lines.push(
          `- ${productLabel(c._id)}: ${c.count} of ${cap} used${extra ? ` (${base} + ${extra} purchased)` : ""}, ${Math.max(0, cap - c.count)} left`,
        );
      }
    }
  } catch {
    /* usage is best-effort */
  }

  lines.push("");
  lines.push(
    "If a subscription is expired or they want more seats/slots, offer a renewal/upgrade next step.",
  );
  return lines.join("\n");
}

// ── Procurement ────────────────────────────────────────────────────────────
//
// "What do I need to buy next" had no answer. getProjectBudget returns
// procured-vs-outstanding as one figure and the fifteen biggest resources by
// cost — useful for "how much is left to spend", useless for "what do I order
// this week", which is a question about DATES.
//
// The dates already exist. A budget row carries billIdentity; a programme task
// carries the identities of the lines it builds and its own start. So the
// earliest task that needs a material, less the supplier's lead time, is when
// it has to be ordered — exactly what the Buy schedule screen shows. This is
// that list, in words.
//
// Nothing is invented: a project with no programme has no dates, and this says
// so rather than making some up.
export async function getProcurementSchedule(userId, projectName, context = {}, opts = {}) {
  const { project, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;

  const leadDays = Math.max(0, Math.min(180, safeNum(opts.leadDays) || 14));
  const budget = Array.isArray(project.budgetItems) ? project.budgetItems : [];
  if (!budget.length) {
    return labelled(project, `${project.name} has no Material & Labour breakdown yet, so there is nothing to buy from. It arrives with the bill from QUIV or HERON, or from cost rates typed against each line.`);
  }

  const tasks = Array.isArray(project?.projectManagement?.tasks)
    ? project.projectManagement.tasks
    : [];
  // Bill code -> the earliest task that builds it.
  const startByCode = new Map();
  for (const t of tasks) {
    const start = t?.startDate ? new Date(t.startDate) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    for (const ident of t?.linkedBoqIdentities || []) {
      const parts = String(ident || "").split("::");
      const code = String(parts.length > 1 ? parts[1] : parts[0] || "").trim().toLowerCase();
      if (!code) continue;
      const cur = startByCode.get(code);
      if (!cur || start < cur.start) startByCode.set(code, { start, name: String(t?.name || "") });
    }
  }

  const DAY = 86400000;
  const rows = budget
    .filter((r) => {
      const kind = canonicalKind(r?.componentKind);
      // Only a material is bought from a supplier against a lead time. A gang
      // in a purchase list is how somebody orders a bricklayer.
      return kind !== "Labour" && kind !== "Plant";
    })
    .map((r) => {
      const hit = startByCode.get(String(r?.billIdentity || "").trim().toLowerCase());
      const amount = safeNum(r?.qty) * (safeNum(r?.budgetRate) || safeNum(r?.rate));
      return {
        name: String(r?.materialName || r?.description || "Unnamed material").trim(),
        unit: String(r?.unit || "").trim(),
        qty: safeNum(r?.qty),
        amount,
        supplier: String(r?.supplier || "").trim(),
        bought: r?.procured === true || safeNum(r?.procuredPercent) >= 100,
        needBy: hit ? hit.start : null,
        buyBy: hit ? new Date(hit.start.getTime() - leadDays * DAY) : null,
        forTask: hit ? hit.name : "",
      };
    })
    .filter((r) => !r.bought);

  if (!rows.length) {
    return labelled(project, `Everything on ${project.name}'s material schedule is already marked bought.`);
  }

  const dated = rows.filter((r) => r.buyBy).sort((a, b) => a.buyBy - b.buyBy);
  const undated = rows.filter((r) => !r.buyBy).sort((a, b) => b.amount - a.amount);
  const now = Date.now();
  const overdue = dated.filter((r) => r.buyBy.getTime() < now);
  const outstanding = rows.reduce((a, r) => a + r.amount, 0);

  const lines = [];
  lines.push(`Procurement still to buy on ${project.name}: ${naira(outstanding)} across ${rows.length} material(s).`);
  if (overdue.length) {
    lines.push(
      `${overdue.length} should already have been ordered, worth ${naira(overdue.reduce((a, r) => a + r.amount, 0))}.`,
    );
  }

  if (dated.length) {
    lines.push("");
    lines.push(`Next to order (soonest first, ${leadDays}-day lead time):`);
    for (const r of dated.slice(0, 20)) {
      const late = r.buyBy.getTime() < now ? " — OVERDUE" : "";
      const who = r.supplier ? ` from ${r.supplier}` : "";
      lines.push(
        `- ${r.name}: ${r.qty ? `${Math.ceil(r.qty)} ${r.unit}`.trim() : "quantity not set"}, ${naira(r.amount)}, order by ${fmtDate(r.buyBy)} for ${fmtDate(r.needBy)} on site${who}${late}`,
      );
    }
    if (dated.length > 20) lines.push(`…and ${dated.length - 20} more with dates.`);
  }

  if (undated.length) {
    lines.push("");
    // Honest about WHY, because the remedy is one button on the PM dashboard.
    lines.push(
      `${undated.length} material(s) worth ${naira(undated.reduce((a, r) => a + r.amount, 0))} have no order date: no programme task covers their bill lines, so nothing says when they are needed. Planning the work from the bill on the PM dashboard gives them dates.`,
    );
    for (const r of undated.slice(0, 10)) {
      lines.push(`- ${r.name}: ${naira(r.amount)}`);
    }
  }

  if (note) lines.push(note);
  return labelled(project, lines.join("\n"));
}

// ── Estimator & PM tools: pricing proposal, period report, tips ────────────
//
// These three return { text, card } rather than a bare string. `text` goes back
// to the model as the tool result, like every tool above. `card` is rendered by
// the chat under Ada's reply (components/AiAgent.jsx): a confirm list for
// pricing, a report button for a date range. The card carries the project's
// _id and productKey because the endpoints it calls address a project that
// way; both come from the project resolved against the caller's OWN account,
// never from anything the model typed.

// resolveProject returns a slim projection when the project came from the page
// reference. These tools need the whole document.
async function loadWhole(userId, project) {
  if (Array.isArray(project?.items)) return project;
  return TakeoffProject.findOne(ownOnly({ _id: project._id, userId: oid(userId) })).lean();
}

// What the caller may do with it, by the same rule as routes/projects.js.
// resolveProject only ever finds the caller's own projects, so this is the
// owner today; asking anyway means a future change to resolveProject (shared
// projects, say) cannot quietly hand rates to a collaborator who may not see
// them. hasRateGen answers false: if that day comes, the safe default is to
// mask until somebody wires the real check in.
async function accessFor(userId, project) {
  return resolveProjectAccess(oid(userId), project, { hasRateGen: async () => false });
}

function cardProject(project) {
  return {
    id: String(project._id),
    productKey: String(project.productKey || "").toLowerCase(),
    name: String(project.name || "Project"),
    slug: String(project.slug || ""),
  };
}

/**
 * A proposed rate for every unpriced line on one project. Never writes.
 *
 * @returns {Promise<string | {text: string, card: object}>}
 */
export async function getPricingProposal(userId, projectName, context = {}) {
  const { project: found, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;
  // A sample is refused before anything is read from it: no Proposed rates card.
  if (isSampleProject(found)) return sampleProposalRefusal(found);
  const project = await loadWhole(userId, found);
  if (!project) return "That project could not be loaded.";
  if (isSampleProject(project)) return sampleProposalRefusal(project);

  const access = await accessFor(userId, project);
  if (!access.canSeeRates) {
    return `The user cannot see rates on "${project.name}", so no rates can be proposed for it. Say so plainly.`;
  }
  if (!access.canEdit) {
    return `The user has view-only access to "${project.name}", so rates cannot be applied to it. Say so plainly.`;
  }

  const [masterRates, lib] = await Promise.all([
    RateGenRate.find({}).lean(),
    RateGenLibrary.findOne({ userId: oid(userId) }).lean(),
  ]);
  const merged = mergeRatesWithUserData(
    masterRates,
    Array.isArray(lib?.rateOverrides) ? lib.rateOverrides : [],
    Array.isArray(lib?.customRates) ? lib.customRates : [],
  );
  // What this QS chose before ranks first, as it does in the line panel.
  let usage = null;
  try {
    const rows = await RateUsage.find({ userId: oid(userId) })
      .sort({ createdAt: -1 })
      .limit(3000)
      .select("key unit rateId projectId projectName createdAt")
      .lean();
    usage = usageIndex(rows.map((r) => ({ ...r, at: r.createdAt })));
  } catch {
    usage = null;
  }
  const p = buildPricingProposal(project.items, merged, { usage, convert: true });

  if (!p.unpricedCount) {
    return `Every line on "${project.name}" already has a rate. Nothing to propose. Offer to check the rates against the market instead, if that tool is available.`;
  }
  if (!p.lines.length) {
    return [
      `"${project.name}" has ${p.unpricedCount} unpriced line(s), but none of the user's ${p.libraryCount} RateGen rates matches them in the same unit.`,
      p.noCodeCount
        ? `${p.noCodeCount} of them have no bill code, so they can only be priced from the line itself.`
        : "",
      "Say so plainly. Do NOT suggest figures yourself. Offer to build a rate up for a named line with suggest_rate if that tool is available, or point them to the Rates & budget tab.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [];
  lines.push(
    `Pricing proposal for "${project.name}" (${productLabel(project.productKey)}): ${p.lines.length} of ${p.unpricedCount} unpriced line(s) matched a rate in the user's own RateGen library. Applying all of them would add ${naira(p.totalToAdd)} to the bill.`,
  );
  if (p.unmatchedCount) lines.push(`${p.unmatchedCount} unpriced line(s) had no rate in the same unit.`);
  if (p.noCodeCount) {
    lines.push(`${p.noCodeCount} unpriced line(s) have no bill code and cannot be priced from here.`);
  }
  if (p.truncated) {
    lines.push(`Only the first ${p.lines.length} are on the card; apply them, then ask again for the rest.`);
  }
  lines.push("");
  lines.push("Proposed (bill order, first 12):");
  for (const l of p.lines.slice(0, 12)) {
    lines.push(
      `- ${l.code}: ${l.description.slice(0, 80)} — ${fmtQty(l.qty)} ${l.unit} × ${naira(l.unitPrice)} (${l.rateDescription.slice(0, 70)}) = ${naira(l.amount)}. ${l.why}.`,
    );
  }
  lines.push("");
  lines.push(
    "A confirm card listing every proposed line, each with a tick box, is shown under your reply. NOTHING has been priced. Tell the user to untick any line they disagree with and press Apply. Never say the rates are applied. Briefly explain the strongest and weakest matches, and that a rate is matched by description and unit only.",
  );
  if (note) lines.push(note);

  return {
    text: lines.join("\n"),
    card: {
      type: "price-proposal",
      label: `Apply ${p.lines.length} rate${p.lines.length === 1 ? "" : "s"}`,
      project: cardProject(project),
      lines: p.lines,
      totalToAdd: p.totalToAdd,
      unpricedCount: p.unpricedCount,
      unmatchedCount: p.unmatchedCount,
      noCodeCount: p.noCodeCount,
      truncated: p.truncated,
    },
  };
}

// ── Rates the USER states ──────────────────────────────────────────────────
// "Windows are 88,000 per m2", "set blockwork to 9,500 per m2", "rate line 14
// at 2,000". The figure is the user's, not Ada's; these build the same kind of
// confirm card as propose_project_pricing and write nothing. Apply posts the
// stated rate (and for openings the rate PER M², never the line's figure) to
// price-many, which re-works every line from the bill itself.

/** The project, whole, if the caller may price it; otherwise the words why not. */
async function projectToPrice(userId, projectName, context) {
  const { project: found, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return { error };
  if (isSampleProject(found)) return { error: sampleProposalRefusal(found) };
  const project = await loadWhole(userId, found);
  if (!project) return { error: "That project could not be loaded." };
  if (isSampleProject(project)) return { error: sampleProposalRefusal(project) };
  const access = await accessFor(userId, project);
  if (!access.canSeeRates) {
    return { error: `The user cannot see rates on "${project.name}", so no rates can be set on it. Say so plainly.` };
  }
  if (!access.canEdit) {
    return { error: `The user has view-only access to "${project.name}", so rates cannot be applied to it. Say so plainly.` };
  }
  return { project, note };
}

function splitWords(split) {
  return `${split.material}% material, ${split.labour}% labour, ${split.overheadProfit}% overhead and profit`;
}

const CONFIRM_RULE =
  "A confirm card listing every line, each with a tick box, is shown under your reply. NOTHING has been priced. " +
  "Tell the user to untick any line they disagree with and press Apply. Never say the rates are applied or saved.";

/**
 * Every window or door on a project priced from its size at a stated rate per m².
 *
 * @param {{category: string, ratePerM2: number, split?: object}} input
 * @returns {Promise<string | {text: string, card: object}>}
 */
export async function getAreaPricingProposal(userId, projectName, input = {}, context = {}) {
  const { project, note, error } = await projectToPrice(userId, projectName, context);
  if (error) return error;

  const p = buildAreaProposal(project.items, input);
  if (!p.ok) return `${p.error} Ask the user to restate it.`;
  const noun = p.category === "windows" ? "window" : "door";

  if (!p.lines.length) {
    const why = [];
    if (p.skipped.noSize) why.push(`${p.skipped.noSize} ${noun} line(s) carry no width × height in their description`);
    if (p.skipped.noQty) why.push(`${p.skipped.noQty} have no quantity`);
    if (p.skipped.noCode) why.push(`${p.skipped.noCode} have no bill code`);
    return [
      `No ${noun} lines on "${project.name}" could be priced by area.`,
      why.length
        ? `${why.join("; ")}.`
        : `The bill has no line that starts with "${noun}" and carries a size like (1200×1500).`,
      "Say so plainly. Do NOT work out figures yourself.",
    ].join("\n");
  }

  const lines = [];
  lines.push(
    `Proposal for "${project.name}" (${productLabel(project.productKey)}): ${p.lines.length} ${noun} line(s) at ${naira(p.ratePerM2)} per m², split ${splitWords(p.split)}. Applying all of them would put ${naira(p.totalToAdd)} on the bill for these lines.`,
  );
  if (p.repricedCount) {
    lines.push(`${p.repricedCount} of them already have a rate; applying replaces it. Point this out.`);
  }
  if (p.skipped.aggregate) {
    lines.push(`${p.skipped.aggregate} total line(s) (total area / perimeter) were left alone, as they should be.`);
  }
  if (p.skipped.noSize) lines.push(`${p.skipped.noSize} ${noun} line(s) had no size in the description and are not on the card.`);
  if (p.skipped.noQty) lines.push(`${p.skipped.noQty} ${noun} line(s) have no quantity and are not on the card.`);
  if (p.skipped.noCode) lines.push(`${p.skipped.noCode} ${noun} line(s) have no bill code and must be priced on the line.`);
  lines.push("");
  lines.push("By size (largest first):");
  for (const g of p.groups.slice(0, 15)) {
    lines.push(
      `- ${g.sizeLabel} mm = ${g.areaM2} m² → ${naira(g.rate)} each; ${g.count} line(s), ${fmtQty(g.qty)} in all, ${naira(g.amount)}.`,
    );
  }
  lines.push("");
  lines.push(CONFIRM_RULE);
  if (note) lines.push(note);

  return {
    text: lines.join("\n"),
    card: {
      type: "price-proposal",
      mode: "user-rate",
      basis: "area",
      cardKey: `area-${p.category}`,
      label: `Apply ${p.lines.length} rate${p.lines.length === 1 ? "" : "s"}`,
      project: cardProject(project),
      category: p.category,
      ratePerM2: p.ratePerM2,
      split: p.split,
      lines: p.lines,
      groups: p.groups,
      totalToAdd: p.totalToAdd,
      repricedCount: p.repricedCount,
      skipped: p.skipped,
    },
  };
}

/**
 * A stated rate on the bill lines a message names (description words, codes or
 * line numbers).
 *
 * @param {{match: object, rate: number, unit?: string, split?: object}} input
 * @returns {Promise<string | {text: string, card: object}>}
 */
export async function getSetRatesProposal(userId, projectName, input = {}, context = {}) {
  const { project, note, error } = await projectToPrice(userId, projectName, context);
  if (error) return error;

  const p = buildSetRatesProposal(project.items, input);
  if (!p.ok) return `${p.error} Ask the user to restate it.`;

  const m = input?.match || {};
  const asked = [
    m.text ? `"${String(m.text).slice(0, 80)}"` : "",
    m.code ? `code ${[].concat(m.code).join(", ")}` : "",
    m.sn ? `line ${[].concat(m.sn).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  if (!p.lines.length) {
    const out = [];
    if (!p.matchedCount) {
      out.push(`No bill line on "${project.name}" matches ${asked || "that"}.`);
      out.push("Ask how the item is worded on their bill, or look it up with get_project_bill and a search.");
    } else {
      out.push(`${p.matchedCount} line(s) on "${project.name}" match ${asked}, but none can take this rate.`);
      if (p.skipped.wrongUnit.length) {
        const units = [...new Set(p.skipped.wrongUnit.map((w) => w.unit || "no unit"))].join(", ");
        out.push(
          `${p.skipped.wrongUnit.length} are measured in ${units}, not ${p.unit}. Do NOT convert; ask the user for a rate in that unit.`,
        );
      }
      if (p.skipped.noQty) out.push(`${p.skipped.noQty} have no quantity.`);
      if (p.skipped.noCode) out.push(`${p.skipped.noCode} have no bill code and must be priced on the line.`);
    }
    return out.join("\n");
  }

  const lines = [];
  lines.push(
    `Proposal for "${project.name}" (${productLabel(project.productKey)}): ${naira(p.rate)}${p.unit ? ` per ${p.unit}` : ""} on ${p.lines.length} line(s) matching ${asked}, split ${splitWords(p.split)}. Applying all of them would put ${naira(p.totalToAdd)} on the bill for these lines.`,
  );
  if (p.repricedCount) lines.push(`${p.repricedCount} of them already have a rate; applying replaces it. Point this out.`);
  if (p.skipped.wrongUnit.length) {
    lines.push(
      `${p.skipped.wrongUnit.length} matching line(s) are in another unit (${p.skipped.wrongUnit
        .slice(0, 5)
        .map((w) => `${w.code}: ${w.unit || "no unit"}`)
        .join(", ")}) and are NOT on the card. Do not convert.`,
    );
  }
  if (p.skipped.noQty) lines.push(`${p.skipped.noQty} matching line(s) have no quantity and are not on the card.`);
  if (p.lines.length > 1) {
    lines.push("Check with the user that every line on the card is one they meant: a description match can catch more than intended.");
  }
  lines.push("");
  lines.push("On the card (first 12):");
  for (const l of p.lines.slice(0, 12)) {
    lines.push(
      `- ${l.code}: ${l.description.slice(0, 80)} — ${fmtQty(l.qty)} ${l.unit} × ${naira(l.userRate)} = ${naira(l.amount)}${l.currentRate ? ` (now ${naira(l.currentRate)})` : ""}.`,
    );
  }
  lines.push("");
  lines.push(CONFIRM_RULE);
  if (note) lines.push(note);

  return {
    text: lines.join("\n"),
    card: {
      type: "price-proposal",
      mode: "user-rate",
      basis: "rate",
      cardKey: `rate-${p.rate}-${p.unit}-${p.lines.map((l) => l.code).join(",")}`.slice(0, 160),
      label: `Apply ${p.lines.length} rate${p.lines.length === 1 ? "" : "s"}`,
      project: cardProject(project),
      rate: p.rate,
      unit: p.unit,
      split: p.split,
      lines: p.lines,
      totalToAdd: p.totalToAdd,
      repricedCount: p.repricedCount,
      skipped: { wrongUnit: p.skipped.wrongUnit.length, noQty: p.skipped.noQty, noCode: p.skipped.noCode },
    },
  };
}

/**
 * What moved on one project between two dates (YYYY-MM-DD, Lagos days).
 *
 * @returns {Promise<string | {text: string, card: object}>}
 */
export async function getProjectPeriodReport(userId, projectName, from, to, context = {}) {
  const range = parseReportRange(from, to);
  if (range.error) {
    return `${range.error} Work the dates out again from today's date and call the tool with YYYY-MM-DD.`;
  }
  if (!range.from && !range.to) return "Ask the user which dates the report should cover.";

  const { project: found, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;
  // Period reports are for the user's own projects only, never a sample.
  if (isSampleProject(found)) return samplePeriodReportRefusal(found);
  const project = await loadWhole(userId, found);
  if (!project) return "That project could not be loaded.";
  if (isSampleProject(project)) return samplePeriodReportRefusal(project);
  const access = await accessFor(userId, project);

  const where = { projectId: project._id, createdAt: {} };
  if (range.from) where.createdAt.$gte = range.from;
  if (range.to) where.createdAt.$lte = range.to;
  const activity = await ActivityLog.find(where, {
    createdAt: 1,
    summary: 1,
    category: 1,
    actorName: 1,
  })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const s = buildPeriodSummary(project, {
    from: range.from,
    to: range.to,
    activity,
    canSeeMoney: access.canSeeRates,
  });
  const span = `${range.fromDay || "the start"} to ${range.toDay}`;
  const card = {
    type: "project-report",
    label: "Open the report",
    project: cardProject(project),
    from: range.fromDay,
    to: range.toDay,
    summary: {
      valued: s.progress.net,
      completedLines: s.progress.completedLines,
      certified: s.certificates.certified,
      certificates: s.certificates.list.length,
      bought: s.procurement.value,
      variationsRaised: s.variations.raised,
      activity: s.activity.total,
      quiet: s.quiet,
      moneyMasked: s.moneyMasked,
    },
  };

  if (s.quiet) {
    return {
      text: `Nothing was recorded on "${project.name}" between ${span} (Lagos time): no progress, certificates, variations, purchases, programme changes or activity. Say so plainly — a quiet period is a finding, not an error. The card under your reply still opens the full report.${note ? `\n${note}` : ""}`,
      card,
    };
  }

  const L = [];
  L.push(`Report for "${project.name}" (${productLabel(project.productKey)}), ${span} (Lagos days):`);
  L.push(
    `- Progress: ${s.progress.events} valuation tick(s) on ${s.progress.linesMoved} line(s), net ${naira(s.progress.net)} of work valued (${naira(s.progress.valued)} forward, ${naira(s.progress.reversed)} wound back). ${s.progress.completedLines} line(s) signed off complete, worth ${naira(s.progress.completedValue)}.`,
  );
  if (s.actuals.lines) {
    L.push(
      `- Actual cost recorded on ${s.actuals.lines} line(s): planned ${naira(s.actuals.planned)}, actual ${naira(s.actuals.actual)}, variance ${naira(s.actuals.variance)}${s.actuals.variance > 0 ? " (OVER budget)" : ""}.`,
    );
    for (const r of s.actuals.top.slice(0, 5)) {
      L.push(
        `  - ${r.code ? `${r.code} ` : ""}${r.description.slice(0, 70)}: planned ${naira(r.planned)}, actual ${naira(r.actual)}`,
      );
    }
  }
  if (s.certificates.list.length) {
    const certs = s.certificates.list
      .map((c) => `No. ${c.number} (${fmtDate(c.date)}, ${c.status}, this certificate ${naira(c.thisCertificate)})`)
      .join("; ");
    L.push(
      `- Certificates: ${certs}. Certified in period (approved or paid): ${naira(s.certificates.certified)}; paid: ${naira(s.certificates.paid)}.`,
    );
  } else {
    L.push("- No certificate was issued in this period.");
  }
  L.push(
    `- Variations: ${s.variations.raised} raised (${naira(s.variations.raisedValue)}), ${s.variations.approved} approved (${naira(s.variations.approvedValue)}), ${s.variations.rejected} rejected.`,
  );
  L.push(
    `- Procurement: ${s.procurement.lines} budget line(s) marked bought, worth ${naira(s.procurement.value)}.`,
  );
  const late = s.programme.dueNotDoneNames.length ? ` (${s.programme.dueNotDoneNames.join(", ")})` : "";
  L.push(
    `- Programme: ${s.programme.finished} task(s) finished; ${s.programme.dueNotDone} due in the period but not finished${late}; ${s.programme.risksRaised} risk(s) raised; ${s.programme.issuesOpened} issue(s) opened, ${s.programme.issuesResolved} resolved.`,
  );
  if (s.activity.total) {
    L.push(`- Activity log: ${s.activity.total} entr${s.activity.total === 1 ? "y" : "ies"}. Most recent:`);
    for (const a of s.activity.recent.slice(0, 6)) {
      L.push(`  - ${fmtDate(a.at)}: ${a.summary}${a.by ? ` (${a.by})` : ""}`);
    }
  }
  if (s.moneyMasked) {
    L.push("Money is hidden: the user cannot see rates on this project. Do not quote amounts.");
  }
  L.push("");
  L.push(
    "Quote these figures exactly. Lead with the two or three that matter most (value done, certified, overspend or slippage), flag any risk, and suggest one next step. A card under your reply opens the full Project report for this range as a PDF.",
  );
  if (note) L.push(note);
  return { text: L.join("\n"), card };
}

/**
 * The live tips for one project — the same rules as the strip on the
 * work-project tabs (util/projectTips.js mirrors the client's).
 */
export async function getProjectTipsForAgent(userId, projectName, context = {}, { now = new Date() } = {}) {
  const { project: found, error, note } = await resolveProject(userId, projectName, context, { allowSample: true });
  if (error) return error;
  const project = await loadWhole(userId, found);
  if (!project) return "That project could not be loaded.";
  const access = await accessFor(userId, project);
  const tips = projectTips(
    { ...project, _ratesMasked: !access.canSeeRates },
    { now, canEdit: access.canEdit },
  );
  if (!tips.length) {
    return labelled(project, `Nothing stands out on "${project.name}": the bill is priced, and nothing on the programme or the money needs attention. Say so, and offer a report for the last month.${note ? `\n${note}` : ""}`);
  }
  const TAB_NAMES = { pm: "PM dashboard", rates: "Rates & budget", valuations: "Valuations", bill: "Bill" };
  const L = [`What to do next on "${project.name}", most urgent first:`];
  for (const t of tips) {
    let how = "";
    // A sample is never priced: no offer of the pricing tool on one.
    if (t.id === "unpriced" && !isSampleProject(project)) how = " (you can run propose_project_pricing for this)";
    else if (t.action?.kind === "tab") how = ` (on the project's ${TAB_NAMES[t.action.tab] || t.action.tab} tab)`;
    L.push(`- ${t.title}. ${t.body}${how}`);
  }
  L.push("");
  L.push("Give the top one or two in plain words and offer to do the first. Do not list all of them unless asked.");
  if (note) L.push(note);
  return labelled(project, L.join("\n"));
}
