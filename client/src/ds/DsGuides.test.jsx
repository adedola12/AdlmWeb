// Guides & docs: every guide in data/guides.js is offered, grouped into his
// panels, and each product with videos has a Watch link to YouTube.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("./feedback/feedbackContext.js", () => ({ useFeedback: () => ({ toast: () => {} }) }));
globalThis.fetch = vi.fn(async () => ({ ok: true, headers: { get: () => "1048576" } }));

const { default: DsGuides } = await import("./DsGuides.jsx");
const { GUIDES } = await import("../data/guides.js");

afterEach(cleanup);

const mount = () =>
  render(
    <MemoryRouter>
      <DsGuides />
    </MemoryRouter>,
  );

describe("DsGuides", () => {
  it("lists every published guide once, in three panels", () => {
    mount();
    for (const g of GUIDES) expect(screen.getAllByText(g.title)).toHaveLength(1);
    for (const h of ["Start here", "Products", "ADLM Cloud"]) {
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    }
  });

  it("gives each product with videos a Watch link that opens YouTube", () => {
    mount();
    const watch = screen.getAllByRole("link", { name: "Watch" });
    expect(watch).toHaveLength(GUIDES.filter((g) => g.video).length);
    for (const a of watch) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(a.getAttribute("target")).toBe("_blank");
    }
  });

  it("points SERVIQ and Rate Gen at the playlists the plugins open", () => {
    mount();
    const row = (title) => screen.getByText(title).closest(".dsh-dl");
    expect(within(row("SERVIQ for Revit MEP")).getByRole("link", { name: "Watch" }).getAttribute("href")).toContain(
      "PLk1KkUNE9ZrPCA0Xd0gc7SubdFKagRPog",
    );
    expect(within(row("ADLM Rate Gen")).getByRole("link", { name: "Watch" }).getAttribute("href")).toContain(
      "PLk1KkUNE9ZrO5IPh7p3-5zxfDFs1Dl9b-",
    );
  });

  it("every guide file is a PDF under /docs", () => {
    for (const g of GUIDES) expect(g.file).toMatch(/^\/docs\/[A-Za-z0-9-]+\.pdf$/);
  });
});
