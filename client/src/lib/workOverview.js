// What the Work overview computes, kept out of the component so the
// arithmetic can be tested (S18/WH-03 to WH-08).
//
// The rule running through all of it: every row is derived from something this
// account actually stores. Where his prototype shows a state we do not record
// — a model version that changed quantities, a valuation "awaiting approval" —
// the row is left out rather than invented.

import { placeHref } from "./lastPlace.js";
import { isMoneyHidden } from "./projectGallery.js";
import { projectWorkspaceHref } from "./projectLinks.js";
import { toRow } from "../ds/lxCourses.js";

/** A calendar day in the user's zone, as YYYY-MM-DD. */
const WAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const watDay = (d) => {
  if (!d && d !== 0) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : WAT.format(t);
};

/**
 * Whether a programme task is late, due soon, or simply under way.
 *
 * Compared at WAT day granularity on purpose: a task that ends today is not
 * overdue at half past midnight, which is what a raw timestamp comparison
 * would say to somebody in Lagos.
 */
export function taskState(t, now = Date.now(), dueWithinDays = 14) {
  const end = watDay(t?.endDate);
  if (!end) return { late: false, dueSoon: false, label: "In progress" };
  const today = watDay(now);
  if (end < today) return { late: true, dueSoon: false, label: "Overdue" };
  if (String(t?.status) === "blocked") return { late: false, dueSoon: false, label: "Blocked" };
  const horizon = watDay(new Date(now).getTime() + dueWithinDays * 86400000);
  if (end <= horizon) return { late: false, dueSoon: true, label: "Due soon" };
  return { late: false, dueSoon: false, label: "In progress" };
}

/** Where a project opens, at a tab when the workspace has tabs. */
export function projectTabHref(p, tab) {
  const productKey = String(p?.productKey || "").toLowerCase();
  const key = p?.slug || p?.id || p?.projectId || "";
  // ArchiCAD and RateGen do not open in the tabbed workspace, so a tab would
  // be a link to a screen that does not exist.
  if (!tab || !key || productKey === "archicad" || productKey === "rategen") {
    return projectWorkspaceHref({ ...p, id: p?.id || p?.projectId });
  }
  return placeHref({ productKey, key, tab });
}

const nameOf = (p) => p?.name || "Untitled project";

/** How many kinds may crowd the list, so one noisy kind cannot fill it. */
const PER_KIND = { Pricing: 3, Stale: 2 };

// Most pressing first. Urgency wins, then the order a working day runs in.
const KIND_ORDER = ["Programme", "Valuation", "Variation", "Pricing", "Stale", "Install"];

/**
 * "Needs a decision": one row per thing that is genuinely waiting on a person.
 *
 * Two of the answers are complete and one is not, and the difference matters.
 * The rollup carries every project, so the pricing and stale rows below are all
 * of them. GET /me/work-overview caps each of its lists, so the rows we hold
 * for certificates, variations and tasks are only the most pressing few — the
 * route's `counts` says how many there really are, and the totals below quote
 * that rather than counting the rows on screen. Where the overview has not
 * arrived (still loading, or its call failed) `partial` says so, so the screen
 * can admit it does not know instead of reporting nothing to decide.
 *
 * The same is true of GET /me/summary, which is the only thing that knows
 * what is installed on this machine: when that call fails the install row
 * simply is not there, and the total was quietly a row short with nothing on
 * screen to say so. `summaryFailed` and `summaryPending` make it say so.
 *
 * @param {object}   p
 * @param {Array}    p.projects        the folded /me/projects-rollup list
 * @param {object}   p.overview        GET /me/work-overview, or null while it loads
 * @param {boolean}  p.overviewFailed  that call failed outright
 * @param {object}   p.summary         GET /me/summary, or null
 * @param {boolean}  p.summaryFailed   that call failed outright
 * @param {boolean}  p.summaryPending  it was asked for and has not answered yet
 * @param {number}   p.now
 * @param {number}   p.cap             how many rows are shown
 * @param {object}   p.products        productKey → product name, for the install row
 * @returns {{ rows: Array, total: number, urgent: number, partial: boolean,
 *   missing: { failed: string[], pending: string[] } }}
 */
export function buildDecisions({
  projects = [],
  overview = null,
  overviewFailed = false,
  summary = null,
  summaryFailed = false,
  summaryPending = false,
  now = Date.now(),
  cap = 8,
  products = {},
} = {}) {
  const all = [];

  // Pricing — measured work with no money against it. Never shown to a
  // read-only collaborator: they cannot price it, so it is not their decision.
  for (const [i, p] of projects.entries()) {
    const n = Number(p.unpricedCount) || 0;
    if (!n || p.accessLevel === "view") continue;
    all.push({
      id: `pricing:${p.id}:${i}`,
      kind: "Pricing",
      text: `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} a rate`,
      sort: -n,
      project: p,
      href: projectTabHref(p, "bill"),
      cta: "Price",
      urgent: false,
    });
  }

  // Valuation — a draft certificate. We store draft / approved / paid and no
  // "awaiting approval", so a draft is the honest "not yet decided".
  for (const [i, c] of (overview?.draftCertificates || []).entries()) {
    all.push({
      // Two projects can both be on IPC 1, and a project can hold two rows
      // for the same number after a re-issue, so the row's own place in the
      // list is part of its identity.
      id: `cert:${c.projectId}:${c.number}:${i}`,
      kind: "Valuation",
      text: `IPC ${c.number} is a draft, not yet approved`,
      sort: -new Date(c.date || 0).getTime(),
      project: c,
      href: projectTabHref(c, "valuation"),
      cta: "Open",
      urgent: false,
    });
  }

  // Variation — only ones explicitly marked pending. A variation with no
  // status is an old one, and old ones count as approved.
  for (const [i, v] of (overview?.pendingVariations || []).entries()) {
    const ref = v.reference || "Variation";
    const what = v.description ? `${ref}, ${v.description}` : ref;
    all.push({
      id: `var:${v.projectId}:${ref}:${i}`,
      kind: "Variation",
      text: `${what} is pending a decision`,
      sort: -new Date(v.issuedAt || 0).getTime(),
      project: v,
      href: projectTabHref(v, "valuation"),
      cta: "Decide",
      urgent: false,
    });
  }

  // Programme — a task past its end date, judged on the WAT calendar day.
  for (const [i, t] of (overview?.tasks || []).entries()) {
    if (!taskState(t, now).late) continue;
    all.push({
      id: `task:${t.projectId}:${t.task}:${i}`,
      kind: "Programme",
      text: `${t.task || "A task"} is past its end date`,
      sort: new Date(t.endDate || 0).getTime(),
      project: t,
      href: projectTabHref(t, "pm"),
      cta: "See task",
      urgent: true,
    });
  }

  // Ours, not his, and kept because they are real: a bill nothing has changed
  // in three months does not include anything drawn since.
  //
  // The date behind this row is updatedAt, which records the last CHANGE, not
  // the last visit — nothing we store knows when a project was merely opened —
  // so the row says what the field actually means.
  const OLD = 90 * 86400000;
  for (const [i, p] of projects.entries()) {
    if (!p.updatedAt) continue;
    const age = now - new Date(p.updatedAt).getTime();
    if (age <= OLD) continue;
    all.push({
      id: `stale:${p.id}:${i}`,
      kind: "Stale",
      text: `Last changed ${Math.round(age / 86400000)} days ago`,
      sort: -age,
      project: p,
      href: projectTabHref(p),
      cta: "Open",
      urgent: false,
    });
  }

  // Also ours: on the plan, but not installed on this machine.
  const installed = new Set(
    (summary?.installations || []).map((i) => i.installationProductKey).filter(Boolean),
  );
  const missing = (summary?.entitlements || [])
    .filter((e) => !e.isCourse && products[e.productKey] && !installed.has(e.productKey))
    .map((e) => products[e.productKey]);
  if (missing.length) {
    all.push({
      id: "install",
      kind: "Install",
      text: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} on the plan but not installed here`,
      sort: 0,
      project: null,
      href: "/manage/downloads",
      cta: "Install",
      urgent: false,
    });
  }

  const order = (r) => {
    const i = KIND_ORDER.indexOf(r.kind);
    return i < 0 ? KIND_ORDER.length : i;
  };
  all.sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) || order(a) - order(b) || (a.sort || 0) - (b.sort || 0),
  );

  // One kind must not fill the whole list: a 48-project account has dozens of
  // unpriced bills and would never see the one overdue task under them. So the
  // first pass takes at most a few of each kind, and a second pass fills any
  // room left over in the same order, rather than showing five rows on a
  // screen with space for eight.
  const seen = {};
  const rows = [];
  const spare = [];
  for (const r of all) {
    if (rows.length >= cap) {
      spare.push(r);
      continue;
    }
    const limit = PER_KIND[r.kind];
    seen[r.kind] = (seen[r.kind] || 0) + 1;
    if (limit && seen[r.kind] > limit) {
      spare.push(r);
      continue;
    }
    rows.push(r);
  }
  for (const r of spare) {
    if (rows.length >= cap) break;
    rows.push(r);
  }

  // How many there really are. Pricing, Stale and Install are counted from the
  // whole rollup, so those are complete; the other three come from a capped
  // list, so they are counted from the server's own tally and never from the
  // handful of rows that happened to come back. Whichever is larger wins, so a
  // response without counts still reports at least what is on screen.
  const counted = (kind) => all.filter((r) => r.kind === kind).length;
  const c = overview?.counts || {};
  const atLeast = (kind, n) => Math.max(counted(kind), Math.max(0, Number(n) || 0));
  const byKind = {
    Pricing: counted("Pricing"),
    Stale: counted("Stale"),
    Install: counted("Install"),
    Valuation: atLeast("Valuation", c.draftCertificates),
    Variation: atLeast("Variation", c.pendingVariations),
    Programme: atLeast("Programme", c.overdueTasks),
  };

  // What is not known, in the words the screen will use. Three of the six
  // kinds live on the overview and one lives on the summary; a total missing
  // either of them is a smaller number than the truth, and saying so is the
  // difference between "nothing to decide" and "we could not look".
  const failed = [];
  const pending = [];
  if (overviewFailed) failed.push(OVERVIEW_PART);
  else if (!overview) pending.push(OVERVIEW_PART);
  if (summaryFailed) failed.push(SUMMARY_PART);
  else if (summaryPending) pending.push(SUMMARY_PART);

  return {
    rows: rows.map((r) => ({ ...r, projectName: r.project ? nameOf(r.project) : "" })),
    total: Object.values(byKind).reduce((a, b) => a + b, 0),
    // Overdue programme work is the only urgent kind, so the tile and the
    // table agree by construction.
    urgent: byKind.Programme,
    partial: failed.length + pending.length > 0,
    missing: { failed, pending },
  };
}

/** What each call answers, named as a person would name it. */
const OVERVIEW_PART = "valuations, variations and the programme";
const SUMMARY_PART = "what is installed here";

/** "a", "a, and b", "a, b, and c". */
const sentence = (parts) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : parts[0];

/**
 * One line saying which part of "Needs a decision" is not known, ready for
 * his panel sub-line. Empty when the answer is complete.
 */
export function decisionsNote(missing) {
  const parts = [];
  if (missing?.failed?.length) parts.push(`${sentence(missing.failed)} could not be loaded`);
  if (missing?.pending?.length) parts.push(`still checking ${sentence(missing.pending)}`);
  if (!parts.length) return "";
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The lesson to go back to, picked exactly as My learning picks its hero:
 * whatever is furthest along but unfinished, and only a course not started
 * when nothing is in flight.
 */
export function pickNextLesson(courses) {
  const rows = (Array.isArray(courses) ? courses : []).map(toRow);
  const open = rows.filter((r) => r.next && !r.expired && !r.completed);
  const hero = open.filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct)[0] || open[0] || null;
  if (!hero) return null;
  return {
    sku: hero.sku,
    courseTitle: hero.title,
    moduleCode: hero.next.code || "",
    moduleTitle: hero.next.title || hero.next.code || "Next lesson",
    href: `/dash-course/${encodeURIComponent(hero.sku)}${
      hero.next.code ? `?m=${encodeURIComponent(hero.next.code)}` : ""
    }`,
  };
}

const toNumber = (v) => Number(v) || 0;

/**
 * What a project's work is worth, on the same cascade a certificate is built
 * from: measured work, provisional sums, preliminaries and approved
 * variations (the rollup's workValue).
 *
 * Certified value is never measured work alone, so dividing one by the other
 * compared two different things and read high on any job carrying prelims. A
 * row from an older response has no workValue at all; it falls back to
 * measured work, which is the figure that row does show. A row whose money is
 * hidden never reaches here — headline() leaves it out altogether.
 */
export const workValueOf = (p) =>
  toNumber(p?.workValue) > 0 ? toNumber(p.workValue) : toNumber(p?.totalCost);

/**
 * The headline figures, summed over the folded rollup.
 *
 * A project whose money is hidden is NOT summed. The rollup still sends its
 * measured work — only the figures this branch added are masked — but the row
 * says plainly that its money is withheld, and a total that quietly included
 * it would contradict the row it is built from. It is reported as `hidden`
 * instead, so the tile can say the total leaves it out; `counted` is how many
 * projects the money actually came from, so a portfolio where every project is
 * withheld shows an en dash rather than ₦0.
 *
 * The item counts are not money and are not masked, so they still cover every
 * project.
 */
export function headline(projects = []) {
  const counted = projects.filter((p) => !isMoneyHidden(p));
  const measured = counted.reduce((a, p) => a + toNumber(p.totalCost), 0);
  const value = counted.reduce((a, p) => a + workValueOf(p), 0);
  const certified = counted.reduce((a, p) => a + toNumber(p.certifiedToDate), 0);
  const priceable = projects.filter(
    (p) => p.accessLevel !== "view" && toNumber(p.unpricedCount) > 0,
  );
  return {
    count: projects.length,
    counted: counted.length,
    hidden: projects.length - counted.length,
    measured,
    value,
    certified,
    certifiedPct: value > 0 ? Math.max(0, Math.min(100, (certified / value) * 100)) : 0,
    unpriced: priceable.reduce((a, p) => a + toNumber(p.unpricedCount), 0),
    unpricedProjects: priceable.length,
  };
}
