// Linking an MEP bill from the Services tab.
//
// The tab used to end at "Linking is done in the classic workspace" — a
// sentence naming a place, with no way to get there. The owner asked for a
// button "if its available", and available is three conditions the server
// already enforces (server/routes/projects.js, addLinkedProject ~:7990):
//
//   * the PARENT is a QUIV or HERON project — any other productKey is refused;
//   * the parent is not BoQ-imported — linking merges by model element and a
//     BoQ import has no model, so the route answers 403;
//   * the user owns at least one MEP project that is not already linked.
//
// A button that leads to a 400, a 403 or a 409 is worse than no button, so each
// of those is a test below. The one that would hurt most if it regressed is the
// viewer case: offering an action to somebody without edit access makes the
// product look broken at exactly the moment they are being told they cannot
// edit.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const api = vi.fn();
vi.mock("../../http.js", async (orig) => ({
  ...(await orig()),
  apiAuthed: (...a) => api(...a),
}));

const { WorkProjectServices } = await import("./WorkProjectSources.jsx");

const CANDIDATES = {
  ok: true,
  candidates: [
    { projectId: "mep1", name: "Ikoyi — M&E", productKey: "mep", total: 18_500_000 },
    { projectId: "mep2", name: "Lekki services", productKey: "mep", total: 4_250_000 },
  ],
};

const base = {
  project: {},
  canEdit: true,
  productKey: "revit",
  projectId: "parent1",
  accessToken: "t",
};

const mount = (over = {}) => render(<WorkProjectServices {...base} {...over} />);

beforeEach(() => {
  api.mockClear();
  api.mockResolvedValue(CANDIDATES);
});
afterEach(cleanup);

describe("when an MEP bill is available to link", () => {
  it("offers the button", async () => {
    mount();
    expect(await screen.findByText("Link MEP bill")).toBeTruthy();
  });

  it("asks only for this project's candidates, on the right route", async () => {
    mount();
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(api.mock.calls[0][0]).toBe("/projects/revit/parent1/linked-candidates");
  });

  it("links the chosen one and takes the server's updated project", async () => {
    const onLinked = vi.fn();
    mount({ onLinked });
    fireEvent.click(await screen.findByText("Link MEP bill"));

    const updated = { _id: "parent1", linkedProjects: [{ projectId: "mep2" }] };
    api.mockResolvedValueOnce(updated);
    fireEvent.change(screen.getByLabelText("MEP project to link"), {
      target: { value: "mep2" },
    });
    fireEvent.click(screen.getByText("Link it"));

    await waitFor(() => expect(onLinked).toHaveBeenCalledWith(updated));
    const post = api.mock.calls.at(-1);
    expect(post[0]).toBe("/projects/revit/parent1/linked-projects");
    expect(post[1].method).toBe("POST");
    expect(post[1].data).toEqual({ targetProjectId: "mep2" });
  });

  it("will not post with nothing chosen", async () => {
    mount();
    fireEvent.click(await screen.findByText("Link MEP bill"));
    expect(screen.getByText("Link it").disabled).toBe(true);
  });

  it("says so when the link is refused, instead of going quiet", async () => {
    mount();
    fireEvent.click(await screen.findByText("Link MEP bill"));
    api.mockRejectedValueOnce(new Error("That project is already linked"));
    fireEvent.change(screen.getByLabelText("MEP project to link"), {
      target: { value: "mep1" },
    });
    fireEvent.click(screen.getByText("Link it"));
    expect(await screen.findByText(/already linked/i)).toBeTruthy();
  });
});

describe("when it is not available, the button is not offered", () => {
  it("not to a viewer — they would get a 403", async () => {
    mount({ canEdit: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Link MEP bill")).toBeNull();
    // And nothing is even asked for on their behalf.
    expect(api).not.toHaveBeenCalled();
  });

  it("not on a BoQ-imported project — the route answers 403", async () => {
    mount({ project: { origin: "boq-import" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Link MEP bill")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("not on a parent the route refuses outright", async () => {
    // Only revit (QUIV) and planswift (HERON) may take linked services.
    for (const productKey of ["mep", "civil3d", "qs-takeoff"]) {
      cleanup();
      api.mockClear();
      mount({ productKey });
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText("Link MEP bill")).toBeNull();
      expect(api).not.toHaveBeenCalled();
    }
  });

  it("not when the user has no MEP projects at all", async () => {
    api.mockResolvedValue({ ok: true, candidates: [] });
    mount();
    await screen.findByText(/Nothing of yours is measured in Revit MEP yet/);
    expect(screen.queryByText("Link MEP bill")).toBeNull();
  });

  it("not when every candidate is already linked", async () => {
    // The server would answer 409. Showing the button anyway is a dead end.
    api.mockResolvedValue({ ok: true, candidates: [CANDIDATES.candidates[0]] });
    mount({
      project: { linkedProjects: [{ projectId: "mep1", linkType: "sum", label: "Ikoyi — M&E" }] },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Link MEP bill")).toBeNull();
  });
});

describe("a failed candidates read", () => {
  it("is not reported as having no MEP projects", async () => {
    // The repeated mistake in this codebase: catching a failure to an empty
    // list and then stating the empty case as fact.
    api.mockImplementation(() => {
      const p = Promise.reject(new Error("Network request failed"));
      p.catch(() => {});
      return p;
    });
    mount();
    expect(await screen.findByText(/could not check for services projects/i)).toBeTruthy();
    expect(screen.queryByText(/Nothing of yours is measured/)).toBeNull();
    expect(screen.queryByText("Link MEP bill")).toBeNull();
  });
});

describe("the classic workspace stays reachable", () => {
  it("as a real link, because uploading an MEP bill is still done there", async () => {
    api.mockResolvedValue({ ok: true, candidates: [] });
    const href = "/projects/revit?project=parent1&classic=1";
    mount({ classicHref: href });
    const link = await screen.findByText("the classic workspace");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(href);
  });
});
