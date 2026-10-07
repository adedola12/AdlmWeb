import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ds-local.css DOES NOT WIN A SPECIFICITY TIE, and its own header reads as though
// it does.
//
// It is the hand-authored companion to the generated ds*.css sheets, and main.jsx
// imports it last — but only ds.css and ds-feedback.css are imported beside it.
// Every PER-SCREEN sheet (ds-work-proj.css, ds-dash.css, ds-work.css, ds-admin.css
// and the rest) is imported by a React.lazy'd screen, so Vite emits each as its own
// CSS chunk and the browser appends it AFTER the entry stylesheet that carries
// ds-local. An override written here at equal specificity therefore loses — and
// loses silently: nothing errors, nothing warns, the rule simply does not apply.
//
// Pure additions — a class absent from the generated sheets — do not care, which
// is why this went unnoticed for a long time.
//
// WHY THIS FILE DOES NOT SWEEP EVERY RULE
//
// The first version of this test did. It compared the final class of each
// ds-local selector against the highest specificity the generated sheets reach for
// that class, and reported nineteen rules as losing. Almost all of them were
// false: `.lx-res .row`, `.lx-opt.on`, `.lx-stage.live`, `.lx-qacts em.bad` and the
// rest match classes whose NAMES are shared across unrelated contexts, and two
// rules only compete if they can match the same element. Deciding that needs the
// real DOM, not the selector text.
//
// A checker that cries wolf nineteen times teaches people to ignore it, so this
// tests the rules that are known to compete, by name. The way to audit the whole
// set is the one recorded in the project memory: re-run
// scripts/port-ds-css.mjs against an unchanged source, diff to reveal every hand
// edit across all fifteen sheets, then simulate the cascade over both
// arrangements.

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

/** Strip comments, then every `selector { body }` pair, one entry per selector. */
function rules(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !sel) continue;
    for (const one of sel.split(",")) out.push({ sel: one.trim(), body: m[2] });
  }
  return out;
}

/** Classes + pseudo-classes + attributes. Nothing in these sheets uses an id. */
function specificity(sel) {
  return (
    (sel.match(/\.[a-zA-Z][\w-]*/g) || []).length +
    (sel.match(/:(?!:)[a-z-]+/g) || []).length +
    (sel.match(/\[[^\]]+\]/g) || []).length
  );
}

const find = (rs, re, prop) => rs.find((r) => re.test(r.sel) && new RegExp(prop).test(r.body));

describe("ds-local.css against the lazy per-screen sheets", () => {
  const local = rules(read("ds-local.css"));
  const workProj = rules(read("ds-work-proj.css"));

  // Every pair below is one element carrying BOTH classes, so the two rules
  // compete head-on and ds-local only wins by out-specifying.
  const CONTESTED = [
    {
      what: "the rename pencil against the drag grip",
      // WorkProjectBill renders className="grip rnm". .grip sets cursor:grab and
      // touch-action:none because it was written for dragging a section, so the
      // pencil offered a drag it cannot do beside a handle that can.
      mine: /\.rnm/,
      theirs: /\.pj-bill \.grip\b/,
      prop: "cursor",
    },
    {
      what: "a non-interactive variations row against the clickable one",
      // WorkProjectVariations renders className="vr vr-flat" when there is no
      // handler. .vr sets cursor:pointer, so a row that is not a control still
      // showed the hand cursor and lit up on hover.
      mine: /\.vr\.vr-flat$/,
      theirs: /\.pj-vars \.vr$/,
      prop: "cursor",
    },
  ];

  for (const c of CONTESTED) {
    it(`out-specifies ${c.what}`, () => {
      const mine = find(local, c.mine, c.prop);
      // The bill's .grip was moved out of the generated sheet into ds-local.css
      // itself (4a5cdaab), further DOWN this file than the pencil's rule, so it
      // still competes and still wins a tie, on source order this time.
      const theirs = find(workProj, c.theirs, c.prop) || find(local, c.theirs, c.prop);
      expect(mine, `ds-local.css should carry a ${c.prop} rule matching ${c.mine}`).toBeTruthy();
      expect(
        theirs,
        `ds-work-proj.css or ds-local.css should carry a ${c.prop} rule matching ${c.theirs}`,
      ).toBeTruthy();
      expect(
        specificity(mine.sel),
        `"${mine.sel}" (${specificity(mine.sel)}) must out-specify "${theirs.sel}" ` +
          `(${specificity(theirs.sel)}), or it loses the cascade silently — ` +
          `ds-local.css is in the entry bundle and ds-work-proj.css is a lazy chunk ` +
          `appended after it. Double the class to win.`,
      ).toBeGreaterThan(specificity(theirs.sel));
    });
  }

  it("keeps the budget card's own rules uncontested", () => {
    // .pj-budline is absent from the generated sheet entirely (it was moved out of
    // it), so nothing competes — but if it is ever written back there, these rules
    // start losing and the HERON budget card renders unstyled.
    expect(read("ds-work-proj.css")).not.toContain("pj-budline");
    expect(read("ds-local.css")).toContain(".ds .pj-budline{");
  });

  it("keeps the panel checklist uncontested too", () => {
    expect(read("ds-work-proj.css")).not.toContain("pn-checks");
  });
});
