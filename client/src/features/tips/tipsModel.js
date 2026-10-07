// Live tips: what to do next on a project, worked out from the project itself.
//
// WHY RULES AND NOT A MODEL
//
// A tip shows on every visit to four tabs. Asking Claude for one each time
// would put a model call, and its cost, behind every page view, for answers
// that are arithmetic: a line with no rate is a line with no rate. So these are
// plain rules over fields the project already carries, and Ada reads the SAME
// rules through her project_tips tool (server/util/projectTips.js mirrors this
// file, and a server test runs both over the same fixtures so they cannot
// drift). When a tip wants judgement — which rate fits — its action hands the
// question to Ada, where the user asked for it.
//
// WHAT A TIP IS
//
//   { id, tone: "warn"|"info", rank, title, body, tabs: [...], editOnly,
//     action: { kind: "ada"|"tab", label, prompt?, tab? } }
//
// rank orders them (higher first). tabs says which work-project tabs it belongs
// on. editOnly tips ask somebody to change the project, so a view-only
// collaborator never sees them. A rate-masked viewer never sees a tip about
// money, because every rate they hold reads 0 and "38 lines have no rate"
// would be a lie told to the one person who cannot check it.
//
// Pure: no React, no storage, no clock unless one is passed.

const DAY_MS = 86400000;
/** Days without a progress update before a running job counts as stalled. */
export const STALL_DAYS = 14;
/** An actual this far over its planned cost is worth a word. */
export const OVERSPEND_RATIO = 1.1;

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const asTime = (v) => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The latest date anybody recorded progress on this job, or 0. */
export function lastProgressAt(project) {
  let latest = 0;
  for (const e of Array.isArray(project?.valuationEvents) ? project.valuationEvents : []) {
    latest = Math.max(latest, asTime(e?.markedAt));
  }
  for (const it of Array.isArray(project?.items) ? project.items : []) {
    latest = Math.max(latest, asTime(it?.percentCompleteUpdatedAt), asTime(it?.completedAt));
  }
  return latest;
}

/** Share of the bill's planned value that has been done, 0-100. */
export function progressPercent(items) {
  let planned = 0;
  let earned = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const amount = safeNum(it?.qty) * safeNum(it?.rate);
    const pct = it?.completed ? 100 : Math.min(100, Math.max(0, safeNum(it?.percentComplete)));
    planned += amount;
    earned += (amount * pct) / 100;
  }
  return planned > 0 ? (earned / planned) * 100 : 0;
}

/**
 * Every tip that applies, best first.
 *
 * @param {object} project      the project as the workspace holds it
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {string} [opts.tab]   only the tips that belong on this tab
 * @param {boolean}[opts.canEdit]  false drops the tips that ask for an edit
 * @returns {Array<object>}
 */
export function projectTips(project, { now = new Date(), tab = "", canEdit = true } = {}) {
  if (!project) return [];
  const items = Array.isArray(project.items) ? project.items : [];
  const masked = Boolean(project._ratesMasked);
  const nowMs = now instanceof Date ? now.getTime() : asTime(now) || Date.now();
  const locked = Boolean(project?.contract?.locked);
  const tasks = (Array.isArray(project?.projectManagement?.tasks)
    ? project.projectManagement.tasks
    : []
  ).filter((t) => !t?.isSummary);
  const tips = [];

  // ── Unpriced bill lines ──
  const unpriced = items.filter((it) => !(safeNum(it?.rate) > 0)).length;
  if (!masked && unpriced > 0) {
    tips.push({
      id: "unpriced",
      tone: "warn",
      // More of the bill unpriced, more urgent; never below a stall.
      rank: 82 + Math.round((unpriced / Math.max(1, items.length)) * 10),
      title: `${plural(unpriced, "line")} ${unpriced === 1 ? "has" : "have"} no rate`,
      body: "Price them from your RateGen rates. Ada can propose a rate for each one for you to check before anything is saved.",
      tabs: ["overview", "bill", "rates"],
      editOnly: true,
      action: {
        kind: "ada",
        label: "Ask Ada to price them",
        prompt: "Propose rates for the unpriced lines on this project.",
      },
    });
  }

  // ── Contract not locked ──
  // Only once there is a bill to lock. Ranked lower while lines are unpriced:
  // locking an unpriced bill locks in the gaps.
  if (items.length && !locked && !project?.finalAccount?.finalized) {
    tips.push({
      id: "contract-unlocked",
      tone: "info",
      rank: unpriced > 0 ? 40 : 70,
      title: "Contract not locked",
      body:
        unpriced > 0
          ? "Price the bill first, then lock it to start valuations."
          : "The bill is priced. Lock it to start valuations and certificates.",
      tabs: ["overview", "bill", "rates"],
      editOnly: true,
      action: { kind: "tab", tab: "valuations", label: "Go to Valuations" },
    });
  }

  // ── Stalled progress ──
  // A running job: locked, not finished, and nobody has recorded progress in
  // STALL_DAYS. The clock starts at the lock if nothing has been recorded yet.
  const pct = progressPercent(items);
  if (locked && pct < 100) {
    const since = lastProgressAt(project) || asTime(project?.contract?.lockedAt);
    const days = since ? Math.floor((nowMs - since) / DAY_MS) : 0;
    if (days >= STALL_DAYS) {
      tips.push({
        id: "stalled",
        tone: "warn",
        rank: 80,
        title: `No progress recorded in ${days} days`,
        body: "Update progress on the bill or the programme so valuations and the forecast stay true.",
        tabs: ["overview", "bill", "pm"],
        editOnly: false,
        action: { kind: "tab", tab: "pm", label: "Open the PM dashboard" },
      });
    }
  }

  // ── Overdue tasks ──
  const overdue = tasks.filter(
    (t) => asTime(t?.endDate) && asTime(t.endDate) < nowMs && safeNum(t?.percentComplete) < 100,
  ).length;
  if (overdue > 0) {
    tips.push({
      id: "overdue-tasks",
      tone: "warn",
      rank: 78,
      title: `${plural(overdue, "task")} ${overdue === 1 ? "is" : "are"} overdue`,
      body: "Their finish dates have passed and they are not complete. Update them or move the dates.",
      tabs: ["overview", "pm"],
      editOnly: false,
      action: { kind: "tab", tab: "pm", label: "See the programme" },
    });
  }

  // ── Overspend on recorded actuals ──
  if (!masked) {
    const over = items.filter((it) => {
      if (it?.actualRate == null && it?.actualQty == null) return false;
      const planned = safeNum(it?.qty) * safeNum(it?.rate);
      const aQty = it?.actualQty != null ? safeNum(it.actualQty) : safeNum(it?.qty);
      const aRate = it?.actualRate != null ? safeNum(it.actualRate) : safeNum(it?.rate);
      return planned > 0 && aQty * aRate > planned * OVERSPEND_RATIO;
    }).length;
    if (over > 0) {
      tips.push({
        id: "overspend",
        tone: "warn",
        rank: 85,
        title: `${plural(over, "line")} ${over === 1 ? "is" : "are"} over budget`,
        body: "Recorded actual cost is more than 10% above the planned cost. Check the rate or raise a variation.",
        tabs: ["overview", "bill", "rates", "pm"],
        editOnly: false,
        action: {
          kind: "ada",
          label: "Ask Ada why",
          prompt: "Which lines on this project are over budget, and by how much?",
        },
      });
    }
  }

  // ── Budget rows at zero price ──
  if (!masked) {
    const zero = (Array.isArray(project?.budgetItems) ? project.budgetItems : []).filter(
      (b) => safeNum(b?.qty) > 0 && !(safeNum(b?.rate) > 0),
    ).length;
    if (zero > 0) {
      tips.push({
        id: "budget-zero",
        tone: "info",
        rank: 50,
        title: `${plural(zero, "budget row")} ${zero === 1 ? "has" : "have"} no price`,
        body: "The material and labour behind those lines costs nothing yet, so the budget reads low.",
        tabs: ["rates"],
        editOnly: true,
        action: { kind: "tab", tab: "rates", label: "Open the budget" },
      });
    }
  }

  // ── No programme ──
  if (items.length && !tasks.length) {
    tips.push({
      id: "no-programme",
      tone: "info",
      rank: locked ? 75 : 45,
      title: "No programme yet",
      body: "Plan the work from the bill on the PM dashboard. It gives every material an order date.",
      tabs: ["overview", "pm"],
      editOnly: true,
      action: { kind: "tab", tab: "pm", label: "Plan from the bill" },
    });
  }

  return tips
    .filter((t) => canEdit || !t.editOnly)
    .filter((t) => !tab || t.tabs.includes(tab))
    .sort((a, b) => b.rank - a.rank);
}

// ── Dismissal ──────────────────────────────────────────────────────────────
// Remembered per project and per tip in this browser only. A tip that comes
// back after being dismissed is the fastest way to teach somebody to ignore
// the strip, so dismissed means gone for that project until the storage is
// cleared. Storage is injected so this stays testable, and every access is
// wrapped: private windows and blocked site data throw on read.

export const DISMISS_KEY = "adlm:tips:dismissed";

const keyFor = (projectId, tipId) => `${String(projectId || "-")}:${String(tipId || "")}`;

function readMap(storage) {
  try {
    const raw = storage?.getItem?.(DISMISS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

export function isDismissed(storage, projectId, tipId) {
  return Boolean(readMap(storage)[keyFor(projectId, tipId)]);
}

/** Records the dismissal. Returns false when storage refused it. */
export function dismissTip(storage, projectId, tipId, now = Date.now()) {
  try {
    const map = readMap(storage);
    map[keyFor(projectId, tipId)] = now;
    // Bounded: keep the newest 300 so the entry cannot grow forever.
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 300);
    storage.setItem(DISMISS_KEY, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch {
    return false;
  }
}

/** The first tip for this place that has not been dismissed, or null. */
export function firstOpenTip(tips, storage, projectId) {
  return (Array.isArray(tips) ? tips : []).find((t) => !isDismissed(storage, projectId, t.id)) || null;
}
