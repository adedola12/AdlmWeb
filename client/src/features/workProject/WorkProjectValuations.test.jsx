import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectValuations from "./WorkProjectValuations.jsx";

// His valuations() (work-proj.js:1508-1575). WORK.md §13: "Valuations stay
// locked until the contract is, with a checklist saying why."

const bill = (over = {}) => ({ code: "BQ-1", qty: 100, rate: 1_000, percentComplete: 60, ...over });

const locked = (over = {}) => ({
  name: "Ikoyi Complex",
  stage: "valuing",
  contract: {
    locked: true,
    lockedAt: "2026-09-01",
    contractSum: 100_000_000,
    tenderedAt: "2026-08-15",
    preliminaryPercent: 0,
    contingencyPercent: 0,
    taxPercent: 0,
  },
  preliminaryPercent: 0,
  contingencyPercent: 0,
  taxPercent: 0,
  valuationSettings: { retentionPct: 5, vatPct: 7.5, withholdingPct: 2.5 },
  provisionalSums: [],
  variations: [],
  items: [bill(), bill({ code: "BQ-2" })],
  certificates: [
    {
      number: 1,
      date: "2026-09-10",
      cumulativeValue: 30_000_000,
      thisCertificate: 30_000_000,
      retentionAmount: 1_500_000,
      retentionReleased: 0,
      netPayable: 29_212_500,
      status: "approved",
    },
    {
      number: 2,
      date: "2026-09-24",
      cumulativeValue: 45_000_000,
      thisCertificate: 15_000_000,
      retentionAmount: 750_000,
      retentionReleased: 0,
      netPayable: 14_606_250,
      status: "draft",
    },
  ],
  ...over,
});

const unlockedProject = (over = {}) => ({
  name: "Ikoyi Complex",
  stage: "priced",
  contract: { locked: false },
  items: [bill({ rate: 0 }), bill({ code: "BQ-2" })],
  provisionalSums: [],
  variations: [],
  certificates: [],
  ...over,
});

afterEach(cleanup);

describe("before the contract is locked", () => {
  it("shows his gate rather than any figures", () => {
    const c = render(<WorkProjectValuations project={unlockedProject()} canEdit />).container;
    expect(within(c).getByText("Valuations open once the contract is locked")).toBeTruthy();
    expect(c.querySelector(".pj-kpi")).toBe(null);
  });

  it("explains what locking does", () => {
    const c = render(<WorkProjectValuations project={unlockedProject()} canEdit />).container;
    expect(within(c).getByText(/turns the estimated total into the contract sum/)).toBeTruthy();
    expect(within(c).getByText(/quantities change only through variations/)).toBeTruthy();
  });

  it("lists what is still in the way, and ticks what is done", () => {
    const c = render(<WorkProjectValuations project={unlockedProject()} canEdit />).container;
    const list = c.querySelector(".pj-lock ul");
    expect(within(list).getByText("1 bill item still needs a rate")).toBeTruthy();
    expect(within(list).getByText("The bill has not gone to tender yet")).toBeTruthy();
    // Nothing is ok yet, so no row carries the class.
    expect(list.querySelectorAll("li.ok").length).toBe(0);
  });

  it("ticks a check once it passes", () => {
    const ready = unlockedProject({
      items: [bill(), bill({ code: "BQ-2" })],
      contract: { locked: false, tenderedAt: "2026-08-15" },
    });
    const c = render(<WorkProjectValuations project={ready} canEdit />).container;
    expect(c.querySelectorAll(".pj-lock li.ok").length).toBe(2);
  });

  it("offers the lock when the project is at tender, and the stages otherwise", () => {
    const atTender = unlockedProject({ stage: "tendered" });
    const a = render(<WorkProjectValuations project={atTender} canEdit />).container;
    expect(within(a).getByText(/Lock the contract/)).toBeTruthy();
    cleanup();
    const b = render(<WorkProjectValuations project={unlockedProject()} canEdit />).container;
    expect(within(b).getByText("See the project stages")).toBeTruthy();
  });

  it("offers a view-only reader nothing to press", () => {
    const c = render(
      <WorkProjectValuations project={unlockedProject()} canEdit={false} />,
    ).container;
    expect(c.querySelector(".pj-lock button")).toBe(null);
  });

  it("leaves the model check out when nobody has checked the model", () => {
    const c = render(<WorkProjectValuations project={unlockedProject()} canEdit />).container;
    expect(c.querySelectorAll(".pj-lock li").length).toBe(2);
  });

  it("includes it when a drift list is given", () => {
    const c = render(
      <WorkProjectValuations project={unlockedProject()} canEdit drift={[{ item: 0 }]} />,
    ).container;
    expect(within(c).getByText("The model has 1 change to review")).toBeTruthy();
  });
});

describe("once it is locked", () => {
  const draw = (props = {}) =>
    render(<WorkProjectValuations project={locked()} canEdit {...props} />).container;

  it("shows his five figures", () => {
    const c = draw();
    const kpi = c.querySelector(".pj-kpi");
    for (const label of [
      "Contract sum",
      "Certified to date",
      "Retention held",
      "Paid to date",
      "Work done now",
    ]) {
      expect(within(kpi).getByText(label), label).toBeTruthy();
    }
  });

  it("certifies only what has been approved — a draft is not money", () => {
    const c = draw();
    const kpi = c.querySelector(".pj-kpi");
    // IPC 1 approved at ₦30m; IPC 2 is still a draft.
    expect(within(kpi).getByText("₦30.0m")).toBeTruthy();
    expect(within(kpi).getByText("30% of the contract")).toBeTruthy();
  });

  it("says how much work is done but not yet valued, and warns", () => {
    const c = draw();
    const kpi = c.querySelector(".pj-kpi");
    // 60% of the bill is done; the last certificate reached 45%.
    expect(within(kpi).getByText("60%")).toBeTruthy();
    expect(within(kpi).getByText("15% not yet valued")).toBeTruthy();
    expect(kpi.querySelector(".warn")).toBeTruthy();
  });

  it("prints the terms the certificates are cut on", () => {
    const c = draw();
    expect(within(c).getByText(/Retention 5% · VAT 7\.5% · WHT 2\.5%/)).toBeTruthy();
  });

  it("offers his three views, with counts", () => {
    const c = draw();
    const seg = within(c).getByRole("group", { name: "View" });
    expect(within(seg).getByText("Certificates").textContent).toContain("2");
    expect(within(seg).getByText("Variations")).toBeTruthy();
    expect(within(seg).getByText("Final account")).toBeTruthy();
  });

  it("asks the caller to change view, so it can ride in the URL", () => {
    const onView = vi.fn();
    const c = render(
      <WorkProjectValuations project={locked()} canEdit onView={onView} />,
    ).container;
    fireEvent.click(within(c).getByText("Final account"));
    expect(onView).toHaveBeenCalledWith("final");
  });

  it("draws a bar per certificate plus Now", () => {
    const c = draw();
    const labels = [...c.querySelectorAll(".pj-vals .ch .c span")].map((s) => s.textContent);
    expect(labels).toEqual(["IPC 1", "IPC 2", "Now"]);
  });

  it("lists the certificates newest first, with what each one paid", () => {
    const c = draw();
    const rows = [...c.querySelectorAll(".pj-vals .ls .vr")];
    expect(rows[0].textContent).toContain("IPC 2");
    expect(rows[0].textContent).toContain("Cumulative 45%");
    expect(rows[1].textContent).toContain("₦29,212,500");
  });

  it("labels a paid certificate as paid, not as approved", () => {
    // Ours has a state his fixture never had.
    const p = locked();
    p.certificates[0].status = "paid";
    const c = render(<WorkProjectValuations project={p} canEdit />).container;
    expect(within(c).getByText("Paid")).toBeTruthy();
  });

  it("says so when nothing has been certified yet", () => {
    const c = render(
      <WorkProjectValuations project={locked({ certificates: [] })} canEdit />,
    ).container;
    expect(within(c).getByText("No valuations yet")).toBeTruthy();
  });

  it("hands Variations and the final account to their own views", () => {
    // WorkProjectVariations.test.jsx pins what each of those shows.
    const vars = draw({ view: "variations" });
    expect(vars.textContent).not.toContain("not built here yet");
    cleanup();
    const fin = draw({ view: "final" });
    expect(fin.querySelector(".pj-final")).toBeTruthy();
    expect(fin.textContent).toContain("Final account");
  });
});

describe("a project that has not loaded", () => {
  it("does not throw, and shows the gate rather than figures", () => {
    const { container } = render(<WorkProjectValuations project={null} />);
    expect(container.querySelector(".pj-lock")).toBeTruthy();
  });
});

/* ───────── a button that names a place must go there ───────── */

// It read "Lock the contract on the classic workspace" and called
// onGo("overview") — the Overview tab of THIS workspace, which cannot lock
// anything. Somebody who had worked through the checklist pressed it, landed on
// a summary of their own project, and had no way to find the lock.
//
// Worse than a missing control, because it looks like the product did the thing
// and went somewhere odd, rather than like the thing is elsewhere.
describe("the lock control goes where it says", () => {
  it("links to the classic workspace, not to another tab here", () => {
    const atTender = unlockedProject({ stage: "tendered" });
    const href = "/projects/revit?project=abc&classic=1";
    const onGo = vi.fn();
    const c = render(
      <WorkProjectValuations project={atTender} canEdit classicHref={href} onGo={onGo} />,
    ).container;

    const link = within(c).getByText(/Lock the contract/);
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(href);
    // And it does not quietly move the reader somewhere else as well.
    expect(onGo).not.toHaveBeenCalled();
  });

  it("says the same thing when there is no address to send them to", () => {
    // The wording must not depend on whether we happen to have a URL — the
    // reader needs telling either way.
    const atTender = unlockedProject({ stage: "tendered" });
    const c = render(<WorkProjectValuations project={atTender} canEdit />).container;
    expect(within(c).getByText(/Lock the contract on the classic workspace/)).toBeTruthy();
  });

  it("never renders a lock control that does nothing when pressed", () => {
    // The shape of the original bug: a <button> whose only job was to navigate
    // somewhere that cannot lock. Any button here must carry a handler.
    const atTender = unlockedProject({ stage: "tendered" });
    const c = render(<WorkProjectValuations project={atTender} canEdit />).container;
    for (const b of c.querySelectorAll("button")) {
      if (/Lock the contract/.test(b.textContent || "")) {
        throw new Error("the lock is a button again; it must be a link to where locking happens");
      }
    }
  });
});

describe("offering to issue a certificate", () => {
  // The monthly act, and the one thing this tab could not do. Its empty state told
  // a QS to "raise the first certificate in the classic workspace" and gave no
  // link, so the only instruction on an empty Valuations tab was to leave.
  const locked = (over = {}) => ({
    contract: { locked: true, contractSum: 80_000_000, tenderedAt: "2026-08-01" },
    valuationSettings: { retentionPct: 5, vatPct: 7.5, withholdingPct: 2.5 },
    certificates: [],
    items: [{ code: "BQ-1", description: "Excavate", unit: "m3", qty: 10, rate: 1000 }],
    ...over,
  });

  const draw = (project, props = {}) =>
    render(
      <WorkProjectValuations project={project} canEdit view="certs" {...props} />,
    ).container;

  it("offers it in the toolbar", () => {
    const onIssueCert = vi.fn();
    const c = draw(locked(), { onIssueCert });
    fireEvent.click(within(c).getByText("Issue a certificate"));
    expect(onIssueCert).toHaveBeenCalled();
  });

  it("offers it from the empty state instead of sending them to classic", () => {
    const onIssueCert = vi.fn();
    const c = draw(locked(), { onIssueCert });
    expect(within(c).queryByText(/in the classic workspace/)).toBe(null);
    fireEvent.click(within(c).getByText("Issue the first certificate"));
    expect(onIssueCert).toHaveBeenCalled();
  });

  it("does not offer it to a reader who cannot edit", () => {
    const c = draw(locked(), { onIssueCert: vi.fn(), canEdit: false });
    expect(within(c).queryByText("Issue a certificate")).toBe(null);
    expect(within(c).queryByText("Issue the first certificate")).toBe(null);
  });

  it("does not offer it on the variations or final-account views", () => {
    // A button about certificates, on a list of variations, is a button about
    // something else.
    const onIssueCert = vi.fn();
    for (const view of ["variations", "final"]) {
      const c = draw(locked(), { onIssueCert, view });
      expect(within(c).queryByText("Issue a certificate")).toBe(null);
      cleanup();
    }
  });

  it("does not offer it before the contract is locked", () => {
    // There is nothing to certify against until the estimate becomes a contract
    // sum, and the lock gate is what this tab shows instead.
    const c = draw(locked({ contract: { locked: false } }), { onIssueCert: vi.fn() });
    expect(within(c).queryByText("Issue a certificate")).toBe(null);
  });

  it("shows nothing extra when no handler is given", () => {
    // The tab is rendered in tests and stories without one; an inert button would
    // be the thing this branch keeps removing.
    const c = draw(locked());
    expect(within(c).queryByText("Issue a certificate")).toBe(null);
    expect(within(c).queryByText("Issue the first certificate")).toBe(null);
  });
});
