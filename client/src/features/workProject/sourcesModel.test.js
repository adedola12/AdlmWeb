import { describe, it, expect } from "vitest";
import {
  attachedModels,
  formatSize,
  linkedServices,
  linkedServicesTotal,
  measuredPlaces,
  modelWarning,
  unplacedCount,
} from "./sourcesModel.js";

// His model() (work-proj.js:1738), drawings() (:1817) and services() (:1833),
// against what our data actually holds. sourcesModel.js sets out which of his
// fixture's fields we have and which we do not.

/* ───────────────────────────── Model ───────────────────────────── */

const withModels = (over = {}) => ({
  models: {
    architectural: {
      sourceFile: "ikoyi-arch.ifc",
      url: "https://r2/x.ifc",
      sizeBytes: 47_185_920,
      format: "ifc",
      uploadedAt: "2026-09-12",
      validation: {
        status: "valid",
        requiredCount: 412,
        matchedCount: 412,
        missingCount: 0,
        ifcElementCount: 9_140,
      },
    },
    structural: {
      sourceFile: "ikoyi-struct.ifc",
      url: "https://r2/y.ifc",
      sizeBytes: 12_582_912,
      format: "ifc",
      uploadedAt: "2026-09-14",
      validation: {
        status: "invalid",
        requiredCount: 180,
        matchedCount: 167,
        missingCount: 13,
        ifcElementCount: 3_002,
      },
    },
    // Never uploaded.
    mep: {},
    civil: {},
  },
  ...over,
});

describe("the models attached to a project", () => {
  it("lists only the ones actually uploaded", () => {
    const list = attachedModels(withModels());
    expect(list.map((m) => m.key)).toEqual(["architectural", "structural"]);
  });

  it("names each discipline, calling mep Services as the rail does", () => {
    const all = attachedModels({
      models: { mep: { sourceFile: "m.ifc", validation: { status: "valid" } } },
    });
    expect(all[0].label).toBe("Services");
  });

  it("reports what the check found against the bill", () => {
    const [arch, struct] = attachedModels(withModels());
    expect(arch.statusLabel).toBe("Matches the bill");
    expect(arch.tone).toBe("ok");
    expect(struct.statusLabel).toBe("Does not match the bill");
    expect(struct.tone).toBe("warn");
    expect(struct.missingCount).toBe(13);
  });

  it("treats a model nobody has checked as unchecked, not as broken", () => {
    const m = attachedModels({ models: { architectural: { sourceFile: "x.ifc" } } })[0];
    expect(m.status).toBe("unchecked");
    expect(m.statusLabel).toBe("Not checked yet");
    expect(m.tone).toBe("");
  });

  it("says nothing was measured from it when that is the finding", () => {
    const m = attachedModels({
      models: { architectural: { sourceFile: "x.ifc", validation: { status: "no-quantities" } } },
    })[0];
    expect(m.statusLabel).toBe("Nothing measured from it yet");
  });

  it("is empty on a project with no models at all", () => {
    expect(attachedModels({})).toEqual([]);
    expect(attachedModels(null)).toEqual([]);
  });
});

describe("the warning above the models", () => {
  it("counts the elements the bill was measured from that have gone", () => {
    // His note compares two IFC versions. We compare the model against the
    // bill, so it is worded for what was actually checked.
    const w = modelWarning(withModels());
    expect(w.count).toBe(13);
    expect(w.disciplines).toEqual(["Structural"]);
    expect(w.text).toMatch(/13 elements .* are missing from the model/);
  });

  it("says nothing when every model still answers the bill", () => {
    const clean = withModels();
    clean.models.structural.validation = { status: "valid", missingCount: 0 };
    expect(modelWarning(clean)).toBe(null);
  });

  it("says nothing about a model nobody has checked", () => {
    expect(modelWarning({ models: { architectural: { sourceFile: "x.ifc" } } })).toBe(null);
  });

  it("uses the singular for one element, verb included", () => {
    const one = withModels();
    one.models.structural.validation.missingCount = 1;
    expect(modelWarning(one).text).toBe(
      "1 element the bill was measured from is missing from the model",
    );
  });

  it("uses the plural for more than one", () => {
    expect(modelWarning(withModels()).text).toBe(
      "13 elements the bill was measured from are missing from the model",
    );
  });
});

describe("file sizes", () => {
  it("reads in MB, KB or bytes", () => {
    expect(formatSize(47_185_920)).toBe("45 MB");
    expect(formatSize(4_096)).toBe("4 KB");
    expect(formatSize(512)).toBe("512 B");
  });

  it("says nothing rather than 0 when there is no size", () => {
    expect(formatSize(0)).toBe("");
    expect(formatSize(null)).toBe("");
  });
});

/* ─────────────────────────── Drawings ─────────────────────────── */

const BILL = [
  { code: "BQ-1", takeoffLine: "Ground floor plan", qty: 100, rate: 1_000 },
  { code: "BQ-2", takeoffLine: "Ground floor plan", qty: 50, rate: 2_000 },
  { code: "BQ-3", takeoffLine: "First floor plan", qty: 10, rate: 500 },
  // No place recorded.
  { code: "BQ-4", qty: 5, rate: 100 },
];

describe("where a bill was measured", () => {
  it("groups the lines by the place each came from", () => {
    const places = measuredPlaces(BILL);
    expect(places.map((p) => p.place)).toEqual(["Ground floor plan", "First floor plan"]);
  });

  it("puts the place most of the job came from first", () => {
    // The sheet a job was mostly measured from is the one worth seeing first.
    expect(measuredPlaces(BILL)[0].indexes).toEqual([0, 1]);
  });

  it("keeps each line's index, so Show items can find them", () => {
    expect(measuredPlaces(BILL)[1].indexes).toEqual([2]);
  });

  it("totals what was measured at each place", () => {
    expect(measuredPlaces(BILL)[0].value).toBe(100 * 1_000 + 50 * 2_000);
  });

  it("counts how many of a place's lines are priced", () => {
    const withUnpriced = [...BILL, { code: "BQ-5", takeoffLine: "First floor plan", qty: 1, rate: 0 }];
    const first = measuredPlaces(withUnpriced).find((p) => p.place === "First floor plan");
    expect(first.indexes.length).toBe(2);
    expect(first.priced).toBe(1);
  });

  it("counts the lines that record no place at all", () => {
    expect(unplacedCount(BILL)).toBe(1);
  });

  it("does not throw on an empty bill", () => {
    expect(measuredPlaces([])).toEqual([]);
    expect(measuredPlaces(null)).toEqual([]);
    expect(unplacedCount(null)).toBe(0);
  });
});

/* ─────────────────────────── Services ─────────────────────────── */

const withServices = (over = {}) => ({
  linkedProjects: [
    { projectId: "s1", label: "Ikoyi — Services", linkType: "sum", discipline: "mep", addedAt: "2026-09-05" },
    // A merged source is part of this bill, not a service.
    { projectId: "m1", label: "Ikoyi — Structural", linkType: "merge", discipline: "structural" },
  ],
  linkedSummaries: [
    {
      projectId: "s1",
      name: "Ikoyi — Services",
      live: { total: 24_500_000, itemCount: 86, pricedPercent: 78 },
      snapshot: { total: 20_000_000, itemCount: 80, pricedPercent: 60 },
    },
  ],
  ...over,
});

describe("the services rolled into a project", () => {
  it("lists the summed links and not the merged ones", () => {
    // linkType "sum" is his services link: only the total comes in. "merge" is
    // the federated container — part of this bill, not a service.
    const list = linkedServices(withServices());
    expect(list.map((s) => s.id)).toEqual(["s1"]);
  });

  it("prefers the live figure over the snapshot", () => {
    const [s] = linkedServices(withServices());
    expect(s.total).toBe(24_500_000);
    expect(s.itemCount).toBe(86);
    expect(s.pricedPercent).toBe(78);
    expect(s.stale).toBe(false);
  });

  it("falls back to the snapshot, and says that is what it is", () => {
    // A snapshot is what the total WAS, not what it is, and the card says so.
    const stale = withServices({
      linkedSummaries: [{ projectId: "s1", snapshot: { total: 20_000_000, itemCount: 80 } }],
    });
    const [s] = linkedServices(stale);
    expect(s.total).toBe(20_000_000);
    expect(s.stale).toBe(true);
  });

  it("uses the link's own label before the summary's name", () => {
    expect(linkedServices(withServices())[0].name).toBe("Ikoyi — Services");
  });

  it("survives a link with no summary at all", () => {
    const orphan = withServices({ linkedSummaries: [] });
    const [s] = linkedServices(orphan);
    expect(s.total).toBe(0);
    expect(s.name).toBe("Ikoyi — Services");
  });

  it("totals what the services add", () => {
    expect(linkedServicesTotal(withServices())).toBe(24_500_000);
    expect(linkedServicesTotal({})).toBe(0);
  });

  it("clamps a nonsense priced percentage", () => {
    const odd = withServices({
      linkedSummaries: [{ projectId: "s1", live: { total: 1, pricedPercent: 400 } }],
    });
    expect(linkedServices(odd)[0].pricedPercent).toBe(100);
  });

  it("is empty on a project with no links", () => {
    expect(linkedServices({})).toEqual([]);
    expect(linkedServices(null)).toEqual([]);
  });
});
