// server/services/agentUserData.js
// Read-only account data for the AI agent's authenticated tools. Every export
// takes the caller's OWN userId (resolved server-side from the Bearer token in
// routes/agent.js) and hard-scopes every query to it. The model never supplies
// a userId — it only ever passes a project name or nothing — so there is no way
// for Ada to read another user's projects, money, or subscriptions.

import mongoose from "mongoose";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { computePmDashboard, computeProjectScope } from "./pmCompute.js";
import { productLabel } from "./reportEngine.js";
import { similarityScore } from "../util/fuzzyMatch.js";

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
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
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
    { $match: { userId: uid, pmTrackerOnly: { $ne: true } } },
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
  for (const r of rows) {
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
  lines.push(`Combined project value (sum of BoQ qty×rate): ${naira(grandCost)}`);
  lines.push(`Value of work completed to date: ${naira(grandValued)}`);
  lines.push(`Outstanding (remaining) value: ${naira(grandCost - grandValued)}`);
  lines.push(`Overall delivery progress: ${overall.toFixed(1)}%`);
  lines.push("");
  lines.push("Breakdown by product:");
  for (const [key, g] of [...byProduct.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
    lines.push(
      `- ${productLabel(key)}: ${g.count} project(s), value ${naira(g.cost)}, done ${naira(g.valued)}`,
    );
  }
  lines.push("");
  lines.push(
    "Note: MEP-family and some materials projects can show ₦0 value when rates aren't on the bill lines. Figures match the Portfolio Dashboard.",
  );
  return lines.join("\n");
}

// ── Single project detail ──────────────────────────────────────────────────
// Fuzzy-find one of the user's OWN projects by name, then summarise its value,
// progress and schedule. Loads only that one document (scoped by userId).
export async function getProjectDetails(userId, projectName) {
  const uid = oid(userId);
  const query = String(projectName || "").trim();
  if (!query) return "Ask the user which project they mean (by name).";

  const candidates = await TakeoffProject.find(
    { userId: uid },
    { name: 1, productKey: 1, updatedAt: 1, pmTrackerOnly: 1 },
  )
    .sort({ updatedAt: -1 })
    .lean();

  if (!candidates.length) return "The user has no projects yet.";

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarityScore(query, c.name || "");
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // Also allow a direct case-insensitive substring hit to win outright.
  const sub = candidates.find((c) =>
    String(c.name || "").toLowerCase().includes(query.toLowerCase()),
  );
  if (sub && bestScore < 0.9) best = sub;

  if (!best || bestScore < 0.3) {
    const names = candidates.slice(0, 12).map((c) => c.name).join(", ");
    return `No project clearly matches "${query}". The user's projects are: ${names}. Ask them to pick one.`;
  }

  const project = await TakeoffProject.findOne({ _id: best._id, userId: uid }).lean();
  if (!project) return "That project could not be loaded.";

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
  return lines.join("\n");
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
    const counts = await TakeoffProject.aggregate([
      { $match: { userId: uid, pmTrackerOnly: { $ne: true } } },
      { $group: { _id: "$productKey", count: { $sum: 1 } } },
    ]);
    if (counts.length) {
      lines.push("");
      lines.push("Project usage (used of 30-slot base cap per product):");
      for (const c of counts.sort((a, b) => b.count - a.count)) {
        lines.push(`- ${productLabel(c._id)}: ${c.count} project(s)`);
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
