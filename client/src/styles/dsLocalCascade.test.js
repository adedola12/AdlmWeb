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

/** EVERY matching rule, not the first.
 *
 * `find` was not enough. A `mine` pattern that keys off the DOUBLED selector stops
 * matching the moment someone un-doubles it, so the rule escapes the check and the
 * test passes while the bug is live — and where one selector appears twice (base
 * and inside a media query) checking only the first leaves the second unguarded.
 * Sabotaging the base .pj-buy rule proved both holes: 8/8 still passed.
 *
 * So the patterns below match the rule by what it TARGETS, doubled or not, and
 * every hit must out-specify. */
const findAll = (rs, re, prop) =>
  rs.filter((r) => re.test(r.sel) && new RegExp(prop).test(r.body));

describe("ds-local.css against the lazy per-screen sheets", () => {
  const local = rules(read("ds-local.css"));
  const workProj = rules(read("ds-work-proj.css"));

  // Every pair below is one element carrying BOTH classes, or one nested inside
  // the other, so the two rules compete head-on and ds-local only wins by
  // out-specifying.
  //
  const CONTESTED = [
    // The three below came in with the reclaim that moved 62 hand-written classes
    // out of ds-work-proj.css, ds-dash.css and ds-work.css. They are not additions
    // — they are local MODIFICATIONS of Richard's own rules, which is why they are
    // the only ones of the 62 that collide.
    {
      what: "the Buy schedule's sixth column",
      // His row is five columns. WorkProjectBudget renders six, giving the amount
      // a column of its own, read like the Budget. Un-doubled this folds back to
      // five and the amount wraps onto a row by itself.
      mine: /\.pj-buy[\w.-]* \.rw$/,
      theirs: /^\.ds \.pj-buy \.rw$/,
      prop: "grid-template-columns",
    },
    {
      what: "the Buy schedule's material cell on a phone",
      // His sends .m across to the last column (2 / -1), which puts it under the
      // amount instead of beside it.
      mine: /\.pj-buy[\w.-]* \.rw \.m$/,
      theirs: /^\.ds \.pj-buy \.rw \.m$/,
      prop: "grid-column",
    },
    {
      what: "the variations row's phone grid",
      // Ours is inside @media (max-width:900px) and his is not in a media query at
      // all, so his is still live at that width with the same three classes.
      mine: /\.pj-vars[\w.-]* \.vr$/,
      theirs: /^\.ds \.pj-vars \.vr$/,
      prop: "grid-template-columns",
    },
  ];

  for (const c of CONTESTED) {
    it(`out-specifies ${c.what}`, () => {
      const mineAll = findAll(local, c.mine, c.prop);
      const theirs = find(workProj, c.theirs, c.prop);
      expect(
        mineAll.length,
        `ds-local.css should carry at least one ${c.prop} rule matching ${c.mine}`,
      ).toBeGreaterThan(0);
      expect(
        theirs,
        `ds-work-proj.css should carry a ${c.prop} rule matching ${c.theirs}`,
      ).toBeTruthy();
      for (const mine of mineAll) {
        expect(
          specificity(mine.sel),
          `"${mine.sel}" (${specificity(mine.sel)}) must out-specify "${theirs.sel}" ` +
            `(${specificity(theirs.sel)}), or it loses the cascade silently. ` +
            `ds-local.css is in the entry bundle and ds-work-proj.css is a lazy ` +
            `chunk appended after it.` +
            ` Double the class to win.`,
        ).toBeGreaterThan(specificity(theirs.sel));
      }
    });
  }

  it("keeps the budget card's own rules uncontested", () => {
    // .pj-budline is absent from the generated sheet entirely (it was moved out of
    // it), so nothing competes — but if it is ever written back there, these rules
    // start losing and the HERON budget card renders unstyled.
    expect(read("ds-work-proj.css")).not.toContain("pj-budline");
    expect(read("ds-local.css")).toContain(".ds .pj-budline{");
  });

  // The reclaim moved 62 hand-written class names out of three GENERATED sheets.
  // Each one is now uncontested for the same reason .pj-budline is: it is absent
  // from the sheet it used to sit in. Writing any of them back there does not just
  // re-create the porter hazard — it silently re-creates the cascade one too,
  // because the generated sheet loads after this file and would start winning.
  //
  // Named families only, not a sweep: the whole set is audited by re-running
  // scripts/port-ds-css.mjs against an unchanged source and diffing.
  it("keeps the reclaimed families out of the generated sheets", () => {
    const moved = {
      // pj-pop-x/-g/-h is the Export menu, and it is here because it PROVED the
      // point: it was hand-written into the generated sheet after the reclaim
      // had already been audited, arrived on a merge, and the next porter run
      // deleted it. .pj-pop itself is Richard's and stays in his sheet, so the
      // check names the modifiers, not the base class.
      "ds-work-proj.css": [
        "fd-scrub",
        "ac-list",
        "pn-rates",
        "pj-actsum",
        "pj-bill .grip",
        "pj-pop-x",
        "pj-pop-g",
        "pj-pop-h",
      ],
      "ds-dash.css": ["dsh-fs", "sm-list"],
      "ds-work.css": ["pcp-issue"],
    };
    for (const [sheet, names] of Object.entries(moved)) {
      const css = read(sheet);
      for (const name of names) {
        expect(
          css,
          `${name} is hand-written and belongs in ds-local.css. A porter run ` +
            `deletes it from ${sheet}, and while it is there it also out-ranks ` +
            `ds-local.css on load order.`,
        ).not.toContain(name);
      }
    }
    const localCss = read("ds-local.css");
    for (const name of [
      "fd-scrub",
      "ac-list",
      "pn-rates",
      "pj-actsum",
      "dsh-fs",
      "sm-list",
      "pcp-issue",
      "pj-pop-x",
    ]) {
      expect(localCss, `ds-local.css should carry ${name}`).toContain(name);
    }
  });
});
