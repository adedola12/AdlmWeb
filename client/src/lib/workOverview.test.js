import { describe, it, expect } from "vitest";
import { buildDecisions, headline, pickNextLesson, projectTabHref, taskState, watDay } from "./workOverview.js";

// 22 Sep 2026, 10:00 WAT.
const NOW = new Date("2026-09-22T09:00:00Z").getTime();
const days = (n) => new Date(NOW + n * 86400000).toISOString();

describe("programme dates are judged on the WAT calendar day", () => {
  it("reads a UTC instant as the Lagos day it falls on", () => {
    // 23:30 UTC on the 21st is already 00:30 on the 22nd in Lagos.
    expect(watDay("2026-09-21T23:30:00Z")).toBe("2026-09-22");
  });

  it("does not call a task ending today overdue just after midnight", () => {
    const justAfterMidnight = new Date("2026-09-21T23:30:00Z").getTime();
    expect(taskState({ endDate: "2026-09-22T00:00:00Z" }, justAfterMidnight).label).toBe("Due soon");
  });

  it("calls yesterday overdue, a fortnight out due soon, and beyond it under way", () => {
    expect(taskState({ endDate: days(-1) }, NOW).late).toBe(true);
    expect(taskState({ endDate: days(7) }, NOW).label).toBe("Due soon");
    expect(taskState({ endDate: days(40) }, NOW).label).toBe("In progress");
  });

  it("says blocked when that is what the task really is", () => {
    expect(taskState({ endDate: days(3), status: "blocked" }, NOW).label).toBe("Blocked");
  });

  it("has no opinion about a task with no end date", () => {
    expect(taskState({}, NOW)).toEqual({ late: false, dueSoon: false, label: "In progress" });
  });
});

describe("where a decision opens", () => {
  it("opens the tabbed workspace at the tab that resolves it", () => {
    expect(projectTabHref({ productKey: "revit", slug: "block-a" }, "valuation")).toBe(
      "/projects/revit?project=block-a&tab=valuation",
    );
  });

  it("sends ArchiCAD to its own screen rather than a tab it does not have", () => {
    expect(projectTabHref({ productKey: "archicad", slug: "villa" }, "pm")).toBe("/archicad/villa/boq");
  });
});

describe("needs a decision", () => {
  const project = (extra) => ({
    id: "p1",
    name: "MOREMI ESTATE BLOCK A",
    slug: "moremi",
    productKey: "planswift",
    accessLevel: "owner",
    updatedAt: days(-2),
    unpricedCount: 0,
    ...extra,
  });

  it("asks for a rate only where the person can actually set one", () => {
    const mine = buildDecisions({ projects: [project({ unpricedCount: 4 })], now: NOW });
    expect(mine.rows[0].kind).toBe("Pricing");
    expect(mine.rows[0].text).toBe("4 items need a rate");
    expect(mine.rows[0].cta).toBe("Price");

    const theirs = buildDecisions({
      projects: [project({ unpricedCount: 4, accessLevel: "view" })],
      now: NOW,
    });
    expect(theirs.total).toBe(0);
  });

  it("reads a draft certificate as the thing not yet decided", () => {
    const d = buildDecisions({
      projects: [],
      overview: {
        draftCertificates: [
          { projectId: "p1", name: "Block A", slug: "moremi", productKey: "planswift", number: 3, date: days(-5) },
        ],
      },
      now: NOW,
    });
    expect(d.rows[0].text).toBe("IPC 3 is a draft, not yet approved");
    expect(d.rows[0].href).toBe("/projects/planswift?project=moremi&tab=valuation");
  });

  it("only counts a variation that is explicitly pending", () => {
    const d = buildDecisions({
      projects: [],
      overview: {
        pendingVariations: [
          { projectId: "p1", name: "Block A", slug: "moremi", productKey: "planswift", reference: "V2", description: "Extra blockwork", issuedAt: days(-3) },
        ],
      },
      now: NOW,
    });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].text).toBe("V2, Extra blockwork is pending a decision");
  });

  it("puts the urgent overdue task above everything else", () => {
    const d = buildDecisions({
      projects: [project({ unpricedCount: 9 })],
      overview: {
        tasks: [
          { projectId: "p1", name: "Block A", slug: "moremi", productKey: "planswift", task: "Roof covering", endDate: days(-4) },
          { projectId: "p1", name: "Block A", slug: "moremi", productKey: "planswift", task: "Painting", endDate: days(6) },
        ],
      },
      now: NOW,
    });
    expect(d.rows[0].kind).toBe("Programme");
    expect(d.rows[0].urgent).toBe(true);
    expect(d.urgent).toBe(1);
    // A task due next week is not a decision; it belongs on the programme.
    expect(d.rows.some((r) => r.text.includes("Painting"))).toBe(false);
  });

  it("keeps the three-month row, in days, from the real date", () => {
    const d = buildDecisions({ projects: [project({ updatedAt: days(-120) })], now: NOW });
    expect(d.rows[0].kind).toBe("Stale");
    expect(d.rows[0].text).toBe("Not opened in 120 days");
  });

  it("keeps the install row, and only for products that really install", () => {
    const d = buildDecisions({
      projects: [],
      summary: {
        installations: [{ installationProductKey: "revit" }],
        entitlements: [
          { productKey: "revit" },
          { productKey: "planswift" },
          { productKey: "boq-import" },
          { productKey: "some-course", isCourse: true },
        ],
      },
      products: { revit: "QUIV", planswift: "HERON" },
      now: NOW,
    });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].text).toBe("HERON is on the plan but not installed here");
  });

  it("caps the list but still reports how many there really are", () => {
    const projects = Array.from({ length: 30 }, (_, i) =>
      project({ id: `p${i}`, slug: `p${i}`, unpricedCount: i + 1, updatedAt: days(-200) }),
    );
    const d = buildDecisions({ projects, now: NOW, cap: 8 });
    expect(d.rows.length).toBe(8);
    // 30 unpriced + 30 stale, all real.
    expect(d.total).toBe(60);
    // No single kind takes the list before every other kind has had a turn,
    // and the spare room is then filled rather than left blank.
    expect(d.rows.filter((r) => r.kind === "Pricing").length).toBeGreaterThanOrEqual(3);
    expect(d.rows.filter((r) => r.kind === "Stale").length).toBeGreaterThanOrEqual(2);
  });

  it("gives every kind a turn before one of them takes the spare room", () => {
    const projects = Array.from({ length: 30 }, (_, i) =>
      project({ id: `p${i}`, slug: `p${i}`, unpricedCount: i + 1 }),
    );
    const d = buildDecisions({
      projects,
      overview: {
        draftCertificates: [{ projectId: "c1", name: "Block C", slug: "c", productKey: "revit", number: 1, date: days(-1) }],
      },
      now: NOW,
      cap: 8,
    });
    expect(d.rows.some((r) => r.kind === "Valuation")).toBe(true);
    expect(d.rows.length).toBe(8);
  });

  it("is empty, not broken, before the overview has loaded", () => {
    expect(buildDecisions({}).rows).toEqual([]);
    expect(buildDecisions({ projects: [], overview: null, summary: null }).total).toBe(0);
  });
});

describe("headline figures", () => {
  const p = (totalCost, certifiedToDate, unpricedCount, accessLevel = "owner") => ({
    totalCost,
    certifiedToDate,
    unpricedCount,
    accessLevel,
  });

  it("sums measured work and certified value from the rollup", () => {
    const h = headline([p(10_000_000, 4_000_000, 2), p(30_000_000, 0, 0)]);
    expect(h.measured).toBe(40_000_000);
    expect(h.certified).toBe(4_000_000);
    expect(h.certifiedPct).toBe(10);
    expect(h.unpriced).toBe(2);
    expect(h.unpricedProjects).toBe(1);
  });

  it("does not divide by a portfolio worth nothing", () => {
    expect(headline([p(0, 0, 0)]).certifiedPct).toBe(0);
    expect(headline([]).measured).toBe(0);
  });

  it("leaves a read-only project out of the work waiting for a rate", () => {
    expect(headline([p(1, 0, 5, "view")]).unpriced).toBe(0);
  });
});

describe("the next lesson", () => {
  const course = (sku, pct, nextCode) => ({
    course: { sku, title: `Course ${sku}` },
    progress: pct,
    summary: { completedModules: 1, totalModules: 3 },
    moduleSubmissions: [
      { code: "M1", title: "One", completed: true },
      { code: nextCode, title: "Two", completed: false },
    ],
    enrollment: { status: "active" },
    access: {},
  });

  it("picks what is furthest along but unfinished", () => {
    const l = pickNextLesson([course("a", 10, "M2"), course("b", 60, "M9")]);
    expect(l.sku).toBe("b");
    expect(l.moduleTitle).toBe("Two");
    expect(l.href).toBe("/dash-course/b?m=M9");
  });

  it("answers with nothing when there is nothing enrolled", () => {
    expect(pickNextLesson([])).toBeNull();
    expect(pickNextLesson(null)).toBeNull();
  });
});
