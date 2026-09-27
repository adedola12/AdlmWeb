import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkProjectHead from "./WorkProjectHead.jsx";
import WorkProjectPeople from "./WorkProjectPeople.jsx";

// His three header controls. The popovers portal to document.body, so these
// query `screen` for their contents and the container for the header itself.

afterEach(cleanup);

const PROJECTS = [
  { _id: "a1", slug: "ikoyi", name: "Ikoyi Complex", client: "Lagos State", stage: "Tender" },
  { _id: "b2", slug: "lekki", name: "Lekki Mall", client: "Pinnacle Ltd", stage: "Construction" },
];

const head = (props = {}) =>
  render(
    <MemoryRouter>
      <WorkProjectHead
        projects={PROJECTS}
        projectId="a1"
        tab="bill"
        fullWorkspaceHref="/projects/planswift?project=a1"
        {...props}
      />
    </MemoryRouter>,
  ).container;

describe("the save indicator", () => {
  it("says what the last save did", () => {
    expect(within(head({ canEdit: true, saveState: "saving" })).getByText("Saving…")).toBeTruthy();
    cleanup();
    expect(
      within(head({ canEdit: true, saveState: "saved" })).getByText("Saved just now"),
    ).toBeTruthy();
  });

  it("offers to re-send a save that failed", () => {
    const onAction = vi.fn();
    const c = head({ canEdit: true, saveState: "failed", onAction });
    expect(within(c).getByText("Not saved")).toBeTruthy();
    fireEvent.click(within(c).getByText("Try again"));
    expect(onAction).toHaveBeenCalledWith("retry");
  });

  it("is absent for a reader who cannot save anything", () => {
    // "Saved" beside a project they cannot edit reads as a claim about somebody
    // else's work.
    expect(head({ canEdit: false }).querySelector(".pj-sync")).toBe(null);
  });

  it("is polite to a screen reader, not assertive", () => {
    expect(
      head({ canEdit: true }).querySelector(".pj-sync").getAttribute("aria-live"),
    ).toBe("polite");
  });
});

describe("jump to project", () => {
  it("lists the other projects, with their stage and client", () => {
    const c = head();
    fireEvent.click(within(c).getByText("Jump to project"));
    const row = screen.getByText("Lekki Mall").closest("button");
    expect(row.textContent).toContain("Construction · Pinnacle Ltd");
  });

  it("does not offer the project being read", () => {
    fireEvent.click(within(head()).getByText("Jump to project"));
    expect(screen.queryByText("Ikoyi Complex")).toBe(null);
  });

  it("narrows as you type", () => {
    fireEvent.click(within(head()).getByText("Jump to project"));
    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "zzz" } });
    expect(screen.getByText("No other project matches.")).toBeTruthy();
  });

  it("says the list is still loading rather than that there is nothing", () => {
    fireEvent.click(within(head({ projects: null })).getByText("Jump to project"));
    expect(screen.getByText("Your projects are still loading.")).toBeTruthy();
  });

  it("closes on Escape", () => {
    fireEvent.click(within(head()).getByText("Jump to project"));
    expect(document.querySelector(".pj-pop")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".pj-pop")).toBe(null);
  });

  it("closes when the same button is pressed again", () => {
    const c = head();
    const btn = within(c).getByText("Jump to project");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(document.querySelector(".pj-pop")).toBe(null);
  });
});

describe("the … overflow", () => {
  const openMore = (props = {}) => {
    const c = head(props);
    fireEvent.click(within(c).getByLabelText("More actions"));
    return c;
  };

  it("offers the owner Collaborators, and a collaborator not", () => {
    openMore({ isOwner: true });
    expect(screen.getByText("Collaborators")).toBeTruthy();
    cleanup();
    openMore({ isOwner: false });
    expect(screen.queryByText("Collaborators")).toBe(null);
  });

  it("reports which entry was chosen", () => {
    const onAction = vi.fn();
    openMore({ onAction });
    fireEvent.click(screen.getByText("Copy project ID"));
    expect(onAction).toHaveBeenCalledWith("id");
  });

  it("closes once something is chosen", () => {
    openMore({ onAction: vi.fn() });
    fireEvent.click(screen.getByText("Project report"));
    expect(document.querySelector(".pj-pop")).toBe(null);
  });

  it("sends the full workspace through as a link, not an action", () => {
    openMore();
    const link = screen.getByText("Open the full workspace");
    expect(link.getAttribute("href")).toBe("/projects/planswift?project=a1");
  });

  it("only ever has one popover open", () => {
    const c = head();
    fireEvent.click(within(c).getByText("Jump to project"));
    fireEvent.click(within(c).getByLabelText("More actions"));
    expect(document.querySelectorAll(".pj-pop")).toHaveLength(1);
    expect(screen.queryByLabelText("Search projects")).toBe(null);
  });
});

describe("the collaborators panel", () => {
  const project = {
    collaborators: [
      { userId: "u1", email: "ebun@adlmstudio.net", accessLevel: "full", addedAt: "2026-09-10" },
      { userId: "u2", email: "richard@adlmstudio.net", accessLevel: "view" },
    ],
    shareCodes: [{ accessLevel: "view" }, { accessLevel: "full", revoked: true }],
  };

  const people = (p = project) =>
    render(
      <MemoryRouter>
        <WorkProjectPeople project={p} fullWorkspaceHref="/projects/planswift?project=a1" />
      </MemoryRouter>,
    ).container;

  it("lists who is on it and what each can do", () => {
    const c = people();
    expect(within(c).getByText("ebun@adlmstudio.net")).toBeTruthy();
    expect(within(c).getByText("Can edit and export")).toBeTruthy();
    expect(within(c).getByText("Can view")).toBeTruthy();
  });

  it("counts only the codes that still work", () => {
    const c = people();
    expect(within(c).getByText("1")).toBeTruthy();
    expect(within(c).getByText(/One code can be used/)).toBeTruthy();
  });

  it("says nobody else is on it rather than showing an empty list", () => {
    const c = people({ collaborators: [], shareCodes: [] });
    expect(within(c).getByText(/Nobody else yet/)).toBeTruthy();
    expect(c.querySelector(".pj-people")).toBe(null);
  });

  it("sends anyone who wants to change access to where the codes live", () => {
    // Access here comes from a share code, not a role field, so the panel does
    // not offer a role dropdown that would misdescribe it.
    const c = people();
    expect(c.querySelector("select")).toBe(null);
    expect(within(c).getByText("Manage codes and access").getAttribute("href")).toBe(
      "/projects/planswift?project=a1",
    );
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => people(null)).not.toThrow();
  });
});
