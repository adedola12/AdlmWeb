// His Budget and Buy schedule views (work-proj.js:1209 and :1155), against the
// project's own budget.
//
// WHERE HIS FIXTURE AND OUR DATA PART
//
// He derives both from RateGen build-ups at read time: W.build(rate, loc) gives
// him material lines and gang lines, and he sums them across the bill. We do not
// derive a budget — we STORE one. budgetItems is the internal cost plan, one row
// per resource, each carrying its own componentKind (Material, Labour, Plant,
// Consumable, Equipment), its qty, unit and rate, its procurement marking and a
// buy-schedule slot. It is built by the Material & Labour engine, by a desktop
// plugin, or typed by the QS.
//
// So these functions group rather than compute, and three of his details change:
//
//  • Plant is its own column, not part of labour. That is a rule in this
//    codebase, not a preference: TakeoffProject's comment on resourceItems says
//    plant folded into budgetItems would be added to the single Labour row,
//    which is exactly the number a QS must not be shown.
//  • The procured tick is per row, against the row's own procured field. His is
//    a p.procured map keyed by material, which we have no equivalent of and do
//    not need.
//  • His waste percentage is applied at read time from the build-up. Ours is
//    already in the stored qty — a row's qty is what has to be bought.
//
// The buy-by arithmetic is NOT redone here. lib/buySchedule.js already owns it
// and is already tested: buy-by is the earliest linked task's start less the
// lead time, and a row whose bill line is in no task has no date at all rather
// than a guessed one.

import { buyByDate, buyScheduleGroups } from "../../lib/buySchedule.js";

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** The rate a budget row costs at: the built-up one, else the bare one. */
export const costRateOf = (row) => n(row?.budgetRate) || n(row?.rate);

/** What a budget row is worth. */
export const rowAmount = (row) => n(row?.qty) * costRateOf(row);

/**
 * Which of the three columns a row belongs in.
 *
 * componentKind comes from the plugin and the M&L engine. Consumable and
 * Equipment are materials in every sense that matters here — they are bought —
 * so they sit with materials rather than in a column of two rows.
 */
export function classOf(row) {
  const kind = String(row?.componentKind || "").trim().toLowerCase();
  if (kind === "labour" || kind === "labor") return "labour";
  if (kind === "plant") return "plant";
  if (kind === "material" || kind === "consumable" || kind === "equipment") return "material";
  // A row that says nothing about itself is a material: it has a qty and a unit
  // and somebody has to buy it. Calling it labour would put it in gang days.
  return "material";
}

const nameOf = (row) =>
  String(row?.materialName || row?.description || "").trim() || "Unnamed row";

/**
 * The section or bill line a budget row belongs to, or "" when saying it would
 * only repeat the row's own name.
 */
function forLabel(row, name) {
  const section = String(row?.category || "").trim();
  const line = String(row?.takeoffLine || "").trim();
  const pick = section || line;
  if (!pick) return "";
  return pick.toLowerCase() === String(name || "").trim().toLowerCase() ? "" : pick;
}

/**
 * His three columns, each sorted by value as he sorts them (work-proj.js:1226).
 *
 * Rows keep their index into budgetItems, because that is what a procurement
 * tick has to save against.
 */
export function budgetColumns(project) {
  const rows = Array.isArray(project?.budgetItems) ? project.budgetItems : [];
  const out = { material: [], labour: [], plant: [] };
  rows.forEach((row, index) => {
    out[classOf(row)].push({
      index,
      name: nameOf(row),
      unit: String(row?.unit || "").trim(),
      qty: n(row?.qty),
      amount: rowAmount(row),
      procured: row?.procured === true,
      procuredPercent: Math.max(0, Math.min(100, n(row?.procuredPercent))),
      // What this row is FOR. His is the bill line's own description
      // (work-proj.js:1169). We prefer the section over takeoffLine, because on
      // a real HERON bill takeoffLine often holds the bill description verbatim
      // and the row would then print the same long text twice — the section is
      // short and says something the material name does not.
      forLine: forLabel(row, nameOf(row)),
      supplier: String(row?.supplier || "").trim(),
      targetDate: row?.targetDate || null,
      billIdentity: String(row?.billIdentity || "").trim().toLowerCase(),
    });
  });
  for (const key of Object.keys(out)) out[key].sort((a, b) => b.amount - a.amount);
  return out;
}

const total = (list) => list.reduce((a, r) => a + r.amount, 0);

/**
 * The two donuts over his budget (work-proj.js:1236).
 *
 * His first is materials as a share of materials + labour. Ours adds plant to
 * the denominator, because leaving it out would make the share wrong rather than
 * simpler.
 */
export function budgetTotals(project) {
  const cols = budgetColumns(project);
  const material = total(cols.material);
  const labour = total(cols.labour);
  const plant = total(cols.plant);
  const all = material + labour + plant;
  // Only materials are bought, so only materials are counted as procured. A
  // part-bought row counts for its part: procuredPercent is how this codebase
  // already records "half of it has been ordered".
  const bought = cols.material.reduce(
    (a, r) => a + r.amount * (r.procured ? 1 : r.procuredPercent / 100),
    0,
  );
  return {
    material,
    labour,
    plant,
    all,
    bought,
    materialShare: all ? (material / all) * 100 : 0,
    procuredShare: material ? (bought / material) * 100 : 0,
    counts: {
      material: cols.material.length,
      labour: cols.labour.length,
      plant: cols.plant.length,
    },
  };
}

/**
 * Earliest task start per bill line, from the PM dashboard.
 *
 * The identity on a task reads "<something>::<code>"; ProjectBudgetTab splits on
 * "::" and keeps the second half, and this has to match it exactly or a row that
 * IS scheduled would show as unscheduled.
 */
export function taskStartsByLine(tasks) {
  const map = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const start = t?.startDate ? new Date(t.startDate) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    for (const ident of t?.linkedBoqIdentities || []) {
      const code = String(String(ident).split("::")[1] || "").trim().toLowerCase();
      if (!code) continue;
      const cur = map.get(code);
      if (!cur || start < cur.start) {
        map.set(code, { start, name: String(t?.name || "").trim() });
      }
    }
  }
  return map;
}

/**
 * His buy schedule: every material row, when it has to be bought, soonest first.
 *
 * Labour and plant are not here — neither is bought from a supplier against a
 * lead time, and a gang in a purchase list is how somebody orders a bricklayer.
 */
export function buyRows(project, { leadDays = 14, tasks } = {}) {
  const pm = project?.pm || project?.projectManagement || {};
  const byLine = taskStartsByLine(tasks || pm.tasks);
  const rows = budgetColumns(project).material.map((r) => {
    const task = r.billIdentity ? byLine.get(r.billIdentity) || null : null;
    const needBy = task ? task.start : null;
    return {
      ...r,
      taskName: task?.name || "",
      needBy,
      buyBy: buyByDate(needBy, leadDays),
      done: r.procured || r.procuredPercent >= 100,
    };
  });
  rows.sort((a, b) => {
    if (a.buyBy && b.buyBy) return a.buyBy - b.buyBy;
    if (a.buyBy) return -1;
    if (b.buyBy) return 1;
    return b.amount - a.amount;
  });
  return rows;
}

/** lib/buySchedule's three groups, for the KPI row above the list. */
export const buyKpis = (rows, now = new Date()) => buyScheduleGroups(rows, now);

/** A patch marking one budget row bought or not, for saveProject. */
export function withRowProcured(project, index, procured) {
  const rows = Array.isArray(project?.budgetItems) ? project.budgetItems : [];
  if (index < 0 || index >= rows.length) return null;
  return {
    budgetItems: rows.map((row, i) =>
      i === index
        ? {
            ...row,
            procured: Boolean(procured),
            // Keep the two consistent: a row ticked bought is 100% bought, and
            // un-ticking one that was only part-ordered must not leave 100
            // behind and read as bought on every other screen.
            procuredPercent: procured ? 100 : 0,
          }
        : row,
    ),
  };
}
