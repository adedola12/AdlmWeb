import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { railForViewer } from "./railGate.js";
import { RAIL, railItems } from "../ds/railConfig.js";
import { isGatedPath } from "./classicPaths.js";

// DsAppShell is not only the new build's frame — WorkShellRoute wraps eleven
// CLASSIC screens in it, all open to any signed-in customer. So the rail and the
// section tabs sit above screens whose viewer cannot open most of what they
// offer: fifteen of the seventeen leaf items point at /manage/* or /work/*.
//
// Left alone, that is a navigation bar where nearly every link silently throws
// the customer onto /dashboard.

const leaves = (rail) => railItems(rail).filter((i) => typeof i.to === "string");

describe("the rail a customer sees", () => {
  const gated = railForViewer(RAIL, false);

  it("offers no destination the route gate would bounce", () => {
    const bad = leaves(gated).filter((i) => isGatedPath(i.to));
    expect(bad.map((i) => `${i.id} -> ${i.to}`)).toEqual([]);
  });

  it("actually had something to fix, so this is not vacuous", () => {
    // If the rail ever stops containing gated links, these tests prove nothing
    // and should be revisited rather than left passing.
    const wouldHaveBounced = leaves(RAIL).filter((i) => isGatedPath(i.to));
    expect(wouldHaveBounced.length).toBeGreaterThan(10);
  });

  it("keeps every item, its label and its icon — the design does not change", () => {
    const before = railItems(RAIL);
    const after = railItems(gated);
    expect(after.map((i) => i.id)).toEqual(before.map((i) => i.id));
    expect(after.map((i) => i.label)).toEqual(before.map((i) => i.label));
    expect(after.map((i) => i.icon || i.img || "")).toEqual(
      before.map((i) => i.icon || i.img || ""),
    );
  });

  it("sends each tool to the classic workspace its own config already names", () => {
    // The tool entries record their classic path in `also` ("/projects/revit"
    // beside "/work/tool/quiv"), so the rewrite can be checked against the
    // config's own answer rather than against a second table.
    const after = railItems(gated);
    for (const item of railItems(RAIL)) {
      if (!item.also || !isGatedPath(item.to || "")) continue;
      const classicAlso = item.also.find((a) => !isGatedPath(a) && !a.includes(":"));
      if (!classicAlso) continue;
      const rewritten = after.find((i) => i.id === item.id);
      expect(rewritten.to, `${item.id}`).toBe(classicAlso);
    }
  });

  it("leaves the learning items alone, because they were never gated", () => {
    const after = railItems(gated);
    for (const id of ["dash-learning", "dash-assignments", "dash-certificates", "learn"]) {
      const before = railItems(RAIL).find((i) => i.id === id);
      const now = after.find((i) => i.id === id);
      expect(now.to, id).toBe(before.to);
      expect(now.gatedRewrite, `${id} should not be marked rewritten`).toBeUndefined();
    }
  });

  it("marks the items it rewrote, and only those", () => {
    for (const item of railItems(gated)) {
      const original = railItems(RAIL).find((i) => i.id === item.id);
      const wasGated = isGatedPath(original.to || "");
      expect(Boolean(item.gatedRewrite), `${item.id}`).toBe(wasGated);
    }
  });

  it("does not mutate the shared config", () => {
    // RAIL is a module-level constant every shell reads. Rewriting it in place
    // would change what STAFF see too, for the rest of the session.
    const home = railItems(RAIL).find((i) => i.id === "work-home");
    expect(home.to).toBe("/work");
    expect(home.gatedRewrite).toBeUndefined();
  });
});

describe("the rail staff see", () => {
  it("is the config itself, untouched and not even copied", () => {
    expect(railForViewer(RAIL, true)).toBe(RAIL);
  });

  it("still points at the new build", () => {
    const items = railItems(railForViewer(RAIL, true));
    expect(items.find((i) => i.id === "work-home").to).toBe("/work");
    expect(items.find((i) => i.id === "dash-billing").to).toBe("/manage/billing");
  });
});

describe("edges", () => {
  it("survives a rail shape it does not recognise", () => {
    expect(railForViewer(null, false)).toBe(null);
    // A group with no items, and a group with a hole in it.
    expect(railForViewer([{ group: "X" }], false)).toEqual([{ group: "X" }]);
    expect(railForViewer([{ group: "X", items: [null] }], false)).toEqual([
      { group: "X", items: [null] },
    ]);
  });

  it("rewrites a nested item inside a fold", () => {
    // The tools group holds its five entries in a nested `items` array.
    const gated = railForViewer(RAIL, false);
    const tools = gated.flatMap((g) => g.items).find((i) => i.id === "tools");
    expect(tools.items.every((i) => !isGatedPath(i.to))).toBe(true);
  });
});

// ── the app bar's search box ────────────────────────────────────────────────
//
// It must ask the SAME rail the rail itself does. DsAppShell builds its
// candidate list with railItems(rail) and, on Enter, navigates straight to
// hit.to — it does not pass it through href(). Fed the RAW config it therefore
// offered a customer the /manage and /work addresses while the gate was up, and
// sent them there, to a screen the gate then bounced them off; the rail beside
// it showed the classic address for the very same label, so the two halves of
// one app bar disagreed about where "Billing" is.
//
// The filter is mirrored from the component rather than imported, because it is
// written inline in a useMemo there. If it changes, change it here too: what is
// being pinned is the set of pages the box can reach.
const searchableFrom = (rail) =>
  railItems(rail).filter((it) => !it.action && it.ready !== false && !it.aliasOnly);

describe("what the app bar's search box can reach", () => {
  it("offers a customer nothing the route gate would bounce", () => {
    const gated = searchableFrom(railForViewer(RAIL, false)).filter((it) => isGatedPath(it.to));
    expect(gated.map((it) => `${it.label} -> ${it.to}`)).toEqual([]);
  });

  it("would have offered them straight from the config, so this is not vacuous", () => {
    const gated = searchableFrom(RAIL).filter((it) => isGatedPath(it.to));
    expect(gated.length).toBeGreaterThan(0);
  });

  it("still reaches exactly the same pages for staff", () => {
    // The gate down is the live case, and it must change nothing at all.
    expect(searchableFrom(railForViewer(RAIL, true)).map((it) => it.id)).toEqual(
      searchableFrom(RAIL).map((it) => it.id),
    );
  });

  it("is wired to the gated rail in DsAppShell, not to the raw config", () => {
    // Read from source, the same way newBuildAccess.test.jsx pins the gate's
    // single definition. While GATE_NEW_BUILD is false railForViewer returns the
    // config itself, so the two lists are identical and NOTHING observable tells
    // them apart — the wiring is the only thing left to assert, and it is what
    // the next raised gate depends on.
    const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const shell = fs.readFileSync(path.join(SRC, "ds", "DsAppShell.jsx"), "utf8");
    expect(shell).toMatch(/railItems\(rail\)/);
    expect(shell).not.toMatch(/railItems\(RAIL\)/);
  });
});
