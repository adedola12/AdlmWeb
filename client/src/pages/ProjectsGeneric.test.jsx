// The tool page's empty grid must name ITS OWN reason.
//
// The grid's three sentences are already covered in
// features/projects/ProjectExplorerGrid.test.jsx. What is covered here is the
// wiring: `loadFailed` was fed from the page's general error banner, which
// carries every failure on the screen — a failed save, a rate sync that would
// not run, a delete that came back short. Any of those, with an empty grid
// underneath, relabelled the grid "your projects could not be listed", which
// was a sentence about the list that the list had not earned.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = vi.fn();

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "test-token", user: { _id: "u1", email: "qs@example.com" } }),
}));
vi.mock("../features/security/useStepUp.jsx", async (orig) => ({
  ...(await orig()),
  useStepUp: () => ({ ensureVerified: async () => "0000" }),
}));
vi.mock("../http.js", async (orig) => ({
  ...(await orig()),
  apiAuthed: (...args) => api(...args),
}));

const { default: ProjectsGeneric } = await import("./ProjectsGeneric.jsx");

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/projects/revit"]}>
      <Routes>
        <Route path="/projects/:tool" element={<ProjectsGeneric />} />
      </Routes>
    </MemoryRouter>,
  );

const project = (id, name) => ({ _id: id, name, items: [], updatedAt: "2026-09-01T00:00:00.000Z" });

beforeEach(() => {
  api.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the tool page's empty project grid", () => {
  it("says the list failed when the list is what failed", async () => {
    api.mockImplementation((path) => {
      if (String(path).startsWith("/projects/revit/storage")) return Promise.resolve(null);
      if (String(path).includes("entitlements")) return Promise.resolve({ items: [] });
      return Promise.reject(new Error("Network request failed"));
    });

    mount();

    expect(await screen.findByText("Your projects could not be listed")).toBeTruthy();
  });

  it("does not blame the list for a failure that came from somewhere else", async () => {
    // The list loads perfectly. A later action — here a bulk delete that the
    // server refuses — puts a message in the page's error banner, and a
    // search then empties the grid. The grid must say why IT is empty.
    api.mockImplementation((path, opts = {}) => {
      const p = String(path);
      if (p.startsWith("/projects/revit/storage")) return Promise.resolve(null);
      if (p.includes("entitlements")) return Promise.resolve({ items: [] });
      // The read-only learning samples are their own endpoint and their own
      // strip on the page. Without this the catch-all below answered that call
      // too, so the same two projects rendered twice — once in the grid, once
      // as samples — and every getByText in here found two of everything.
      if (p.endsWith("/samples")) return Promise.resolve([]);
      if (opts.method === "DELETE") return Promise.reject(new Error("Could not delete"));
      return Promise.resolve([project("p1", "Ikoyi tower"), project("p2", "Lekki annexe")]);
    });

    mount();
    await screen.findByText("Ikoyi tower");

    fireEvent.click(screen.getByTitle("Select all projects in this view"));
    fireEvent.click(screen.getByTitle("Delete selected"));

    // The page's general banner now carries a failure that has nothing to do
    // with listing the projects.
    await screen.findByText(/Deleted 0\. Failed 2\./);

    fireEvent.change(screen.getByLabelText("Search projects"), {
      target: { value: "nothing matches this" },
    });

    await waitFor(() => expect(screen.getByText("No project matches")).toBeTruthy());
    expect(screen.queryByText("Your projects could not be listed")).toBeNull();
  });

  it("stops blaming the list once the list loads", async () => {
    let attempt = 0;
    api.mockImplementation((path) => {
      const p = String(path);
      if (p.startsWith("/projects/revit/storage")) return Promise.resolve(null);
      if (p.includes("entitlements")) return Promise.resolve({ items: [] });
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error("Network request failed")) : Promise.resolve([]);
    });

    mount();
    await screen.findByText("Your projects could not be listed");

    fireEvent.click(screen.getByText("Refresh projects"));

    await waitFor(() => expect(screen.getByText("No projects yet")).toBeTruthy());
    expect(screen.queryByText("Your projects could not be listed")).toBeNull();
  });
});
