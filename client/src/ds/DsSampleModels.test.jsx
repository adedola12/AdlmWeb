// The reader half of the sample-model library, which had no screen at all.
//
// An admin could upload a Revit model, attach it to a course and publish it; the
// row went published:true; and nothing in the app ever called GET
// /me/demo-models. A student enrolled on the course found nothing, because there
// was nowhere for it to appear.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

let answer = async () => ({ ok: true, items: [] });
const calls = [];

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => {
    calls.push({ path, params: opts?.params, token: opts?.token });
    return answer(path, opts);
  }),
}));
let token = "t";
vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: token }) }));

const { default: DsSampleModels } = await import("./DsSampleModels.jsx");

const model = (extra) => ({
  id: "m1",
  title: "Lekki Tower",
  description: "Seven storeys, fully detailed",
  productKey: "revit",
  purpose: "demo",
  format: "rvt",
  fileName: "lekki-tower.rvt",
  sizeBytes: 314_572_800,
  canDownload: true,
  reason: "",
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  token = "t";
  answer = async () => ({ ok: true, items: [] });
  globalThis.open = vi.fn();
});
afterEach(cleanup);

describe("what a reader sees", () => {
  it("lists a model with its size and what it is for", async () => {
    answer = async () => ({ ok: true, items: [model()] });
    render(<DsSampleModels />);
    await waitFor(() => expect(screen.getByText("Lekki Tower")).toBeTruthy());
    expect(screen.getByText(/300 MB/)).toBeTruthy();
    expect(screen.getByText(/QUIV/)).toBeTruthy();
    expect(screen.getByText("Download")).toBeTruthy();
  });

  it("SHOWS a model it cannot download, with the reason", async () => {
    // Listing is not the gate, downloading is. A student deciding whether to
    // enrol should know the course ships a model; hiding it answers a question
    // nobody asked and loses a sale.
    answer = async () => ({
      ok: true,
      items: [
        model({
          purpose: "course",
          courseTitle: "QUIV for quantity surveyors",
          canDownload: false,
          reason: "This model is part of a course you are not enrolled on.",
        }),
      ],
    });
    render(<DsSampleModels />);
    await waitFor(() => expect(screen.getByText("Lekki Tower")).toBeTruthy());
    expect(screen.getByText(/not enrolled on/)).toBeTruthy();
    expect(screen.queryByText("Download")).toBe(null);
  });

  it("fetches a signed link only when asked, and opens it", async () => {
    answer = async (path) =>
      path.endsWith("/download")
        ? { ok: true, url: "https://storage.example/signed/lekki.rvt" }
        : { ok: true, items: [model()] };
    render(<DsSampleModels />);
    await waitFor(() => expect(screen.getByText("Download")).toBeTruthy());
    // No link is minted on load — that is an expensive call per row.
    expect(calls.some((c) => String(c.path).endsWith("/download"))).toBe(false);

    fireEvent.click(screen.getByText("Download"));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/me/demo-models/m1/download")).toBe(true),
    );
    await waitFor(() =>
      expect(globalThis.open).toHaveBeenCalledWith(
        "https://storage.example/signed/lekki.rvt",
        "_blank",
        "noopener",
      ),
    );
  });

  it("repeats the server's refusal rather than inventing one", async () => {
    answer = async (path) => {
      if (path.endsWith("/download")) throw new Error("Your QUIV subscription has expired.");
      return { ok: true, items: [model()] };
    };
    render(<DsSampleModels />);
    await waitFor(() => expect(screen.getByText("Download")).toBeTruthy());
    fireEvent.click(screen.getByText("Download"));
    await waitFor(() => expect(screen.getByText(/subscription has expired/)).toBeTruthy());
  });

  it("does NOT render a failed read as an empty library", async () => {
    answer = async () => {
      throw new Error("500");
    };
    render(<DsSampleModels />);
    await waitFor(() => expect(screen.getByText(/could not be read/)).toBeTruthy());
    expect(screen.queryByText(/No sample models yet/)).toBe(null);
  });
});

describe("where it is mounted", () => {
  it("asks for one course's models when given a SKU", async () => {
    answer = async () => ({ ok: true, items: [] });
    render(<DsSampleModels courseSku="quiv-101" />);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].path).toBe("/me/demo-models");
    expect(calls[0].params).toEqual({ courseSku: "quiv-101" });
  });

  it("asks for one product's demos when given a product key", async () => {
    render(<DsSampleModels productKey="planswift" />);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].params).toEqual({ productKey: "planswift" });
  });

  it("stays QUIET when there is nothing, so a panel is not drawn empty", async () => {
    const { container } = render(<DsSampleModels quiet />);
    await waitFor(() => expect(calls.length).toBe(1));
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("says a course ships no model when asked to speak up", async () => {
    const { container } = render(<DsSampleModels courseSku="quiv-101" />);
    await waitFor(() => expect(container.textContent).toContain("does not ship a model"));
  });

  it("works for a signed-out visitor, because the list is public", async () => {
    // Asking somebody to sign in to SEE a model is friction for nothing — the
    // server's own listing is open, and the download is where the gate is.
    token = "";
    answer = async () => ({
      ok: true,
      items: [model({ canDownload: false, reason: "Sign in to download this model." })],
    });
    render(<DsSampleModels />);
    await waitFor(() => expect(screen.getByText("Lekki Tower")).toBeTruthy());
    expect(calls[0].token).toBe(undefined);
    expect(screen.getByText(/Sign in to download/)).toBeTruthy();
  });
});
