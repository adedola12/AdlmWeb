import { describe, it, expect } from "vitest";
import { exportMenu, workbookRequest, filenameFrom, safeName } from "./exportModel.js";

// The Export menu on the project head calls the same server exports as the
// classic workspace, so these pin the paths those routes read.

describe("the export menu", () => {
  it("lists the bill & budget, elemental, trade and milestone workbooks and the PDF reports", () => {
    const groups = exportMenu();
    expect(groups.map((g) => g.key)).toEqual(["bill", "elemental", "trade", "milestone", "pdf"]);
    expect(groups.find((g) => g.key === "pdf").items.map((i) => i.key)).toEqual(["report", "pm-report"]);
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
