// The phone pass's thumb targets have to be the rule that actually computes.
//
// Two of the four set a size against a size he already sets, with the SAME
// selector he uses — `.ds .pj-views button` (34x30, ds-work-proj.css) and
// `.ds .wk-modal-x` (34x34, ds-work.css). Equal specificity is decided by
// source order, and both of his sheets are imported from route components
// while ds-local.css is imported from main.jsx, so his land later in the
// bundle and win. The 40px boxes were dead the day they were written.
//
// This resolves the cascade for a 375px viewport from the sheets themselves
// and checks the winner, TWICE — once with ds-local first and once with it
// last. If the fix depended on order rather than on weight, one of the two
// would fail.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(HERE, f), "utf8");

const LOCAL = "ds-local.css";
const HIS = ["ds-work.css", "ds-work-proj.css"];

/** Drop comments so a selector inside one is never mistaken for a rule. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Does this @media condition hold at `width`? Only the forms these sheets use. */
function mediaApplies(condition, width) {
  if (!condition) return true;
  if (/print/.test(condition)) return false;
  if (/prefers-reduced-motion|hover|pointer|forced-colors/.test(condition)) return false;
  let ok = true;
  for (const m of condition.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)) {
    const limit = Number(m[2]);
    if (m[1] === "max" && !(width <= limit)) ok = false;
    if (m[1] === "min" && !(width >= limit)) ok = false;
  }
  return ok;
}

/**
 * Every style rule in a sheet, in source order, each carrying the @media it
 * sits inside. Enough of a parser for these files: one level of at-rule, no
 * nesting, no selectors containing braces.
 */
function parse(css) {
  const s = strip(css);
  const out = [];
  const open = []; // the @media blocks we are inside, innermost last
  let buf = "";
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (ch === "}") {
      buf = "";
      while (open.length && i >= open[open.length - 1].end) open.pop();
      i += 1;
      continue;
    }

    if (ch !== "{") {
      buf += ch;
      i += 1;
      continue;
    }

    const prelude = buf.trim();
    buf = "";

    if (prelude.startsWith("@")) {
      const end = matchBrace(s, i);
      if (/^@media/i.test(prelude)) {
        open.push({ media: prelude.replace(/^@media/i, "").trim(), end });
        i += 1;
      } else {
        // Any other at-rule (@supports, @keyframes, @font-face): skip it whole.
        i = end + 1;
      }
      continue;
    }

    const close = s.indexOf("}", i);
    if (close === -1) break;
    out.push({
      selectors: prelude.split(",").map((x) => x.trim()).filter(Boolean),
      body: s.slice(i + 1, close),
      media: open.map((f) => f.media).join(" and "),
    });
    i = close + 1;
    while (open.length && i > open[open.length - 1].end) open.pop();
  }
  return out;
}

function matchBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === "{") depth += 1;
    else if (s[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

/** (id, class, type) — enough for these sheets; no :is()/:where() in them. */
function specificity(sel) {
  const clean = sel.replace(/\s*[>+~]\s*/g, " ");
  const ids = (clean.match(/#[\w-]+/g) || []).length;
  const classes =
    (clean.match(/\.[\w-]+/g) || []).length +
    (clean.match(/\[[^\]]+\]/g) || []).length +
    (clean.match(/:(?!:)[\w-]+/g) || []).length;
  const types = (clean.match(/(^|[\s])[a-zA-Z][\w-]*/g) || []).length;
  return [ids, classes, types];
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The declaration that wins for `needle` + `prop` at `width`, across the
 * sheets in the order given.
 */
function winner(sheets, needle, prop, width) {
  let best = null;
  sheets.forEach((css, sheetIdx) => {
    parse(css).forEach((rule, ruleIdx) => {
      if (!mediaApplies(rule.media, width)) return;
      const value = declared(rule.body, prop);
      if (value === null) return;
      for (const sel of rule.selectors) {
        if (!sel.endsWith(needle)) continue;
        const cand = { spec: specificity(sel), order: [sheetIdx, ruleIdx], sel, value, media: rule.media };
        if (
          !best ||
          cmp(cand.spec, best.spec) > 0 ||
          (cmp(cand.spec, best.spec) === 0 &&
            (cand.order[0] > best.order[0] ||
              (cand.order[0] === best.order[0] && cand.order[1] > best.order[1])))
        ) {
          best = cand;
        }
      }
    });
  });
  return best;
}

function declared(body, prop) {
  let found = null;
  for (const decl of body.split(";")) {
    const [k, ...rest] = decl.split(":");
    if (!rest.length) continue;
    if (k.trim().toLowerCase() === prop) found = rest.join(":").trim();
  }
  return found;
}

const local = read(LOCAL);
const his = HIS.map(read);

// The order we measured in the built bundle (ds-local.css first), and the
// order a future refactor might produce (ds-local.css last).
const ORDERS = [
  ["ds-local first, as the build emits it", [local, ...his]],
  ["ds-local last", [...his, local]],
];

describe("the phone pass's thumb targets", () => {
  for (const [label, sheets] of ORDERS) {
    describe(label, () => {
      it("gives the project gallery's layout switch a 40px box", () => {
        const w = winner(sheets, ".pj-views button", "width", 375);
        const h = winner(sheets, ".pj-views button", "height", 375);
        expect(w.value).toBe("40px");
        expect(h.value).toBe("40px");
      });

      it("gives the work modal's close button a 40px box", () => {
        const w = winner(sheets, ".wk-modal-x", "width", 375);
        const h = winner(sheets, ".wk-modal-x", "height", 375);
        expect(w.value).toBe("40px");
        expect(h.value).toBe("40px");
      });

      it("keeps the other three, which he sets no size on", () => {
        for (const needle of [".wk-tabs button", ".wk-loc-sw button", ".wk-dd-b"]) {
          expect(winner(sheets, needle, "min-height", 375).value).toBe("40px");
        }
      });

      it("changes nothing on a desktop", () => {
        expect(winner(sheets, ".pj-views button", "height", 1280).value).toBe("30px");
        expect(winner(sheets, ".wk-modal-x", "height", 1280).value).toBe("34px");
        expect(winner(sheets, ".wk-dd-b", "min-height", 1280)).toBeNull();
      });
    });
  }

  it("carries no rule for an empty state's action row, which nothing renders", () => {
    expect(strip(local)).not.toContain(".wk-empty > .b");
  });
});
