import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Full screen: the project workspace takes the viewport.
//
// "Open the full workspace" used to navigate to /projects/:tool — the OLDER
// screen — which is not what those words mean to anyone reading them. It is a
// mode on this page now, and this is what it rests on: a class on the shell's
// root, and two sheets that act on it.
//
// The DOM half alone would be a weak test — the class could be renamed in the
// stylesheet and the assertion would still pass while the rail stayed on
// screen. So the sheets are read as well. Nothing is hidden by removing it from
// the DOM, deliberately: the rail's own state (its drawer, its counts) survives
// leaving the mode, and a screen reader in full screen still has the route out.

const auth = {
  user: { email: "staff@adlmstudio.net", role: "admin" },
  accessToken: "t",
  clear: () => {},
};
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
vi.mock("../api.js", () => ({ apiAuthed: () => new Promise(() => {}) }));

const DsAppShell = (await import("./DsAppShell.jsx")).default;

afterEach(cleanup);

const shell = (props) =>
  render(
    <MemoryRouter initialEntries={["/work/project/planswift/ikoyi"]}>
      <DsAppShell title="A project" page="work-projects" sectionTabs={false} {...props}>
        <p>screen</p>
      </DsAppShell>
    </MemoryRouter>,
  ).container;

describe("the shell in full screen", () => {
  it("marks the root, so the sheets can act on it", () => {
    expect(shell({ full: true }).querySelector(".ds.dsh-fs")).toBeTruthy();
  });

  it("is off unless asked for", () => {
    expect(shell().querySelector(".dsh-fs")).toBe(null);
    expect(shell({ full: false }).querySelector(".dsh-fs")).toBe(null);
  });

  it("still renders the screen and keeps the rail in the document", () => {
    const c = shell({ full: true });
    expect(c.textContent).toContain("screen");
    // Hidden, not unmounted — see the note above.
    expect(c.querySelector(".dsh-rail")).toBeTruthy();
  });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const css = (f) =>
  fs
    .readFileSync(path.join(HERE, "..", "styles", f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule whose selector mentions the full-screen class. */
function fsRules(file) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css(file)))) {
    const sel = m[1].trim();
    if (sel.includes(".dsh-fs")) out.push({ sel, body: m[2] });
  }
  return out;
}

describe("what full screen actually does to the layout", () => {
  const dash = fsRules("ds-dash.css");

  it("hides the rail and the app bar", () => {
    const hidden = dash
      .filter((r) => /display\s*:\s*none/.test(r.body))
      .map((r) => r.sel)
      .join(" ");
    expect(hidden).toContain(".dsh-rail");
    expect(hidden).toContain(".dsh-top");
  });

  it("drops the two-column grid to one", () => {
    const grid = dash.find((r) => /\.dsh\b(?!-)/.test(r.sel) && /grid-template-columns/.test(r.body));
    expect(grid?.body.replace(/\s/g, "")).toContain("grid-template-columns:1fr");
  });

  it("zeroes the bar height every other rule reserves space for", () => {
    const bar = dash.find((r) => /--dash-bar/.test(r.body));
    expect(bar?.body.replace(/\s/g, "")).toContain("--dash-bar:0px");
  });

  // It used to override .dsh-main's padding, because the project page had no
  // gutter of its own. It has one now — the .dsh-in his work-project.html
  // always had — so a second source of padding here would be two rules to keep
  // in step for one measurement.
  it("does not set a gutter of its own", () => {
    expect(dash.some((r) => /\.dsh-main/.test(r.sel) && /padding/.test(r.body))).toBe(false);
  });

  it("re-sticks his tab strip to the top, where the bar was", () => {
    const tabs = fsRules("ds-work-proj.css").find((r) => r.sel.includes(".pj-tabs"));
    expect(tabs?.body.replace(/\s/g, "")).toContain("top:0");
  });
});
