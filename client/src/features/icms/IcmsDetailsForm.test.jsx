import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const apiAuthed = vi.fn();
vi.mock("../../http.js", () => ({ apiAuthed: (...a) => apiAuthed(...a) }));

import IcmsDetailsForm from "./IcmsDetailsForm.jsx";

// The report the server sends from GET /projectsboq/:tool/:id/icms, cut to what
// the form reads: the attributes (stated or assumed) and perM2.
const stated = (value) => ({ value, stated: true });
const assumed = (value) => ({ value, stated: false });

const report = (over = {}) => ({
  ok: true,
  attributes: {
    projectType: assumed("01"),
    country: assumed("NG"),
    currency: assumed("NGN"),
    baseDate: assumed("2026-10-08"),
    priceBasis: assumed("Current prices at the base date"),
    projectStatus: assumed("Estimate"),
    location: assumed(""),
    gfaIpms1: assumed(null),
    gfaIpms2: assumed(null),
    carbonBoundary: assumed("Up front carbon (A1-A5)"),
    ...(over.attributes || {}),
  },
  perM2: over.perM2 ?? null,
});

const form = (props = {}) =>
  render(
    <IcmsDetailsForm productKey="revit" projectId="66f1a2b3c4d5e6f7a8b9c0d1" accessToken="t" canEdit {...props} />,
  );

const field = (name) => screen.getByLabelText(name);

beforeEach(() => apiAuthed.mockReset());
afterEach(cleanup);

describe("the ICMS details form", () => {
  it("reads the details from the report route and offers every field", async () => {
    apiAuthed.mockResolvedValueOnce(report({ attributes: { country: stated("GH") } }));
    form();
    await screen.findByLabelText("Country");
    expect(apiAuthed).toHaveBeenCalledWith("/projectsboq/revit/66f1a2b3c4d5e6f7a8b9c0d1/icms", { token: "t" });
    for (const label of [
      "Asset type",
      "Project stage",
      "Location",
      "Country",
      "Currency",
      "Base date",
      "Price basis",
      "Gross external area, IPMS 1 (m2)",
      "Gross internal area, IPMS 2 (m2)",
      "Carbon boundary",
    ]) {
      expect(field(label)).toBeTruthy();
    }
    expect(field("Country").value).toBe("GH");
    // Assumed, so blank, with the assumption shown.
    expect(field("Currency").value).toBe("");
    expect(field("Currency").getAttribute("placeholder")).toBe("NGN");
  });

  it("says what is wrong before saving, and does not send it", async () => {
    apiAuthed.mockResolvedValueOnce(report());
    form();
    fireEvent.change(await screen.findByLabelText("Currency"), { target: { value: "NAIRA" } });
    expect(screen.getByText("Currency must be a three-letter ISO 4217 code, e.g. NGN.")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save ICMS details" });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(apiAuthed).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal in its own words", async () => {
    apiAuthed.mockResolvedValueOnce(report());
    apiAuthed.mockRejectedValueOnce(new Error("You do not have edit access to this project."));
    form();
    fireEvent.change(await screen.findByLabelText("Country"), { target: { value: "ng" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ICMS details" }));
    expect(await screen.findByText("You do not have edit access to this project.")).toBeTruthy();
  });

  it("gives cost and carbon per m2 once the floor areas are saved", async () => {
    apiAuthed.mockResolvedValueOnce(report());
    apiAuthed.mockResolvedValueOnce({ ok: true });
    apiAuthed.mockResolvedValueOnce(
      report({
        attributes: { gfaIpms1: stated(1200), gfaIpms2: stated(1000) },
        perM2: { basis: "IPMS 2 (gross internal)", area: 1000, cost: 250000, carbonKg: 480.25 },
      }),
    );
    const onSaved = vi.fn();
    form({ onSaved });

    await screen.findByLabelText("Country");
    expect(screen.getByTestId("icms-per-m2").textContent).toMatch(/Blank until a floor area is saved/);

    fireEvent.change(field("Gross external area, IPMS 1 (m2)"), { target: { value: "1200" } });
    fireEvent.change(field("Gross internal area, IPMS 2 (m2)"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ICMS details" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [path, init] = apiAuthed.mock.calls[1];
    expect(path).toBe("/projectsboq/revit/66f1a2b3c4d5e6f7a8b9c0d1/icms");
    expect(init.method).toBe("PUT");
    expect(init.body).toMatchObject({ projectType: "01", gfaIpms1: 1200, gfaIpms2: 1000, country: "", currency: "" });

    const box = screen.getByTestId("icms-per-m2").textContent;
    expect(box).toMatch(/IPMS 2 \(gross internal\), 1,000 m2/);
    expect(box).toMatch(/NGN 250,000 per m2/);
    expect(box).toMatch(/480\.3 kgCO2e per m2/);
    expect(screen.getByText("Saved. The next ICMS 3 export uses these details.")).toBeTruthy();
  });

  it("is read-only on a sample project, with no save button", async () => {
    apiAuthed.mockResolvedValueOnce(report());
    form({ canEdit: false, readOnlyReason: "sample" });
    expect(await screen.findByText(/This is a sample project/)).toBeTruthy();
    expect(field("Country").disabled).toBe(true);
    expect(field("Asset type").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save ICMS details" })).toBe(null);
  });

  it("is read-only for a collaborator who cannot edit", async () => {
    apiAuthed.mockResolvedValueOnce(report());
    form({ canEdit: false });
    expect(await screen.findByText(/You have view access to this project/)).toBeTruthy();
    expect(field("Gross internal area, IPMS 2 (m2)").disabled).toBe(true);
  });

  it("says so when the details cannot be read", async () => {
    apiAuthed.mockRejectedValueOnce(new Error("This project's rates are not visible to you."));
    form();
    expect(await screen.findByText("This project's rates are not visible to you.")).toBeTruthy();
  });
});
