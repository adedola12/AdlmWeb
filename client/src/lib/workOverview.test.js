import { describe, it, expect } from "vitest";
import {
  buildDecisions,
  decisionsNote,
  headline,
  pickNextLesson,
  projectTabHref,
  taskState,
  watDay,
} from "./workOverview.js";

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
    // updatedAt records the last CHANGE. Nothing we store knows when a project
    // was last opened, so the row does not claim to.
    expect(d.rows[0].text).toBe("Last changed 120 days ago");
    expect(d.rows[0].text).not.toMatch(/opened/);
  });

  it("gives every row a key of its own, even when the data repeats", () => {
    const at = (n) => new Date(NOW - n * 86400000).toISOString();
    const d = buildDecisions({
      projects: [project({ id: undefined, unpricedCount: 1 }), project({ id: undefined, unpricedCount: 2 })],
      overview: {
        // Two projects on IPC 1; one project with two unnamed variations and
        // two tasks of the same name — all of it happens on real accounts.
        draftCertificates: [
          { projectId: "a", productKey: "revit", slug: "a", number: 1, date: at(1) },
          { projectId: "b", productKey: "revit", slug: "b", number: 1, date: at(2) },
        ],
        pendingVariations: [
          { projectId: "a", productKey: "revit", slug: "a", issuedAt: at(1) },
          { projectId: "a", productKey: "revit", slug: "a", issuedAt: at(2) },
        ],
        tasks: [
          { projectId: "a", productKey: "revit", slug: "a", task: "Blockwork", endDate: at(9) },
          { projectId: "a", productKey: "revit", slug: "a", task: "Blockwork", endDate: at(8) },
        ],
      },
      now: NOW,
      cap: 20,
    });
    const ids = d.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
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
    const d = buildDecisions({ projects, overview: { counts: {} }, now: NOW, cap: 8 });
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

  it("counts what the server says there are, not the few rows it sent", () => {
    // The server caps each kind at 8. Counting the rows and calling it the
    // total told a person with 31 draft certificates that they had 8.
    const cert = (i) => ({
      projectId: `p${i}`,
      name: "Block A",
      slug: `p${i}`,
      productKey: "planswift",
      number: i,
      date: days(-i),
    });
    const d = buildDecisions({
      projects: [],
      overview: {
        draftCertificates: Array.from({ length: 8 }, (_, i) => cert(i + 1)),
        counts: { draftCertificates: 31, pendingVariations: 6, overdueTasks: 2 },
      },
      now: NOW,
      cap: 8,
    });
    expect(d.rows.length).toBe(8);
    expect(d.total).toBe(31 + 6 + 2);
    expect(d.urgent).toBe(2);
    expect(d.partial).toBe(false);
  });

  it("never reports fewer than the rows it is actually showing", () => {
    const d = buildDecisions({
      projects: [],
      overview: {
        draftCertificates: [
          { projectId: "p1", name: "Block A", slug: "p1", productKey: "planswift", number: 1, date: days(-1) },
        ],
        // An older response, or one where the branch came back empty.
        counts: { draftCertificates: 0, pendingVariations: 0, overdueTasks: 0 },
      },
      now: NOW,
    });
    expect(d.total).toBe(1);
  });

  it("says it does not know, rather than nothing, when the overview failed", () => {
    const failed = buildDecisions({
      projects: [],
      overview: null,
      overviewFailed: true,
      now: NOW,
    });
    expect(failed.partial).toBe(true);
    expect(failed.rows).toEqual([]);

    // Still loading is also "not known yet".
    expect(buildDecisions({ projects: [], overview: null, now: NOW }).partial).toBe(true);
    // Arrived: now the answer is complete.
    expect(buildDecisions({ projects: [], overview: { counts: {} }, now: NOW }).partial).toBe(false);
  });

  it("says so when the summary failed, instead of dropping the install row", () => {
    // /me/summary is the only thing that knows what is installed here. With
    // that call dead the install row simply is not in the list, and the total
    // was quietly one short with nothing on screen to say why.
    const d = buildDecisions({
      projects: [],
      overview: { counts: {} },
      summary: null,
      summaryFailed: true,
      products: { revit: "QUIV" },
      now: NOW,
    });
    expect(d.partial).toBe(true);
    expect(d.missing.failed).toEqual(["what is installed here"]);
    expect(decisionsNote(d.missing)).toBe("What is installed here could not be loaded");
  });

  it("waits for the summary rather than answering without it", () => {
    const d = buildDecisions({
      projects: [],
      overview: { counts: {} },
      summary: null,
      summaryPending: true,
      now: NOW,
    });
    expect(d.partial).toBe(true);
    expect(d.missing.pending).toEqual(["what is installed here"]);
  });

  it("names both when both are missing, and neither when neither is", () => {
    const both = buildDecisions({
      projects: [],
      overview: null,
      overviewFailed: true,
      summaryFailed: true,
      now: NOW,
    });
    expect(decisionsNote(both.missing)).toBe(
      "Valuations, variations and the programme, and what is installed here could not be loaded",
    );

    const mixed = buildDecisions({
      projects: [],
      overview: null,
      overviewFailed: true,
      summaryPending: true,
      now: NOW,
    });
    // A call that failed and a call that has not answered are different
    // things, and the line keeps them apart.
    expect(decisionsNote(mixed.missing)).toBe(
      "Valuations, variations and the programme could not be loaded · still checking what is installed here",
    );

    const complete = buildDecisions({
      projects: [],
      overview: { counts: {} },
      summary: { installations: [], entitlements: [] },
      now: NOW,
    });
    expect(complete.partial).toBe(false);
    expect(decisionsNote(complete.missing)).toBe("");
  });
});

describe("headline figures", () => {
  const p = (totalCost, certifiedToDate, unpricedCount, accessLevel = "owner", extra = {}) => ({
    totalCost,
    certifiedToDate,
    unpricedCount,
    accessLevel,
    ...extra,
  });

  it("sums measured work and certified value from the rollup", () => {
    const h = headline([p(10_000_000, 4_000_000, 2), p(30_000_000, 0, 0)]);
    expect(h.measured).toBe(40_000_000);
    expect(h.certified).toBe(4_000_000);
    expect(h.certifiedPct).toBe(10);
    expect(h.unpriced).toBe(2);
    expect(h.unpricedProjects).toBe(1);
  });

  it("compares certified value with the whole of the work, not with measured work", () => {
    // A certificate certifies prelims, provisional sums and approved
    // variations too, so 5m certified on a 10m bill that is really worth 20m
    // is a quarter of the job — not a half.
    const h = headline([p(10_000_000, 5_000_000, 0, "owner", { workValue: 20_000_000 })]);
    expect(h.value).toBe(20_000_000);
    expect(h.certifiedPct).toBe(25);
    // Measured work is still reported, because the first tile shows it.
    expect(h.measured).toBe(10_000_000);
  });

  it("falls back to measured work where a row carries no value of its own", () => {
    const h = headline([p(10_000_000, 4_000_000, 0)]);
    expect(h.value).toBe(10_000_000);
    expect(h.certifiedPct).toBe(40);
  });

  it("does not divide by a portfolio worth nothing", () => {
    expect(headline([p(0, 0, 0)]).certifiedPct).toBe(0);
    expect(headline([]).measured).toBe(0);
    expect(headline([]).value).toBe(0);
  });

  it("leaves a read-only project out of the work waiting for a rate", () => {
    expect(headline([p(1, 0, 5, "view")]).unpriced).toBe(0);
  });

  it("leaves a project whose money is hidden out of every money total", () => {
    // The rollup still sends measured work on a shared project — only the
    // figures the Work branch added are masked — but the row tells the reader
    // its money is hidden. A total that quietly included it would contradict
    // the very row it is built from.
    const h = headline([
      p(10_000_000, 4_000_000, 2),
      p(30_000_000, 6_000_000, 0, "view", {
        moneyHidden: true,
        workValue: 0,
        certifiedToDate: 0,
      }),
    ]);
    expect(h.measured).toBe(10_000_000);
    expect(h.certified).toBe(4_000_000);
    expect(h.value).toBe(10_000_000);
    // Both are still projects; only the money is withheld.
    expect(h.count).toBe(2);
    expect(h.counted).toBe(1);
    expect(h.hidden).toBe(1);
  });

  it("has no total at all when every project's money is hidden", () => {
    const h = headline([p(30_000_000, 0, 0, "view", { moneyHidden: true })]);
    expect(h.counted).toBe(0);
    expect(h.hidden).toBe(1);
    // Nothing to show. The screen reads this as an en dash, never ₦0.
    expect(h.measured).toBe(0);
    expect(h.certifiedPct).toBe(0);
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
