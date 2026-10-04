// The Material Constants library, in his design.
//
// This screen decides what every budget is made of — the mixes, the waste
// factors, the labour and plant outputs. The things that go wrong here are
// quiet and expensive:
//
//   * a failed read rendered as an empty library, telling a firm their own
//     standards are gone;
//   * an out-of-range figure saved anyway, producing a schedule nobody can
//     explain;
//   * a reset offered on a row that is already the default, which does nothing
//     and reads as a broken button;
//   * saving and then saying nothing about Rebuild schedule, so the change
//     appears to have done nothing at all.
//
// Each of those is a test.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.fn();
vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "t", user: { _id: "u1" } }),
}));
vi.mock("../http.js", async (orig) => ({
  ...(await orig()),
  apiAuthed: (...a) => api(...a),
}));

const { default: DsConstants } = await import("./DsConstants.jsx");

const LIBRARY = {
  groups: ["Concrete", "Blockwork"],
  constants: [
    {
      key: "Concrete.1:2:4.CementBagsPerM3",
      label: "Cement in 1:2:4 concrete",
      group: "Concrete",
      value: 6.65,
      def: 6.65,
      unit: "bags/m³",
      min: 4,
      max: 10,
      isDefault: true,
    },
    {
      key: "Concrete.Waste",
      label: "Concrete waste",
      group: "Concrete",
      value: 7.5,
      def: 5,
      unit: "%",
      min: 0,
      max: 25,
      isDefault: false,
    },
    {
      key: "Blockwork.BlocksPerM2",
      label: "Blocks per m²",
      group: "Blockwork",
      value: 10,
      def: 10,
      unit: "no/m²",
      min: 8,
      max: 14,
      isDefault: true,
    },
  ],
};

const mount = () =>
  render(
    <MemoryRouter>
      <DsConstants />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(LIBRARY);
});
afterEach(cleanup);

describe("the library", () => {
  it("groups the constants the way the server does", async () => {
    mount();
    expect(await screen.findByText("Concrete")).toBeTruthy();
    expect(screen.getByText("Blockwork")).toBeTruthy();
    expect(screen.getByText("Cement in 1:2:4 concrete")).toBeTruthy();
  });

  it("shows the ADLM default beside the firm's own value", async () => {
    // The whole point of the screen: you can see what you changed it FROM.
    mount();
    await screen.findByText("Concrete waste");
    const row = screen.getByLabelText("Concrete waste").closest(".wk-row");
    expect(row.textContent).toContain("5"); // the default
    expect(screen.getByLabelText("Concrete waste").value).toBe("7.5");
  });

  it("marks which rows are the firm's own", async () => {
    mount();
    await screen.findByText("Concrete waste");
    expect(screen.getAllByText("yours").length).toBe(1);
  });

  it("counts how much of the library the firm has taken over", async () => {
    mount();
    expect(await screen.findByText(/1 yours/)).toBeTruthy();
  });
});

describe("editing", () => {
  it("refuses to save a figure outside its range, and says the range", async () => {
    mount();
    await screen.findByText("Concrete waste");
    fireEvent.change(screen.getByLabelText("Concrete waste"), { target: { value: "90" } });

    expect(await screen.findByText("0 to 25")).toBeTruthy();
    expect(screen.getByText("Save changes").disabled).toBe(true);
    // And it explains why saving is held, rather than just greying out.
    expect(screen.getByText(/outside its range/i)).toBeTruthy();
  });

  it("saves only what was typed, as numbers", async () => {
    mount();
    await screen.findByText("Concrete waste");
    fireEvent.change(screen.getByLabelText("Concrete waste"), { target: { value: "9" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      const put = api.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(put).toBeTruthy();
      expect(JSON.parse(put[1].body)).toEqual({ values: { "Concrete.Waste": 9 } });
    });
  });

  it("says a saved constant does nothing until a project is rebuilt", async () => {
    // Without this the screen looks like it did nothing: no figure anywhere
    // else moves until the schedule is regenerated.
    mount();
    await screen.findByText("Concrete waste");
    fireEvent.change(screen.getByLabelText("Concrete waste"), { target: { value: "9" } });
    fireEvent.click(screen.getByText("Save changes"));
    expect(await screen.findByText(/Rebuild schedule/)).toBeTruthy();
  });

  it("has nothing to save until something is typed", async () => {
    mount();
    await screen.findByText("Concrete waste");
    expect(screen.getByText("Save changes").disabled).toBe(true);
  });
});

describe("resetting", () => {
  it("offers a reset only where there is an override to remove", async () => {
    // A reset on a row that is already the default does nothing, and a control
    // that does nothing reads as one that failed.
    mount();
    await screen.findByText("Concrete waste");
    expect(screen.getAllByTitle(/Back to the ADLM default/).length).toBe(1);
  });

  it("resets one row by its key", async () => {
    mount();
    await screen.findByText("Concrete waste");
    fireEvent.click(screen.getByLabelText("Reset Concrete waste to the ADLM default"));
    await waitFor(() => {
      const del = api.mock.calls.find((c) => c[1]?.method === "DELETE");
      expect(del[0]).toBe("/me/material-constants/Concrete.Waste");
    });
  });

  it("will not offer 'reset all' when nothing is overridden", async () => {
    api.mockResolvedValue({
      groups: ["Concrete"],
      constants: [{ ...LIBRARY.constants[0] }],
    });
    mount();
    await screen.findByText("Cement in 1:2:4 concrete");
    expect(screen.getByText("Reset all to ADLM").disabled).toBe(true);
  });
});

describe("searching", () => {
  it("filters on the label and on the key", async () => {
    mount();
    await screen.findByText("Concrete waste");

    fireEvent.change(screen.getByLabelText("Search constants"), { target: { value: "blocks" } });
    expect(screen.queryByText("Concrete waste")).toBeNull();
    expect(screen.getByText("Blocks per m²")).toBeTruthy();

    // The key is how a QUIV or HERON user finds the same constant they see on
    // the desktop, so it has to match too.
    fireEvent.change(screen.getByLabelText("Search constants"), {
      target: { value: "CementBags" },
    });
    expect(screen.getByText("Cement in 1:2:4 concrete")).toBeTruthy();
  });

  it("says nothing matched rather than showing an empty library", async () => {
    mount();
    await screen.findByText("Concrete waste");
    fireEvent.change(screen.getByLabelText("Search constants"), { target: { value: "zzzz" } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });
});

describe("when the read fails", () => {
  it("is not reported as an empty library", async () => {
    // Telling a firm their standards are gone because the network blinked is
    // the worst thing this screen could do.
    api.mockImplementation(() => {
      const p = Promise.reject(new Error("Network request failed"));
      p.catch(() => {});
      return p;
    });
    mount();
    expect(await screen.findByText("Could not be read")).toBeTruthy();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });
});
