// The ArchiCAD BoQ and budget pages hide what a shared reader cannot use, and
// say why (work board: archicad-shared-readonly-ui). The server refuses every
// one of these anyway (PR #70); these tests pin that the page does not offer
// them, and that hidden prices read "–" rather than ₦0.00.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let boqDoc = null;
vi.mock("../http.js", () => ({
  apiAuthed: vi.fn(async (path) => {
    if (path.endsWith("/versions")) return [];
    if (path.endsWith("/preferences")) return { units: "metric" };
    return boqDoc;
  }),
}));
vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: "t", user: {} }) }));
// The badge polls a local connector process; nothing to test here.
vi.mock("../features/archicad/ArchiCADConnectorStatus.jsx", () => ({ default: () => null }));

const { default: ArchiCADBoQ } = await import("./ArchiCADBoQ.jsx");
const { default: ArchiCADBudgetDashboard } = await import("../features/archicad/ArchiCADBudgetDashboard.jsx");
const { sharedAccess, sharedAccessNote } = await import("../features/archicad/sharedAccess.js");

function doc(extra = {}, money = true) {
  const n = (v) => (money ? v : 0);
  return {
    projectId: "p1",
    slug: "pavillion",
    projectName: "Pavillion",
    versionId: "v3",
    versionNumber: 3,
    currency: "NGN",
    lines: [
      {
        itemRef: "1.1", category: "frame", categoryTitle: "Frame", description: "Concrete in columns",
        unit: "m3", quantity: 32, elementGuids: ["g1"], flags: [],
        unitRate: n(65000), materialAmount: n(1280000), labourAmount: n(352000),
        totalAmount: n(2080000), marginAmount: n(144000), marginPercent: n(8), netUnitCost: n(55000),
        rateProvenance: { rateSource: "rategen" },
      },
    ],
    categories: [{ key: "frame", title: "Frame", totalAmount: n(2080000) }],
    totals: {
      materialAmount: n(1280000), labourAmount: n(352000), directCost: n(1936000),
      marginAmount: n(144000), grandTotal: n(2080000), floorArea: 120, costPerM2: n(17333),
    },
    targetBudget: n(2500000),
    issues: [],
    changedLineRefs: [],
    share: { enabled: false, url: null },
    ...extra,
  };
}

const OWNER = doc({ canEdit: true, canExport: true, isOwner: true });
const FULL_SHOWN = doc({ canEdit: true, canExport: true, isOwner: false });
const VIEW_SHOWN = doc({ canEdit: false, canExport: false, isOwner: false });
const HIDDEN_BY_OWNER = doc({ canEdit: true, canExport: true, isOwner: false, moneyHidden: true, moneyHiddenBy: "owner" }, false);
const VIEW_NO_RATEGEN = doc({ canEdit: false, canExport: false, isOwner: false, moneyHidden: true, moneyHiddenBy: "rategen" }, false);
const OLD_API = doc(); // no flags at all: an API from before this change

async function mountBoQ(d) {
  boqDoc = d;
  const r = render(
    <MemoryRouter initialEntries={["/archicad/pavillion/boq"]}>
      <Routes>
        <Route path="/archicad/:projectId/boq" element={<ArchiCADBoQ />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(r.getByText("Concrete in columns")).toBeTruthy());
  return r;
}

const has = (r, text) => r.queryAllByText(text, { exact: false }).length > 0;
const button = (r, name) => r.queryByRole("button", { name: new RegExp(name, "i") });

afterEach(() => cleanup());

describe("sharedAccess", () => {
  it("reads a document without flags as today: editable, owner, money shown", () => {
    expect(sharedAccess({})).toEqual({ canEdit: true, canExport: true, isOwner: true, moneyHidden: false, moneyHiddenBy: null });
    expect(sharedAccessNote(sharedAccess({}))).toBeNull();
  });

  it("says who hid the money, and that view-only cannot change it", () => {
    expect(sharedAccessNote(sharedAccess(HIDDEN_BY_OWNER))).toMatch(/owner has hidden/);
    expect(sharedAccessNote(sharedAccess(VIEW_NO_RATEGEN))).toMatch(/RateGen subscription/);
    expect(sharedAccessNote(sharedAccess(VIEW_NO_RATEGEN))).toMatch(/view-only access/);
    expect(sharedAccessNote(sharedAccess(VIEW_SHOWN))).toBe(
      "You have view-only access, so this bill cannot be changed from here.",
    );
  });
});

describe("the ArchiCAD BoQ page", () => {
  it("gives the owner every control and no note", async () => {
    const r = await mountBoQ(OWNER);
    expect(button(r, "Excel")).toBeTruthy();
    expect(button(r, "Create share link")).toBeTruthy();
    expect(button(r, "Reapply rates")).toBeTruthy();
    expect(r.queryByLabelText(/Margin percent for item/)).toBeTruthy();
    expect(r.queryByTestId("archicad-shared-note")).toBeNull();
    expect(has(r, "2,080,000")).toBe(true);
  });

  it("an API without the flags behaves exactly as before", async () => {
    const r = await mountBoQ(OLD_API);
    expect(button(r, "Excel")).toBeTruthy();
    expect(button(r, "Create share link")).toBeTruthy();
    expect(r.queryByLabelText(/Margin percent for item/)).toBeTruthy();
  });

  it("a full collaborator who may see money edits and exports, but has no share-link button", async () => {
    const r = await mountBoQ(FULL_SHOWN);
    expect(button(r, "Excel")).toBeTruthy();
    expect(r.queryByLabelText(/Margin percent for item/)).toBeTruthy();
    expect(button(r, "Create share link")).toBeNull();
    expect(r.queryByTestId("archicad-shared-note")).toBeNull();
  });

  it("a view-only collaborator reads prices but cannot edit or export, and is told why", async () => {
    const r = await mountBoQ(VIEW_SHOWN);
    expect(r.queryByLabelText(/Margin percent for item/)).toBeNull();
    expect(button(r, "Reapply rates")).toBeNull();
    expect(has(r, "Global margin")).toBe(false);
    expect(button(r, "Excel")).toBeNull();
    expect(button(r, "PDF")).toBeNull();
    expect(r.getByTestId("archicad-shared-note").textContent).toMatch(/view-only access/);
    expect(has(r, "Viewing old version")).toBe(false);
    expect(has(r, "2,080,000")).toBe(true);
  });

  it("with prices hidden by the owner: dashes, no exports, no margins, and the note says so", async () => {
    const r = await mountBoQ(HIDDEN_BY_OWNER);
    expect(button(r, "Excel")).toBeNull();
    expect(button(r, "PDF")).toBeNull();
    expect(r.queryByLabelText(/Margin percent for item/)).toBeNull();
    expect(button(r, "Reapply rates")).toBeNull();
    expect(r.getByTestId("archicad-shared-note").textContent).toMatch(/owner has hidden/);
    expect(has(r, "₦0.00")).toBe(false);
    expect(r.getAllByText("–").length).toBeGreaterThan(3);
    // What was measured is still shown.
    expect(has(r, "32")).toBe(true);
  });
});

describe("the ArchiCAD budget dashboard", () => {
  const mount = (d) => render(<ArchiCADBudgetDashboard boq={d} onSaveBudget={() => {}} />);

  it("the owner can set the target budget", () => {
    const r = mount(OWNER);
    expect(button(r, "Save budget")).toBeTruthy();
    expect(has(r, "Cost by category")).toBe(true);
  });

  it("a view-only collaborator sees the tracker but not the editor", () => {
    const r = mount(VIEW_SHOWN);
    expect(button(r, "Save budget")).toBeNull();
    expect(has(r, "Budget tracker")).toBe(true);
    expect(has(r, "2,500,000")).toBe(true);
  });

  it("with prices hidden: dashes on the tiles, no chart, no tracker, and the note", () => {
    const r = mount(VIEW_NO_RATEGEN);
    expect(button(r, "Save budget")).toBeNull();
    expect(has(r, "Cost by category")).toBe(false);
    expect(has(r, "Budget tracker")).toBe(false);
    expect(has(r, "₦0.00")).toBe(false);
    expect(r.getAllByText("–").length).toBeGreaterThanOrEqual(6);
    expect(r.getByTestId("archicad-shared-note").textContent).toMatch(/RateGen subscription/);
  });
});
