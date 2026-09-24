// The rebuilt Work overview (S18/WH-01 to WH-13), rendered on stubbed reads.
//
// What is checked here is what the screen SAYS, because that is where this
// change can go wrong: a tile that claims an estimate we do not compute, a
// certificate summed instead of read, a variation given an approval state we
// do not store, or a panel that takes the page down with it when its own call
// fails.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const responses = {};
const failing = new Set();

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path) => {
    const key = String(path).split("?")[0];
    if (failing.has(key)) throw new Error("nope");
    if (!(key in responses)) throw new Error(`no stub for ${key}`);
    return responses[key];
  }),
}));

vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: "t", user: {} }) }));

// The zone/currency control reads the profile of its own accord; it is not
// what this screen is being tested for.
vi.mock("./WkPrefs.jsx", () => ({ default: () => <div data-testid="wkprefs" /> }));

const { default: DsWorkHome } = await import("./DsWorkHome.jsx");

const project = (extra) => ({
  id: "p1",
  name: "MOREMI ESTATE BLOCK A",
  slug: "moremi",
  productKey: "planswift",
  baseProductKey: "planswift",
  updatedAt: "2026-09-20T10:00:00Z",
  itemCount: 120,
  pricedCount: 100,
  unpricedCount: 20,
  totalCost: 40_000_000,
  certifiedToDate: 10_000_000,
  certificateCount: 2,
  progressPercent: 25,
  accessLevel: "owner",
  clientName: "Lagos State",
  ...extra,
});

const base = () => {
  responses["/me/projects-rollup"] = { projects: [project()] };
  responses["/me/work-overview"] = {
    certificates: [],
    draftCertificates: [],
    variations: [],
    pendingVariations: [],
    tasks: [],
    rateUsage: [],
    counts: { draftCertificates: 0, pendingVariations: 0, overdueTasks: 0 },
  };
  responses["/me/summary"] = { installations: [], entitlements: [] };
  responses["/rategen-v2/library/custom-rates"] = { items: [] };
  responses["/me/courses/assignments"] = { items: [] };
  responses["/me/courses"] = [];
};

const mount = () =>
  render(
    <MemoryRouter>
      <DsWorkHome />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  failing.clear();
  base();
});
afterEach(cleanup);

describe("the Work overview, rebuilt as one dashboard", () => {
  it("has no Cards / Register switch left", async () => {
    mount();
    await screen.findByText("Projects");
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cards" })).toBeNull();
  });

  it("names the first tile for what it really sums", async () => {
    mount();
    // Not "Estimated": the rollup is qty x rate, with no prelims, contingency,
    // VAT or linked services in it.
    const tile = (await screen.findByText("Measured work, all projects")).closest("a");
    expect(screen.queryByText(/Estimated, all projects/)).toBeNull();
    expect(within(tile).getByText("₦40.0m")).toBeTruthy();
    expect(within(tile).getByText(/1 project at the rates they were priced with/)).toBeTruthy();
  });

  it("shows certified value as a share of what the work is worth", async () => {
    // 10m certified against a job worth 50m — measured work is only 40m of
    // that, and dividing by it would claim 25%.
    responses["/me/projects-rollup"] = { projects: [project({ workValue: 50_000_000 })] };
    mount();
    const tile = (await screen.findByText("Certified to date")).closest("a");
    expect(within(tile).getByText("₦10.0m")).toBeTruthy();
    expect(within(tile).getByText("20% of the work's value")).toBeTruthy();
    expect(within(tile).queryByText(/of measured work/)).toBeNull();
  });

  it("shows an en dash, never a guess, where nothing is certified", async () => {
    responses["/me/projects-rollup"] = { projects: [project({ certifiedToDate: 0 })] };
    mount();
    await screen.findByText("Certified to date");
    const table = screen.getByText("Projects").closest("section");
    expect(within(table).getAllByText("–").length).toBeGreaterThan(0);
  });

  it("calls a draft certificate a draft, and never says awaiting approval", async () => {
    responses["/me/work-overview"] = {
      ...responses["/me/work-overview"],
      certificates: [
        {
          projectId: "p1",
          name: "MOREMI ESTATE BLOCK A",
          slug: "moremi",
          productKey: "planswift",
          number: 3,
          date: "2026-09-10T00:00:00Z",
          netPayable: 4_250_000,
          status: "draft",
        },
      ],
      draftCertificates: [
        {
          projectId: "p1",
          name: "MOREMI ESTATE BLOCK A",
          slug: "moremi",
          productKey: "planswift",
          number: 3,
          date: "2026-09-10T00:00:00Z",
          netPayable: 4_250_000,
          status: "draft",
        },
      ],
    };
    mount();
    await screen.findByText("IPC 3");
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.queryByText("Awaiting")).toBeNull();
    expect(screen.getByText("IPC 3 is a draft, not yet approved")).toBeTruthy();
  });

  it("reads a variation's own sign and status, inventing neither", async () => {
    responses["/me/work-overview"] = {
      ...responses["/me/work-overview"],
      variations: [
        {
          projectId: "p1",
          name: "MOREMI ESTATE BLOCK A",
          slug: "moremi",
          productKey: "planswift",
          reference: "V2",
          description: "Omit paving",
          amount: -450_000,
          issuedAt: "2026-09-05T00:00:00Z",
          status: "approved",
        },
      ],
    };
    mount();
    await screen.findByText("V2");
    // U+2212, his minus sign, not a hyphen.
    expect(screen.getByText(/−/)).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("puts an overdue task in Needs a decision, marked urgent", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    responses["/me/work-overview"] = {
      ...responses["/me/work-overview"],
      tasks: [
        {
          projectId: "p1",
          name: "MOREMI ESTATE BLOCK A",
          slug: "moremi",
          productKey: "planswift",
          task: "Roof covering",
          endDate: yesterday,
          percentComplete: 40,
          assignedTo: "",
          status: "in-progress",
        },
      ],
    };
    mount();
    await screen.findByText("Roof covering is past its end date");
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("No owner")).toBeTruthy();
    // The tile agrees with the table it anchors to.
    expect(screen.getByText("1 urgent")).toBeTruthy();
  });

  it("keeps the rest of the dashboard when one panel's call fails", async () => {
    failing.add("/me/work-overview");
    mount();
    await screen.findByText("Projects");
    expect(screen.getByText("Measured work, all projects")).toBeTruthy();
    expect(screen.getAllByText("That could not be loaded just now.").length).toBe(2);
  });

  it("admits it cannot see the decisions rather than reporting none", async () => {
    // Three of the six kinds of decision live on /me/work-overview. With that
    // call dead the screen knows about the unpriced items and nothing else, so
    // it must not put a confident number on the tile.
    failing.add("/me/work-overview");
    const { container } = mount();
    await screen.findByText("Projects");
    const tile = container.querySelector('a[href="#oh-att"]');
    expect(within(tile).getByText("–")).toBeTruthy();
    expect(within(tile).getByText("Part of this could not be loaded")).toBeTruthy();
    expect(
      screen.getByText("Valuations, variations and the programme could not be loaded"),
    ).toBeTruthy();
    // What it does know is still offered.
    expect(screen.getByText("20 items need a rate")).toBeTruthy();
  });

  it("never says nothing is waiting when it could not look", async () => {
    failing.add("/me/work-overview");
    responses["/me/projects-rollup"] = { projects: [project({ unpricedCount: 0 })] };
    mount();
    await screen.findByText("Projects");
    const panel = screen.getByRole("heading", { name: "Needs a decision" }).closest("section");
    expect(within(panel).queryByText("Nothing is waiting on you.")).toBeNull();
    expect(within(panel).getByText("That could not be loaded just now.")).toBeTruthy();
  });

  it("does not claim a rate is on no bill lines when usage could not be loaded", async () => {
    failing.add("/me/work-overview");
    responses["/rategen-v2/library/custom-rates"] = {
      items: [
        {
          id: "r1",
          title: "Blockwork 225mm",
          description: "Blockwork 225mm",
          unit: "m2",
          totalCost: 12_000,
          updatedAt: "2026-09-18T00:00:00Z",
        },
      ],
    };
    mount();
    await screen.findByText("Blockwork 225mm");
    expect(
      screen.getByText("Recently changed rates · where they are used could not be loaded"),
    ).toBeTruthy();
  });

  it("quotes the server's own count, not the handful of rows it sent", async () => {
    const draft = (n) => ({
      projectId: `p${n}`,
      name: `Block ${n}`,
      slug: `p${n}`,
      productKey: "planswift",
      number: n,
      date: "2026-09-10T00:00:00Z",
      netPayable: 0,
      status: "draft",
    });
    responses["/me/projects-rollup"] = { projects: [project({ unpricedCount: 0 })] };
    responses["/me/work-overview"] = {
      ...responses["/me/work-overview"],
      draftCertificates: Array.from({ length: 8 }, (_, i) => draft(i + 1)),
      counts: { draftCertificates: 31, pendingVariations: 0, overdueTasks: 0 },
    };
    const { container } = mount();
    await screen.findByText("Projects");
    const tile = container.querySelector('a[href="#oh-att"]');
    expect(within(tile).getByText("31")).toBeTruthy();
    expect(screen.getByText("31 open · showing the 8 most pressing")).toBeTruthy();
  });

  it("hides money on a shared project instead of printing a zero", async () => {
    responses["/me/projects-rollup"] = {
      projects: [
        project({ shared: true, accessLevel: "view", certifiedToDate: 0, moneyHidden: true }),
      ],
    };
    responses["/me/work-overview"] = {
      ...responses["/me/work-overview"],
      certificates: [
        {
          projectId: "p1",
          name: "MOREMI ESTATE BLOCK A",
          slug: "moremi",
          productKey: "planswift",
          number: 2,
          date: "2026-09-10T00:00:00Z",
          netPayable: 0,
          cumulativeValue: 0,
          status: "approved",
          shared: true,
          moneyHidden: true,
        },
      ],
    };
    mount();
    const cert = (await screen.findByText("IPC 2")).closest("tr");
    // An en dash, not ₦0 — the figure is withheld, not nothing.
    expect(within(cert).getByText("–")).toBeTruthy();
    expect(within(cert).queryByText("₦0")).toBeNull();
    expect(screen.getByText(/· money hidden/)).toBeTruthy();
  });

  it("does not print the measured money on the row that says money is hidden", async () => {
    // The rollup masks the figures this branch added but still sends measured
    // work, because whether to mask that API-wide is a product decision nobody
    // has taken. The screen draws the line itself: the row cannot say "money
    // hidden" and then print ₦40.0m of it.
    responses["/me/projects-rollup"] = {
      projects: [
        project({ shared: true, accessLevel: "view", certifiedToDate: 0, moneyHidden: true }),
      ],
    };
    mount();
    const panel = (await screen.findByRole("heading", { name: "Projects" })).closest("section");
    const row = within(panel).getByText("MOREMI ESTATE BLOCK A").closest("tr");
    expect(within(row).queryByText("₦40.0m")).toBeNull();
    // Measured and Certified both withheld.
    expect(within(row).getAllByText("–").length).toBeGreaterThanOrEqual(2);
  });

  it("leaves a hidden project out of the headline, and says the total leaves it out", async () => {
    responses["/me/projects-rollup"] = {
      projects: [
        project(),
        project({
          id: "p2",
          slug: "ikeja",
          name: "IKEJA OFFICES",
          shared: true,
          accessLevel: "view",
          totalCost: 90_000_000,
          certifiedToDate: 0,
          workValue: 0,
          moneyHidden: true,
        }),
      ],
    };
    mount();
    const tile = (await screen.findByText("Measured work, all projects")).closest("a");
    // 40m, not 130m: the second project's money is withheld from this reader.
    expect(within(tile).getByText("₦40.0m")).toBeTruthy();
    expect(within(tile).queryByText("₦130.0m")).toBeNull();
    expect(
      within(tile).getByText(
        /1 project at the rates they were priced with · 1 shared project, money hidden, not counted/,
      ),
    ).toBeTruthy();
  });

  it("shows an en dash when every project's money is hidden", async () => {
    responses["/me/projects-rollup"] = {
      projects: [
        project({ shared: true, accessLevel: "view", certifiedToDate: 0, moneyHidden: true }),
      ],
    };
    const { container } = mount();
    await screen.findByText("Projects");
    const tile = container.querySelector(".oh-kpis a");
    expect(within(tile).getByText("–")).toBeTruthy();
    expect(within(tile).getByText(/Nothing here can be totalled/)).toBeTruthy();
  });

  it("admits the decision count is short when the summary call fails", async () => {
    // One of the six kinds of decision — a product on the plan that is not
    // installed here — comes only from /me/summary. Dropping it silently made
    // the tile a confident smaller number.
    failing.add("/me/summary");
    responses["/me/projects-rollup"] = { projects: [project({ unpricedCount: 0 })] };
    const { container } = mount();
    await screen.findByText("Projects");
    const tile = container.querySelector('a[href="#oh-att"]');
    await waitFor(() => expect(within(tile).getByText("–")).toBeTruthy());
    expect(within(tile).getByText("Part of this could not be loaded")).toBeTruthy();
    expect(screen.getByText("What is installed here could not be loaded")).toBeTruthy();
  });

  it("says the next lesson is missing rather than letting it look unenrolled", async () => {
    failing.add("/me/courses");
    mount();
    await screen.findByText("Projects");
    expect(
      screen.getByText("Where this browser last had you · the next lesson could not be loaded"),
    ).toBeTruthy();
  });

  it("takes the page down only when the rollup itself fails", async () => {
    failing.add("/me/projects-rollup");
    mount();
    await screen.findByText("Your work could not be loaded just now. Please refresh.");
  });

  it("says a rate's usage in bill lines, or nothing at all", async () => {
    responses["/rategen-v2/library/custom-rates"] = {
      items: [
        {
          id: "r1",
          title: "Concrete grade 25 in slabs",
          description: "Concrete grade 25 in slabs",
          sectionLabel: "Concrete work",
          unit: "m3",
          totalCost: 185_000,
          updatedAt: "2026-09-19T00:00:00Z",
        },
        {
          id: "r2",
          title: "Blockwork 225mm",
          description: "Blockwork 225mm",
          unit: "m2",
          totalCost: 12_000,
          updatedAt: "2026-09-18T00:00:00Z",
        },
      ],
    };
    responses["/me/work-overview"] = {
      ...responses["/me/work-overview"],
      rateUsage: [{ key: "Concrete grade 25 in slabs", lines: 12 }],
    };
    mount();
    await screen.findByText("Concrete grade 25 in slabs");
    expect(screen.getByText("12 lines")).toBeTruthy();
    // Nothing matched, so nothing is claimed.
    const rate = screen.getByText("Blockwork 225mm").closest("tr");
    expect(within(rate).getByText("–")).toBeTruthy();
  });

  it("offers the empty states rather than blank panels on a new account", async () => {
    responses["/me/projects-rollup"] = { projects: [] };
    mount();
    await screen.findByText(/Nothing here yet/);
    expect(screen.getByText("No assignments due.")).toBeTruthy();
    expect(screen.getByText("No rates of your own yet.")).toBeTruthy();
  });

  it("does not offer to price a project somebody can only look at", async () => {
    responses["/me/projects-rollup"] = {
      projects: [project({ accessLevel: "view", unpricedCount: 20 })],
    };
    mount();
    await screen.findByText("Nothing is waiting on you.");
    expect(screen.getByText(/· view only/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Everything measured has a rate")).toBeTruthy());
  });
});
