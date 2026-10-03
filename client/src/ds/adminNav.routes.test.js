import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// THE RAIL MUST NOT DRAW A LINK ITS DESTINATION WILL REFUSE.
//
// adminNav.js states the rule in its own header: "RBAC that shows a person a
// screen they will be bounced off is not RBAC. So each entry names the
// permission the destination is gated with."
//
// Nothing enforced it, and thirteen entries had drifted. Two ways:
//
//   - Follow-ups, Support, What's New, Composer, Audit log and AI usage all
//     claimed `area: "adminhub"` while their routes wanted "followups",
//     "support", "changelogs", "invoices", "audit" and "aiusage". The
//     Follow-Up Calls role exists precisely so somebody can work the renewal
//     list without purchase-approval rights — and never saw the link at all.
//   - Courses, Products, Coupons, Enrolments, Submissions and Quizzes are
//     gated `roles={["admin"]}` but were drawn for any mini-admin holding
//     "adminhub" or "learn", who was refused on arrival.
//
// This reads both files and compares them, so the next one fails here rather
// than in somebody's face.

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

const NAV = read("adminNav.js");
const MAIN = read("../main.jsx");
const LAUNCHER = read("../features/admin/AdminLauncher.jsx");

/** Every rail entry that names an area. */
const railEntries = () =>
  [...NAV.matchAll(/\{\s*to:\s*"([^"]+)"[^}]*?area:\s*"([^"]+)"([^}]*)\}/g)].map((m) => ({
    to: m[1],
    area: m[2],
    adminOnly: /admin:\s*true/.test(m[3]),
  }));

/** Every admin route and the guard it is wrapped in. */
const routeGuards = () => {
  const out = {};
  const re = /path:\s*"(admin\/[^"]*)"[\s\S]{0,420}?<AdminRoute([^>]*)>/g;
  let m;
  while ((m = re.exec(MAIN))) {
    const to = `/${m[1]}`;
    if (out[to]) continue; // the first guard wins, as the router does
    out[to] = {
      permission: (m[2].match(/permission="([^"]+)"/) || [])[1] || "",
      // The fallback has to come BEFORE .replace: on a route with no roles= the
      // match is null, [1] is undefined, and .replace throws.
      roles: ((m[2].match(/roles=\{\[([^\]]*)\]\}/) || [])[1] || "").replace(/["' ]/g, ""),
    };
  }
  return out;
};

describe("the admin rail against the routes it links to", () => {
  it("finds both sides to compare", () => {
    // If either regex stops matching, every assertion below passes vacuously.
    expect(railEntries().length).toBeGreaterThan(30);
    expect(Object.keys(routeGuards()).length).toBeGreaterThan(30);
  });

  it("names the SAME permission the route is gated with", () => {
    const guards = routeGuards();
    const wrong = railEntries()
      .filter((e) => guards[e.to]?.permission && guards[e.to].permission !== e.area)
      .map((e) => `${e.to}: rail says "${e.area}", route needs "${guards[e.to].permission}"`);
    expect(wrong).toEqual([]);
  });

  it("marks an admin-only route as admin-only in the rail", () => {
    // A route gated roles={["admin"]} shown to a staff-grantable area draws a
    // link that refuses on arrival.
    const guards = routeGuards();
    const wrong = railEntries()
      .filter((e) => guards[e.to]?.roles && !e.adminOnly)
      .map((e) => `${e.to}: route is roles=[${guards[e.to].roles}] but the rail is not admin-only`);
    expect(wrong).toEqual([]);
  });

  it("does not link anywhere the router does not go", () => {
    // A rail entry with no route at all is a link into the not-found page.
    const guards = routeGuards();
    const orphans = railEntries()
      .filter((e) => e.to.startsWith("/admin/"))
      .filter((e) => !guards[e.to])
      .map((e) => e.to);
    expect(orphans).toEqual([]);
  });
});

// The Profile page's admin launcher has the same contract and the same drift.
// One tile carried the "Organisation Videos" label, description and icon while
// pointing at /admin/organizations — so somebody granted only `orgvideos` saw
// two identical tiles and the first refused them on arrival.

const launcherTiles = () =>
  [...LAUNCHER.matchAll(/\{\s*area:\s*"([^"]+)",\s*to:\s*"([^"]+)"[^}]*label:\s*"([^"]+)"/g)].map(
    (m) => ({ area: m[1], to: m[2], label: m[3] }),
  );

describe("the admin launcher tiles", () => {
  it("finds tiles to check", () => {
    expect(launcherTiles().length).toBeGreaterThan(20);
  });

  it("names the permission its destination is gated with", () => {
    const guards = routeGuards();
    const wrong = launcherTiles()
      .filter((t) => guards[t.to]?.permission && guards[t.to].permission !== t.area)
      .map((t) => `${t.to}: tile says "${t.area}", route needs "${guards[t.to].permission}"`);
    expect(wrong).toEqual([]);
  });

  it("has no two tiles with the same label", () => {
    // Two tiles reading "Organisation Videos" is not a layout problem: one of
    // them is pointing somewhere it does not say.
    const seen = {};
    for (const t of launcherTiles()) seen[t.label] = (seen[t.label] || 0) + 1;
    expect(Object.entries(seen).filter(([, n]) => n > 1)).toEqual([]);
  });
});
