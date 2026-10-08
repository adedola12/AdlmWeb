import { describe, it, expect } from "vitest";
import {
  ICMS_FIELDS,
  canEditIcms,
  draftFromAttributes,
  icmsBodyFrom,
  icmsDraftProblem,
  icmsPath,
  perM2Lines,
  placeholdersFrom,
} from "./icmsDetails.js";

// The rules are the server's (icmsDetailsFromBody, server/util/icmsExport.js).
// These pin that the form says the same thing before the round trip.

const stated = (value) => ({ value, stated: true });
const assumed = (value) => ({ value, stated: false });

const ok = {
  projectType: "01",
  country: "NG",
  currency: "NGN",
  baseDate: "2026-10-01",
  projectStatus: "",
  priceBasis: "",
  location: "",
  gfaIpms1: "1200",
  gfaIpms2: "1000",
  carbonBoundary: "",
};

describe("the ICMS details draft", () => {
  it("fills only what the project states, and shows the rest as the report's assumption", () => {
    const attributes = {
      projectType: assumed("01"),
      country: stated("GH"),
      currency: assumed("NGN"),
      baseDate: assumed("2026-10-08"),
      gfaIpms1: assumed(null),
      gfaIpms2: stated(950),
      carbonBoundary: assumed("Up front carbon (A1-A5)"),
    };
    const d = draftFromAttributes(attributes);
    expect(d.country).toBe("GH");
    expect(d.currency).toBe("");
    expect(d.gfaIpms2).toBe("950");
    expect(d.gfaIpms1).toBe("");
    expect(d.projectType).toBe("01");
    const p = placeholdersFrom(attributes);
    expect(p.currency).toBe("NGN");
    expect(p.baseDate).toBe("2026-10-08");
    expect(p.gfaIpms1).toBe("");
    expect(p.country).toBe("");
  });

  it("accepts a complete, sensible set", () => {
    expect(icmsDraftProblem(ok)).toBe("");
    expect(icmsDraftProblem({ ...ok, country: "", currency: "", baseDate: "", gfaIpms1: "", gfaIpms2: "" })).toBe("");
  });

  it("refuses what the server refuses, in its words", () => {
    expect(icmsDraftProblem({ ...ok, projectType: "99" })).toMatch(/asset type/);
    expect(icmsDraftProblem({ ...ok, country: "NIG" })).toBe("Country must be a two-letter ISO 3166 code, e.g. NG.");
    expect(icmsDraftProblem({ ...ok, currency: "NAIRA" })).toBe("Currency must be a three-letter ISO 4217 code, e.g. NGN.");
    expect(icmsDraftProblem({ ...ok, baseDate: "01/10/2026" })).toBe("Base date must be a date, YYYY-MM-DD.");
    expect(icmsDraftProblem({ ...ok, gfaIpms1: "-5" })).toBe("Gross external area must be a positive number of m2.");
    expect(icmsDraftProblem({ ...ok, gfaIpms2: "0" })).toBe("Gross internal area must be a positive number of m2.");
    expect(icmsDraftProblem({ ...ok, gfaIpms1: "20000000" })).toMatch(/positive number/);
  });

  it("catches two floor areas typed into each other's box", () => {
    expect(icmsDraftProblem({ ...ok, gfaIpms1: "900", gfaIpms2: "1000" })).toMatch(/cannot be larger/);
  });

  it("sends every field the server reads, codes upper-cased and areas as numbers", () => {
    const body = icmsBodyFrom({ ...ok, country: "ng", currency: "ngn", gfaIpms1: "" });
    expect(Object.keys(body).sort()).toEqual([...ICMS_FIELDS].sort());
    expect(body.country).toBe("NG");
    expect(body.currency).toBe("NGN");
    expect(body.gfaIpms1).toBe(null);
    expect(body.gfaIpms2).toBe(1000);
  });
});

describe("per m2", () => {
  it("is null until a floor area is in the report", () => {
    expect(perM2Lines({ perM2: null })).toBe(null);
    expect(perM2Lines({})).toBe(null);
  });

  it("reads the report's figures in its currency", () => {
    const lines = perM2Lines({
      attributes: { currency: stated("NGN") },
      perM2: { basis: "IPMS 2 (gross internal)", area: 1000, cost: 412345.67, carbonKg: 512.34 },
    });
    expect(lines.basis).toBe("IPMS 2 (gross internal), 1,000 m2");
    expect(lines.cost).toBe("NGN 412,346 per m2");
    expect(lines.carbon).toBe("512.3 kgCO2e per m2");
  });
});

describe("who may change them", () => {
  it("is the owner or a full collaborator, never a sample or a view-only share", () => {
    expect(canEditIcms({ _access: { canEdit: true } })).toBe(true);
    expect(canEditIcms({})).toBe(true);
    expect(canEditIcms({ isSample: true, _access: { canEdit: false } })).toBe(false);
    expect(canEditIcms({ isSample: true })).toBe(false);
    expect(canEditIcms({ _access: { canEdit: false } })).toBe(false);
    expect(canEditIcms(null)).toBe(false);
  });

  it("writes to the route the server mounts", () => {
    expect(icmsPath("Revit", "64f0")).toBe("/projectsboq/revit/64f0/icms");
  });
});
