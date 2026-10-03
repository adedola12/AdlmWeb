import { describe, it, expect } from "vitest";
import {
  projectTips,
  productPageTip,
  lastProgressAt,
  progressPercent,
  isDismissed,
  dismissTip,
  firstOpenTip,
  DISMISS_KEY,
  STALL_DAYS,
} from "./tipsModel.js";

// The live tips on the work-project tabs. Rule-based on purpose: a model call
// per page view would cost money for answers that are arithmetic.

const NOW = new Date("2026-10-03T09:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const project = (over = {}) => ({
  _id: "p1",
  items: [
    { code: "A1", qty: 10, rate: 1000, percentComplete: 50, percentCompleteUpdatedAt: daysAgo(2) },
    { code: "A2", qty: 5, rate: 0 },
    { code: "A3", qty: 5, rate: 0 },
  ],
  budgetItems: [],
  contract: { locked: false },
  projectManagement: { tasks: [] },
  ...over,
});

const ids = (tips) => tips.map((t) => t.id);

describe("projectTips", () => {
  it("counts unpriced lines and hands pricing to Ada with a prompt", () => {
    const tips = projectTips(project(), { now: NOW });
    const t = tips.find((x) => x.id === "unpriced");
    expect(t.title).toBe("2 lines have no rate");
    expect(t.action.kind).toBe("ada");
    expect(t.action.prompt).toMatch(/unpriced lines/);
    // Unpriced outranks everything else here.
    expect(tips[0].id).toBe("unpriced");
  });

  it("says one line in the singular", () => {
    const p = project({ items: [{ code: "A", qty: 1, rate: 0 }] });
    expect(projectTips(p, { now: NOW })[0].title).toBe("1 line has no rate");
  });

  it("never tells a rate-masked viewer about money", () => {
    const p = project({
      _ratesMasked: true,
      budgetItems: [{ qty: 4, rate: 0 }],
      items: [{ code: "A", qty: 1, rate: 0, actualRate: 9 }],
    });
    const got = ids(projectTips(p, { now: NOW }));
    expect(got).not.toContain("unpriced");
    expect(got).not.toContain("budget-zero");
    expect(got).not.toContain("overspend");
  });

  it("ranks the lock tip higher once the bill is fully priced", () => {
    const priced = project({ items: [{ code: "A", qty: 1, rate: 10 }] });
    const unpriced = project();
    const lockOf = (p) => projectTips(p, { now: NOW }).find((t) => t.id === "contract-unlocked");
    expect(lockOf(priced).rank).toBeGreaterThan(lockOf(unpriced).rank);
    expect(lockOf(priced).action).toEqual({ kind: "tab", tab: "valuations", label: "Go to Valuations" });
  });

  it("flags a locked job with no progress for STALL_DAYS", () => {
    const p = project({
      contract: { locked: true, lockedAt: daysAgo(40) },
      items: [{ code: "A", qty: 1, rate: 10, percentComplete: 20, percentCompleteUpdatedAt: daysAgo(STALL_DAYS + 3) }],
    });
    const t = projectTips(p, { now: NOW }).find((x) => x.id === "stalled");
    expect(t.title).toBe(`No progress recorded in ${STALL_DAYS + 3} days`);
  });

  it("does not call a finished or freshly updated job stalled", () => {
    const fresh = project({
      contract: { locked: true, lockedAt: daysAgo(40) },
      items: [{ code: "A", qty: 1, rate: 10, percentComplete: 20, percentCompleteUpdatedAt: daysAgo(3) }],
    });
    const done = project({
      contract: { locked: true, lockedAt: daysAgo(40) },
      items: [{ code: "A", qty: 1, rate: 10, completed: true, completedAt: daysAgo(30) }],
    });
    expect(ids(projectTips(fresh, { now: NOW }))).not.toContain("stalled");
    expect(ids(projectTips(done, { now: NOW }))).not.toContain("stalled");
  });

  it("counts overdue tasks, ignoring summaries and finished ones", () => {
    const p = project({
      projectManagement: {
        tasks: [
          { name: "a", endDate: daysAgo(3), percentComplete: 40 },
          { name: "b", endDate: daysAgo(3), percentComplete: 100 },
          { name: "c", endDate: daysAgo(3), percentComplete: 0, isSummary: true },
          { name: "d", endDate: daysAgo(-3), percentComplete: 0 },
        ],
      },
    });
    expect(projectTips(p, { now: NOW }).find((t) => t.id === "overdue-tasks").title).toBe(
      "1 task is overdue",
    );
    expect(ids(projectTips(p, { now: NOW }))).not.toContain("no-programme");
  });

  it("flags recorded actuals more than 10% over planned", () => {
    const p = project({
      items: [
        { code: "A", qty: 10, rate: 100, actualRate: 115 },
        { code: "B", qty: 10, rate: 100, actualRate: 105 },
      ],
    });
    expect(projectTips(p, { now: NOW }).find((t) => t.id === "overspend").title).toBe(
      "1 line is over budget",
    );
  });

  it("flags budget rows with a quantity and no price", () => {
    const p = project({ budgetItems: [{ qty: 3, rate: 0 }, { qty: 0, rate: 0 }, { qty: 1, rate: 5 }] });
    expect(projectTips(p, { now: NOW }).find((t) => t.id === "budget-zero").title).toBe(
      "1 budget row has no price",
    );
  });

  it("filters to a tab and drops edit tips for a view-only user", () => {
    const pmOnly = projectTips(project(), { now: NOW, tab: "pm" });
    expect(ids(pmOnly)).toEqual(["no-programme"]);
    const viewOnly = projectTips(project(), { now: NOW, canEdit: false });
    expect(viewOnly.every((t) => !t.editOnly)).toBe(true);
  });

  it("returns nothing for no project and is quiet on a tidy one", () => {
    expect(projectTips(null)).toEqual([]);
    const tidy = project({
      contract: { locked: true, lockedAt: daysAgo(3) },
      items: [{ code: "A", qty: 1, rate: 10, percentComplete: 10, percentCompleteUpdatedAt: daysAgo(1) }],
      projectManagement: { tasks: [{ name: "t", endDate: daysAgo(-5), percentComplete: 10 }] },
    });
    expect(projectTips(tidy, { now: NOW })).toEqual([]);
  });
});

describe("helpers", () => {
  it("lastProgressAt takes the newest of events, % updates and completions", () => {
    const p = {
      valuationEvents: [{ markedAt: "2026-09-01T00:00:00Z" }],
      items: [{ completedAt: "2026-09-05T00:00:00Z" }, { percentCompleteUpdatedAt: "2026-09-03T00:00:00Z" }],
    };
    expect(new Date(lastProgressAt(p)).toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(lastProgressAt({})).toBe(0);
  });

  it("progressPercent weights by value", () => {
    expect(progressPercent([{ qty: 1, rate: 100, percentComplete: 50 }, { qty: 1, rate: 300, completed: true }])).toBe(87.5);
    expect(progressPercent([])).toBe(0);
  });

  it("productPageTip only speaks to somebody who owns the product", () => {
    expect(productPageTip("rategen", { signedIn: false, owns: true })).toBeNull();
    expect(productPageTip("rategen", { signedIn: true, owns: false })).toBeNull();
    expect(productPageTip("rategen", { signedIn: true, owns: true }).action.kind).toBe("ada");
  });
});

describe("dismissal", () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  };

  it("remembers per project and per tip", () => {
    const s = memory();
    expect(dismissTip(s, "p1", "unpriced")).toBe(true);
    expect(isDismissed(s, "p1", "unpriced")).toBe(true);
    expect(isDismissed(s, "p2", "unpriced")).toBe(false);
    expect(isDismissed(s, "p1", "stalled")).toBe(false);
  });

  it("survives storage that throws or holds rubbish", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(isDismissed(throwing, "p1", "x")).toBe(false);
    expect(dismissTip(throwing, "p1", "x")).toBe(false);
    const junk = { getItem: () => "{not json", setItem: () => {} };
    expect(isDismissed(junk, "p1", "x")).toBe(false);
    expect(isDismissed(undefined, "p1", "x")).toBe(false);
  });

  it("firstOpenTip skips the dismissed ones", () => {
    const s = memory();
    const tips = projectTips(project(), { now: NOW });
    dismissTip(s, "p1", tips[0].id);
    expect(firstOpenTip(tips, s, "p1").id).toBe(tips[1].id);
    expect(JSON.parse(s.getItem(DISMISS_KEY))).toHaveProperty(`p1:${tips[0].id}`);
  });
});
