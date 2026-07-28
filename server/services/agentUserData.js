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

// ── Project resolution ─────────────────────────────────────────────────────
// Fuzzy-find ONE of the user's own projects by name. Returns either
// { project } (loaded, owner-scoped) or { error } — a sentence Ada can relay.
// Shared by every project-scoped tool so they all disambiguate identically.
async function resolveProject(userId, projectName) {
  const uid = oid(userId);
  const query = String(projectName || "").trim();
  if (!query) return { error: "Ask the user which project they mean (by name)." };

  const candidates = await TakeoffProject.find(
    { userId: uid },
    { name: 1, productKey: 1, updatedAt: 1, pmTrackerOnly: 1 },
  )
    .sort({ updatedAt: -1 })
    .lean();

  if (!candidates.length) return { error: "The user has no projects yet." };

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

  // 0.5, not 0.3: at 0.3 a single shared filler word was enough for "zzz
  // nonexistent project" to resolve to "Project Takeoff" and answer with a
  // real project's figures. Better to ask than to quote the wrong bill.
  if (!best || bestScore < 0.5) {
    const names = candidates.slice(0, 12).map((c) => c.name).join(", ");
    return {
      error: `No project clearly matches "${query}". The user's projects are: ${names}. Ask them which one they mean — do NOT answer with figures from a guessed project.`,
    };
  }

  const project = await TakeoffProject.findOne({ _id: best._id, userId: uid }).lean();
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

// ── Single project detail ──────────────────────────────────────────────────
// Summarise one project's value, progress and schedule.
export async function getProjectDetails(userId, projectName) {
  const { project, error, note } = await resolveProject(userId, projectName);
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
  return lines.join("\n");
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
function kindOf(row) {
  const k = String(row?.componentKind || "").trim().toLowerCase();
  if (k === "labour" || k === "labor") return "Labour";
  if (k === "material") return "Material";
  if (k === "plant") return "Plant";
  if (k === "consumable") return "Consumable";
  if (k === "equipment") return "Equipment";
  return "Other";
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
export async function getResourceQuantity(userId, resource, projectName) {
  const query = String(resource || "").trim();
  if (!query) {
    return "Ask the user which material, labour or resource they want the quantity for (e.g. cement, rebar, mason).";
  }

  let projects = [];
  let resolveNote = "";
  if (String(projectName || "").trim()) {
    const { project, error, note } = await resolveProject(userId, projectName);
    if (error) return error;
    projects = [project];
    resolveNote = note || "";
  } else {
    // origin "takeoff-derived" projects are auto-created "<name> - material"
    // twins of a takeoff — their lines are the SAME materials as the parent's.
    // Counting both would silently double every quantity, so the twins are
    // excluded from an all-projects total (naming one explicitly still works).
    projects = await TakeoffProject.find(
      {
        userId: oid(userId),
        pmTrackerOnly: { $ne: true },
        origin: { $ne: "takeoff-derived" },
      },
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
    return `No material, labour or bill line matching "${query}" was found in ${scope}. Say so plainly — do NOT estimate a quantity. Suggest they check the Budget (Material & Labour) tab, or that the resource may be named differently there (ask what wording their bill uses).`;
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
  return lines.join("\n");
}

// ── Budget (Material & Labour) breakdown ───────────────────────────────────
// The whole cost plan for one project: Material vs Labour vs Plant totals,
// procurement status, and the biggest resources by cost.
export async function getProjectBudget(userId, projectName) {
  const { project, error, note } = await resolveProject(userId, projectName);
  if (error) return error;

  const rows = budgetRows(project);
  if (!rows.length) {
    return `Project "${project.name}" has no Material & Labour breakdown yet. The breakdown is pushed by the desktop plugin when the project is saved (MEP projects don't send one). Tell the user plainly, and point them to the project's Budget tab.`;
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
  return lines.join("\n");
}

// ── Bill of Quantities lines ───────────────────────────────────────────────
// The measured work items themselves — qty, unit, rate, amount, % complete —
// optionally filtered to lines matching a search phrase.
export async function getProjectBill(userId, projectName, search) {
  const { project, error, note } = await resolveProject(userId, projectName);
  if (error) return error;

  const all = billRows(project);
  if (!all.length) {
    return `Project "${project.name}" has no bill lines yet.`;
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
    return `No bill line in "${project.name}" matches "${q}". Its ${all.length} lines are grouped under: ${cats.join(", ") || "(no categories)"}. Ask the user to rephrase — do NOT invent a line.`;
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
  return lines.join("\n");
}

// ── Bill lines shaped for the ADLM AI Service ──────────────────────────────
// The AI service (/api/ai/boq-check, /api/ai/outliers) takes
// [{ ref, description, unit, quantity, rate }]. This resolves the project the
// same way every other tool does and hands back the raw rows, so Ada's
// rate-check / error-scan tools run against the user's REAL bill rather than
// anything the model retyped. `search` narrows a big bill; `limit` keeps the
// request (and the AI service's per-call cost) bounded.
export async function getBillItemsForAi(userId, projectName, search, limit = 200, opts = {}) {
  const { project, error, note } = await resolveProject(userId, projectName);
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
