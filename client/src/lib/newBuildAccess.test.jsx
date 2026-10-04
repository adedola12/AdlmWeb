// After go-live a customer lands on the new pages — from every door, not just
// the route.
//
// The 1 October go-live lowered the route gate and left four other places
// asking canViewPreview(user) for themselves: the rail and account menu in
// DsAppShell, the project cards (useProjectHref) and the
// /projects/:tool?project= redirect (ClassicProjectRedirect). So the routes were
// open, and every link a customer could click still went to classic: Projects to
// /portfolio, Billing to /profile, Overview to /dashboard, each project card to
// the classic workspace. These tests render each surface as a CUSTOMER, because
// staff were always fine and a staff-only test would have passed throughout.

import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const CUSTOMER = { _id: "c1", email: "qs@firm.ng", role: "user", permissions: [] };

let auth = { user: CUSTOMER, accessToken: "t", clear: () => {} };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
vi.mock("../api.js", () => ({ apiAuthed: () => new Promise(() => {}) }));

const { GATE_NEW_BUILD, seesNewBuild } = await import("./newBuildAccess.js");
const { useProjectHref } = await import("./useProjectHref.js");
const { default: DsAppShell } = await import("../ds/DsAppShell.jsx");
const { default: ClassicProjectRedirect } = await import(
  "../components/ClassicProjectRedirect.jsx"
);
const { default: NewBuildGate } = await import("../components/NewBuildGate.jsx");

afterEach(() => {
  cleanup();
  auth = { user: CUSTOMER, accessToken: "t", clear: () => {} };
});

describe("the go-live switch", () => {
  it("is down — the new build is the build", () => {
    expect(GATE_NEW_BUILD).toBe(false);
  });

  it("is the only switch: no file keeps a copy of its own", () => {
    // Two switches is how the gate came down at go-live and the links did not.
    const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const gate = fs.readFileSync(path.join(SRC, "components", "NewBuildGate.jsx"), "utf8");
    expect(gate).toMatch(/import \{[^}]*GATE_NEW_BUILD[^}]*\} from "\.\.\/lib\/newBuildAccess\.js"/);
    expect(gate).not.toMatch(/(const|let|var)\s+GATE_NEW_BUILD\b/);
  });

  it("sends a customer, staff and Tech Support alike to the new build", () => {
    expect(seesNewBuild(CUSTOMER)).toBe(true);
    expect(seesNewBuild({ role: "admin" })).toBe(true);
    expect(seesNewBuild({ role: "tech_support", permissions: ["preview"] })).toBe(true);
  });
});

describe("the rail and account menu, as a customer sees them", () => {
  // The classic pages the pre-launch rewrite sent customers to. None of them
  // should be the target of a rail or menu link any more.
  const CLASSIC = [
    "/portfolio",
    "/projects/revit",
    "/projects/planswift",
    "/projects/mep",
    "/projects/civil3d",
    "/rategen",
    "/rategen/material-constants",
    "/profile",
    "/support/request",
    "/whats-new",
    "/dashboard",
  ];

  const hrefs = () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/work"]}>
        <DsAppShell title="Overview" page="work-home">
          <p>screen</p>
        </DsAppShell>
      </MemoryRouter>,
    );
    return [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
  };

  it("links to the new pages", () => {
    const got = hrefs();
    for (const to of [
      "/work",
      "/work/projects",
      "/work/library",
      "/work/constants",
      "/manage",
      "/manage/team",
      "/manage/billing",
      "/manage/downloads",
      "/manage/guides",
      "/manage/support",
      "/manage/settings",
    ]) {
      expect(got, to).toContain(to);
    }
  });

  it("links to none of the classic pages it used to rewrite them to", () => {
    const got = hrefs();
    expect(got.filter((h) => CLASSIC.includes(h.split("?")[0]))).toEqual([]);
  });
});

describe("project cards, as a customer sees them", () => {
  function Probe({ project }) {
    const href = useProjectHref();
    return <a href={href(project)}>go</a>;
  }
  const hrefFor = (project) =>
    render(<Probe project={project} />).container.querySelector("a").getAttribute("href");

  it("open Richard's project page", () => {
    expect(hrefFor({ productKey: "revit", slug: "ikoyi" })).toBe("/work/project/revit/ikoyi");
  });

  it("still send ArchiCAD to its own screen — it has no /work/project page", () => {
    expect(hrefFor({ productKey: "archicad", slug: "tower" })).toBe("/archicad/tower/boq");
  });
});

describe("a classic project URL, opened by a customer", () => {
  // Bookmarks, share links, the Portfolio list and old emails all arrive at
  // /projects/:tool?project=… without going through a card.
  const open = (url) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/projects/:tool"
            element={
              <ClassicProjectRedirect>
                <div>CLASSIC</div>
              </ClassicProjectRedirect>
            }
          />
          <Route path="/work/project/:productKey/:id" element={<div>NEW PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it("goes to the new project page", () => {
    open("/projects/planswift?project=ikoyi");
    expect(screen.getByText("NEW PAGE")).toBeTruthy();
  });

  it("stays on classic when classic was asked for on purpose", () => {
    // The project page's "Open the classic workspace" — pricing, the Excel
    // export and the budget editor still live there. Without this the two
    // screens would bounce a reader between them.
    open("/projects/planswift?project=ikoyi&classic=1");
    expect(screen.getByText("CLASSIC")).toBeTruthy();
  });

  it("stays on the tool's list when no project is named", () => {
    open("/projects/planswift");
    expect(screen.getByText("CLASSIC")).toBeTruthy();
  });
});

describe("/work/programme, opened by a customer", () => {
  it("renders the programme, not a redirect", () => {
    render(
      <MemoryRouter initialEntries={["/work/programme"]}>
        <Routes>
          <Route
            path="/work/programme"
            element={
              <NewBuildGate>
                <div>PROGRAMME</div>
              </NewBuildGate>
            }
          />
          <Route path="/time-management" element={<div>CLASSIC</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("PROGRAMME")).toBeTruthy();
  });
});

describe("nobody asks the staff-only question for themselves again", () => {
  // The bug was four private copies of canViewPreview that outlived the gate
  // they mirrored. Who may still ask it, and why:
  //   * lib/newBuildAccess.js — the one place that decides who sees /manage and
  //     /work, behind the go-live switch.
  //   * components/PreviewHostGate.jsx — preview.adlmstudio.net, where the NEXT
  //     batch of Richard's work waits for his sign-off. Staff-only on purpose.
  //   * ds/DsPreviewGate.jsx — /preview/* and /fit, the same staging, by path.
  //   * utils/roles.js — where it is defined.
  // A new file on this list needs a reason written beside it.
  const ALLOWED = new Set([
    "lib/newBuildAccess.js",
    "components/PreviewHostGate.jsx",
    "ds/DsPreviewGate.jsx",
    "utils/roles.js",
  ]);
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
    return out;
  }

  it("only the allowed files use canViewPreview", () => {
    // Code, not comments: a comment recording why a file stopped asking is
    // fine, so block and line comments are stripped before looking.
    const code = (f) =>
      fs
        .readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const users = walk(SRC)
      .filter((f) => /\bcanViewPreview\b/.test(code(f)))
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"));
    expect(users.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});
