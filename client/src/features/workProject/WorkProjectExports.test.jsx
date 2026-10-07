import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkProjectExports from "./WorkProjectExports.jsx";

// exportModel.test.js pins WHICH documents are offered. These pin what the panel
// does with the answer — in particular the two things a failed export must do:
// keep its message on screen (the server's message is the only instruction the
// QS gets) and keep it against the row it belongs to.

const EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const job = (over = {}) => ({
  name: "Ikoyi Complex",
  items: [{ code: "BQ-1", description: "Excavate", unit: "m3", qty: 10, rate: 1000 }],
  certificates: [{ number: 2 }],
  ...over,
});

const panel = (project = job()) =>
  render(
    <MemoryRouter>
      <WorkProjectExports
        project={project}
        productKey="revit"
        saveId="66f1a2b3c4d5e6f7a8b9c0d1"
        accessToken="t"
        classicHref="/projects/revit?project=x&classic=1"
      />
    </MemoryRouter>,
  ).container;

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
  globalThis.URL.revokeObjectURL = vi.fn();
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    const el = realCreate(tag);
    if (tag === "a") el.click = () => {};
    return el;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ok = () => ({
  ok: true,
  headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? EXCEL : null) },
  blob: async () => new Blob(["PK"]),
  text: async () => "PK",
});

describe("the export panel", () => {
  it("lists the bill workbooks and the certificate, each with its own button", () => {
    const c = panel();
    expect(within(c).getByText("Bill of quantities, elemental")).toBeTruthy();
    expect(within(c).getByText("Bill of quantities, by trade")).toBeTruthy();
    expect(within(c).getByText("The bill as measured, with its budget")).toBeTruthy();
    expect(within(c).getByText("Payment certificate 2")).toBeTruthy();
  });

  it("separates the bill from the payment documents", () => {
    const c = panel();
    expect(within(c).getByText("The bill")).toBeTruthy();
    expect(within(c).getByText("Payment documents")).toBeTruthy();
  });

  it("asks the server for the document that was clicked", async () => {
    const fetchSpy = vi.fn(async () => ok());
    globalThis.fetch = fetchSpy;
    const c = panel();
    fireEvent.click(within(c).getByText("Payment certificate 2"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      "/projects/revit/66f1a2b3c4d5e6f7a8b9c0d1/certificates/2/export",
    );
  });

  it("keeps the server's refusal on screen, against the row it refused", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      headers: { get: () => null },
      blob: async () => new Blob([]),
      text: async () =>
        JSON.stringify({ error: "A RateGen subscription is required to export priced documents." }),
    }));
    const c = panel();
    fireEvent.click(within(c).getByText("Payment certificate 2"));
    await waitFor(() =>
      expect(
        within(c).getByText("A RateGen subscription is required to export priced documents."),
      ).toBeTruthy(),
    );
    // And the other rows still describe themselves rather than wearing the error.
    expect(
      within(c).getByText(/The bill cut against the elemental mapping/),
    ).toBeTruthy();
  });

  it("clears a row's old error when it is tried again", async () => {
    let fail = true;
    globalThis.fetch = vi.fn(async () =>
      fail
        ? {
            ok: false,
            status: 500,
            headers: { get: () => null },
            blob: async () => new Blob([]),
            text: async () => JSON.stringify({ error: "Server error" }),
          }
        : ok(),
    );
    const c = panel();
    const btn = within(c).getByText("Payment certificate 2");
    fireEvent.click(btn);
    await waitFor(() => expect(within(c).getByText("Server error")).toBeTruthy());
    fail = false;
    fireEvent.click(within(c).getByText("Payment certificate 2"));
    await waitFor(() => expect(within(c).queryByText("Server error")).toBe(null));
  });

  it("says why there is nothing, not just that there is nothing", () => {
    // Three different causes, and "nothing to export" would be wrong for two.
    const masked = panel(job({ _access: { canSeeRates: false } }));
    expect(within(masked).getByText(/rates are not visible to you/)).toBeTruthy();
    cleanup();
    const empty = panel(job({ items: [], certificates: [] }));
    expect(within(empty).getByText(/no bill on this project yet/)).toBeTruthy();
    cleanup();
    const loading = render(
      <MemoryRouter>
        <WorkProjectExports project={null} productKey="revit" saveId="x" accessToken="t" />
      </MemoryRouter>,
    ).container;
    expect(within(loading).getByText(/still loading/)).toBeTruthy();
  });

  it("says where the one workbook it does not have went", () => {
    // The generic BoQ is 375 lines of SheetJS in the browser. Saying nothing
    // would leave a QS hunting a document that is one link away.
    const c = panel();
    const link = within(c).getByText("classic workspace");
    expect(link.getAttribute("href")).toBe("/projects/revit?project=x&classic=1");
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() =>
      render(
        <MemoryRouter>
          <WorkProjectExports project={null} productKey="" saveId="" accessToken="" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
