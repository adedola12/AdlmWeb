import { describe, it, expect } from "vitest";
import { exportsFor, noExportsReason } from "./exportModel.js";
import { exportMenu, workbookRequest, filenameFrom, safeName } from "./exportModel.js";

// What is OFFERED is the thing to pin. The seven documents are the server's
// work; the only decision made on the client is which of them this project
// actually holds and this reader is actually allowed — and getting that wrong in
// either direction is a bug with a face: offer one that will be refused and the
// product looks broken, hide one that would have worked and the QS opens the
// classic workspace for a file that was here all along.

const job = (over = {}) => ({
  name: "Ikoyi Complex",
  items: [{ code: "BQ-1", description: "Excavate", unit: "m3", qty: 10, rate: 1000 }],
  ...over,
});

const at = (project) => exportsFor(project, { productKey: "revit", saveId: "66f1a2b3c4d5e6f7a8b9c0d1" });
const keys = (project) => at(project).map((r) => r.key);

describe("which documents a project can be exported as", () => {
  it("offers the four bill workbooks on any priced bill", () => {
    expect(keys(job())).toEqual([
      "boq-elemental",
      "boq-trade",
      "bill-budget",
      "bill-budget-trade",
    ]);
  });

  it("offers nothing off a bill that has no lines", () => {
    // Every one of these workbooks is built from the items. A menu entry that
    // produced an empty workbook would be worse than no entry.
    expect(keys(job({ items: [] }))).toEqual([]);
    expect(noExportsReason(job({ items: [] }), { productKey: "revit", saveId: "x" })).toBe("no-bill");
  });

  it("adds one row per issued certificate, newest first", () => {
    const p = job({
      certificates: [
        { number: 1, thisCertificate: 100 },
        { number: 3, thisCertificate: 300 },
        { number: 2, thisCertificate: 200 },
      ],
    });
    expect(keys(p).slice(4)).toEqual(["certificate-3", "certificate-2", "certificate-1"]);
  });

  it("skips a certificate with no number rather than asking for /certificates/0/export", () => {
    expect(keys(job({ certificates: [{ thisCertificate: 100 }] })).slice(4)).toEqual([]);
  });

  it("offers the final account only once it is finalised", () => {
    // The server answers 400 "Finalize the account first" otherwise
    // (projects.js:5676), so an unfinalised account is not offered at all.
    expect(keys(job({ finalAccount: { finalized: false } }))).not.toContain("final-account");
    expect(keys(job({ finalAccount: {} }))).not.toContain("final-account");
    expect(keys(job({ finalAccount: { finalized: true } }))).toContain("final-account");
  });
});

describe("what this reader is allowed", () => {
  it("offers nothing at all when the rates are masked", () => {
    // projects.boq.js:263 refuses every bill export with RATES_NOT_VISIBLE, and
    // a bill without its rates is not a bill.
    const p = job({ _access: { canSeeRates: false, canExport: true, canEdit: true } });
    expect(at(p)).toEqual([]);
    expect(noExportsReason(p, { productKey: "revit", saveId: "x" })).toBe("rates-hidden");
  });

  it("offers a view-only reader NOTHING, bill workbooks included", () => {
    // This test used to assert the opposite, and it was encoding a bug. The claim
    // was that "the bill routes never ask canExport" — which is what reading
    // loadProjectForExport alone tells you. The check is two calls down:
    // loadProjectForExport -> findProjectDoc -> canExportProject, which throws
    // 403 VIEW_ONLY at projects.boq.js:189. So the four bill workbooks were being
    // offered to a reader the server always refuses.
    const p = job({
      _access: { canSeeRates: true, canExport: false, canEdit: false },
      certificates: [{ number: 1 }],
      finalAccount: { finalized: true },
    });
    expect(at(p)).toEqual([]);
    expect(noExportsReason(p, { productKey: "revit", saveId: "x" })).toBe("view-only");
  });

  it("tells view-only and rates-hidden apart, because the remedy differs", () => {
    // "An active RateGen subscription lifts this" is true of one and false of the
    // other: buying RateGen flips canSeeRates, and canExport still refuses
    // everything. Selling a subscription that cannot unblock the reader is worse
    // than saying nothing.
    const viewOnly = job({ _access: { canSeeRates: true, canExport: false } });
    const masked = job({ _access: { canSeeRates: false, canExport: true } });
    expect(noExportsReason(viewOnly, { productKey: "revit", saveId: "x" })).toBe("view-only");
    expect(noExportsReason(masked, { productKey: "revit", saveId: "x" })).toBe("rates-hidden");
  });

  it("says the read FAILED rather than that it is still loading", () => {
    // A failed read leaves the project null exactly as a pending one does, so
    // without being told, the panel said "still loading" under the shell's own
    // banner saying the read had failed — and told the reader to wait for
    // something that would never arrive.
    expect(noExportsReason(null, { productKey: "revit", saveId: "x", failed: true })).toBe("failed");
    expect(noExportsReason(null, { productKey: "revit", saveId: "x" })).toBe("loading");
  });

  it("treats a missing _access as an owner, the way the server does", () => {
    // _access is attached by the access layer; a project loaded without it is
    // the owner's own (projects.js:617). Reading absent as "not allowed" would
    // lock an owner out of their own documents.
    const p = job({ certificates: [{ number: 1 }], finalAccount: { finalized: true } });
    expect(keys(p)).toContain("certificate-1");
    expect(keys(p)).toContain("final-account");
  });
});

describe("the addresses it builds", () => {
  const rows = at(job({ certificates: [{ number: 2 }], finalAccount: { finalized: true } }));
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const ID = "66f1a2b3c4d5e6f7a8b9c0d1";

  it("asks the routes that exist, with the parameters they read", () => {
    expect(byKey["boq-elemental"].path).toBe(`/projectsboq/revit/${ID}/export/boq?building=bungalow`);
    expect(byKey["boq-trade"].path).toBe(
      `/projectsboq/revit/${ID}/export/boq?building=bungalow&format=trade`,
    );
    expect(byKey["bill-budget"].path).toBe(`/projectsboq/revit/${ID}/export/bill-budget`);
    expect(byKey["bill-budget-trade"].path).toBe(
      `/projectsboq/revit/${ID}/export/bill-budget?groupBy=trade`,
    );
    expect(byKey["certificate-2"].path).toBe(`/projects/revit/${ID}/certificates/2/export`);
    expect(byKey["final-account"].path).toBe(`/projects/revit/${ID}/final-account/export`);
  });

  it("names every file after the project, with nothing a filesystem refuses", () => {
    const [first] = exportsFor(job({ name: 'Block A/B: phase 1*' }), {
      productKey: "revit",
      saveId: ID,
    });
    expect(first.fallbackName).toBe("Block A-B- phase 1- - Elemental BOQ.xlsx");
  });

  it("lower-cases the product key the routes match on", () => {
    const [first] = exportsFor(job(), { productKey: " ReVit ", saveId: ID });
    expect(first.path.startsWith("/projectsboq/revit/")).toBe(true);
  });

  it("offers nothing before the project or its id has arrived", () => {
    expect(exportsFor(null, { productKey: "revit", saveId: ID })).toEqual([]);
    expect(exportsFor(job(), { productKey: "revit", saveId: "" })).toEqual([]);
    expect(exportsFor(job(), { productKey: "", saveId: ID })).toEqual([]);
    expect(noExportsReason(null, { productKey: "revit", saveId: ID })).toBe("loading");
  });

  it("gives every row something to say when it fails", () => {
    for (const r of rows) {
      expect(r.failureMessage.length).toBeGreaterThan(10);
      expect(r.note.length).toBeGreaterThan(10);
      expect(r.label.length).toBeGreaterThan(3);
    }
  });
});


// The Export menu on the project head calls the same server exports as the
// classic workspace, so these pin the paths those routes read.

describe("the export menu", () => {
  it("lists the bill & budget, elemental, trade and milestone workbooks and the PDF reports", () => {
    const groups = exportMenu();
    expect(groups.map((g) => g.key)).toEqual(["bill", "elemental", "trade", "milestone", "icms", "pdf"]);
    expect(groups.find((g) => g.key === "pdf").items.map((i) => i.key)).toEqual(["report", "pm-report"]);
  });

  it("offers ICMS 3 as Excel, JSON and the details form, labelled as the classic menu labels them", () => {
    const icms = exportMenu().find((g) => g.key === "icms");
    expect(icms.label).toBe("ICMS 3");
    expect(icms.items.map((i) => [i.key, i.label, i.kind])).toEqual([
      ["icms-x", "ICMS 3 cost and carbon (Excel)", "workbook"],
      ["icms-j", "ICMS 3 cost and carbon (JSON)", "workbook"],
      ["icms-details", "ICMS details…", "icms-details"],
    ]);
  });

  it("drops the PM report where the project has no PM tab", () => {
    const pdf = exportMenu({ canSeePm: false }).find((g) => g.key === "pdf");
    expect(pdf.items.map((i) => i.key)).toEqual(["report"]);
  });

  it("tells an imported bill which export keeps its own sections", () => {
    expect(exportMenu({ isBoqImport: true })[0].hint).toMatch(/keeps its own sections/);
    expect(exportMenu()[0].hint).toBe("");
  });
});

describe("where each workbook comes from", () => {
  const at = { productKey: "PlanSwift", projectId: "64f0c0ffee", projectName: "Ikoyi: Block A" };

  it("asks the same routes the classic workspace does", () => {
    expect(workbookRequest("bb-cat", at).path).toBe("/projectsboq/planswift/64f0c0ffee/export/bill-budget");
    expect(workbookRequest("bb-trade", at).path).toBe("/projectsboq/planswift/64f0c0ffee/export/bill-budget?groupBy=trade");
    expect(workbookRequest("el-m", at).path).toBe("/projectsboq/planswift/64f0c0ffee/export/boq?building=multistorey");
    expect(workbookRequest("tr-b", at).path).toBe("/projectsboq/planswift/64f0c0ffee/export/boq?building=bungalow&format=trade");
    expect(workbookRequest("ms-b", at).path).toBe("/projectsboq/planswift/64f0c0ffee/export/boq?building=bungalow&format=milestone");
  });

  it("fetches the ICMS 3 report from the classic route, the JSON one as JSON", () => {
    const x = workbookRequest("icms-x", at);
    expect(x.path).toBe("/projectsboq/planswift/64f0c0ffee/export/icms");
    expect(x.filename).toBe("Ikoyi Block A - ICMS 3.xlsx");
    expect(x.json).toBe(false);
    const j = workbookRequest("icms-j", at);
    expect(j.path).toBe("/projectsboq/planswift/64f0c0ffee/export/icms?format=json");
    expect(j.filename).toBe("Ikoyi Block A - ICMS 3.json");
    expect(j.json).toBe(true);
    expect(workbookRequest("icms-details", at)).toBe(null);
  });

  it("names the fallback file safely, and is null for a report or a missing id", () => {
    expect(workbookRequest("bb-cat", at).filename).toBe("Ikoyi Block A - Bill & Budget.xlsx");
    expect(workbookRequest("report", at)).toBe(null);
    expect(workbookRequest("bb-cat", { ...at, projectId: "" })).toBe(null);
    expect(safeName("")).toBe("Project");
  });

  it("prefers the server's filename", () => {
    expect(filenameFrom('attachment; filename="Ikoyi - Bill.xlsx"', "x.xlsx")).toBe("Ikoyi - Bill.xlsx");
    expect(filenameFrom("", "x.xlsx")).toBe("x.xlsx");
  });
});
