// Port Richard's static-site stylesheet into a namespaced design-system layer.
//
// SOURCE   ../ADLMWebNewUI/site/assets/css/site.css   (RichardEnoch/adlm-studio-site)
// OUTPUT   client/src/styles/ds.css
//
// WHY THIS EXISTS RATHER THAN A COPY-PASTE
// His stylesheet was written for a standalone static site where it owns the
// document. Dropped into this app as-is it breaks three ways:
//
//   1. It redefines .btn, .btn-sm and .card, which index.css also defines via
//      @apply and 100+ components already use.
//   2. Its .grid rule fights Tailwind's .grid display utility (83 files).
//   3. It carries bare *, body, h1-h4, p and img rules that would restyle
//      every page in the app, including admin and the report/PDF templates.
//
// So the port does three things: scopes every rule under `.ds`, renames the
// ten class names that collide, and rewrites his dark-mode scope onto the
// `.dark` class that ThemeProvider already drives.
//
// A page opts in by wrapping its content in <div className="ds">. Pages that
// have not been reskinned yet are completely unaffected, which is what makes
// this migration incremental instead of a big-bang rewrite.
//
// Re-run with:  node scripts/port-ds-css.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(here, "..");
// His stylesheets, and what each one dresses. site.css is the marketing site;
// the other five are loaded only by the pages that need them, and porting just
// site.css left every app screen, every auth screen and the document renderer
// with no styles of their own at all. Each is ported to its own file and
// imported where it is used, so a visitor to the marketing pages does not
// download 400 KB of dashboard CSS to look at the home page.
const SHEETS = [
  { in: "site.css", out: "ds.css" },
  { in: "dash.css", out: "ds-dash.css" },
  { in: "work.css", out: "ds-work.css" },
  { in: "learn.css", out: "ds-learn.css" },
  { in: "auth.css", out: "ds-auth.css" },
  { in: "doc.css", out: "ds-doc.css" },
];

const CSS_DIR = path.resolve(CLIENT, "../../ADLMWebNewUI/site/assets/css");
const OUT_DIR = path.join(CLIENT, "src/styles");

// The ten class names that exist on both sides. Renamed in the ported CSS so
// neither system can win by load order. The same map is applied to his markup
// when a page is ported — see scripts/port-ds-html.mjs.
export const RENAME = {
  grid: "ds-grid",
  btn: "ds-btn",
  "btn-sm": "ds-btn-sm",
  card: "ds-card",
  a: "ds-a",
  accent: "ds-accent",
  lede: "ds-lede",
  sub: "ds-sub",
  fill: "ds-fill",
  field: "ds-field",
};

// Bare element selectors get special handling instead of a blind `.ds ` prefix:
// `body` IS the scope root, and `html` rules belong to the document.
// `html` is handled by ROOT_HEAD below, since it anchors at the document root.
const ELEMENT_SCOPE = {
  body: ".ds",
  "*": ".ds, .ds *",
};

// ── selector rewriting ────────────────────────────────────────────────────

function renameClasses(selector) {
  // Only touch a class token, never an element name or a substring of a
  // longer class: `.card` renames, `.card-head` and `<a>` do not.
  return selector.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(RENAME, name)
      ? `.${RENAME[name]}`
      : whole,
  );
}

// A leading :root / html compound and what it becomes here. His stylesheet
// expresses theme as `[data-theme]` plus a prefers-color-scheme fallback;
// this app resolves both into a single `.dark` class on <html>, so the whole
// family collapses onto that.
const ROOT_HEAD = [
  [/^:root\[data-theme\s*=\s*["']dark["']\]/, ":root.dark"],
  [/^:root:not\(\[data-theme\]\)/, ":root.dark"],
  [/^:root\[data-theme\s*=\s*["']light["']\]/, ":root:not(.dark)"],
  [/^(?:html|:root)\.js\b/, ":root.js"],
  // `.js` is a marker his bootstrap sets on documentElement, so a selector
  // that leads with it is root-anchored too. Scoping it as `.ds .js .w` gave a
  // selector that can never match — which silently disabled the word-reveal on
  // every headline and the scroll-reveal on every section.
  [/^\.js\b/, ":root.js"],
  [/^(?:html|:root)\b/, ":root"],
];

// Attach whatever followed a rewritten head back onto it.
//
// The whitespace between them is load-bearing and must be inspected BEFORE
// trimming: `:root[data-theme=dark].foo` is one element, `:root[data-theme=dark]
// .foo` is a descendant that still needs the .ds scope inserted. Trimming first
// collapsed the two and produced `:root.dark.logo-l`, a selector matching an
// <html> element that also carries .logo-l — i.e. nothing.
function joinScoped(head, tail) {
  if (!tail) return head;
  const rest = tail.trim();
  if (!rest) return head;

  // Continues on the same element — no scope insertion possible or wanted.
  if (!/^[\s>+~]/.test(tail)) return `${head}${rest}`;

  // A child/sibling combinator cannot take an interposed .ds. None of these
  // exist in site.css today; flag rather than silently emit a broken selector.
  if (/^[>+~]/.test(rest)) {
    unscopedCombinators.push(`${head}${rest}`);
    return `${head} ${rest}`;
  }

  return `${head} .ds ${rest}`;
}

function scopeOne(selector) {
  const sel = renameClasses(selector.trim());
  if (!sel) return "";

  // Anything anchored at the document root keeps that anchor — it cannot be
  // pushed inside .ds, because :root is an ancestor of the scope, not a
  // descendant of it. Writing `.ds :root:not([data-theme]) .logo-d` produced a
  // selector that could never match, which silently killed the dark-mode logo
  // and sun/moon swaps.
  for (const [re, replacement] of ROOT_HEAD) {
    const m = sel.match(re);
    if (!m) continue;
    return joinScoped(replacement, sel.slice(m[0].length));
  }

  const head = sel.split(/[\s>+~[:.]/)[0];
  if (Object.prototype.hasOwnProperty.call(ELEMENT_SCOPE, head)) {
    const tail = sel.slice(head.length);
    return ELEMENT_SCOPE[head]
      .split(",")
      .map((s) => joinScoped(s.trim(), tail))
      .join(", ");
  }

  // Already scoped (shouldn't happen, but keeps re-runs idempotent).
  //
  // The boundary matters: a bare startsWith(".ds") also swallows every class
  // that merely begins with those letters, and his app sheets are built almost
  // entirely out of .dsh-* — so dash.css came through with 385 of its 450
  // rules unscoped, which is to say not applied at all. Only ".ds" itself, or
  // ".ds" followed by a separator, counts as scoped.
  if (/^\.ds(?![\w-])/.test(sel)) return sel;

  return `.ds ${sel}`;
}

// Split on commas that actually separate selectors — not the ones inside
// :is(), :not(), :nth-child() or an attribute value.
function splitSelectors(list) {
  const out = [];
  let depth = 0;
  let buf = "";
  let inStr = null;
  for (const c of list) {
    if (inStr) {
      buf += c;
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }
    if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    if (c === "," && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function scopeSelectorList(list) {
  return splitSelectors(stripComments(list))
    .map(scopeOne)
    .filter(Boolean)
    .join(", ");
}

// ── a small block-aware CSS walker ────────────────────────────────────────
// Full CSS parsing is not needed; we only have to tell rules from at-rules
// and recurse into the ones that nest.

const PASSTHROUGH_AT = /^@(keyframes|-webkit-keyframes|font-face|counter-style|property|page)\b/;
const NESTING_AT = /^@(media|supports|layer|container)\b/;

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ");
}

// Declarations that change meaning when their rule moves off <body> onto a div.
//
// `overflow-x:hidden` is the one that bites. On <body> it is inert, because the
// viewport does the scrolling. On `.ds` — a plain div — it makes the element a
// scroll container, and `position:sticky` resolves against the nearest
// scrolling ancestor. That silently killed the pinned products carousel on the
// home page: `.pin-stage` never stuck, so the scroll-driven slide change had
// nothing to drive it.
//
// `overflow: clip` expresses the same intent (do not let content spill
// sideways) without establishing a scroll container, so sticky keeps working.
function fixDeclarations(prelude, body) {
  if (!/(^|,)\s*body\s*(,|$)/.test(stripComments(prelude))) return body;
  return body.replace(/overflow-x\s*:\s*hidden/gi, "overflow-x:clip");
}

// Line number of a character offset, for reporting source defects.
function chunkIndexOfLine(css, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (css[i] === "\n") line += 1;
  return line;
}

// Populated during the run; reported at the end.
const strays = [];
// prefers-color-scheme used in a compound query, which the simple unwrap above
// cannot safely handle. None exist today; this catches it if one appears.
const compoundColorSchemeAt = [];
// Root-anchored selectors joined by a combinator, where the .ds scope cannot
// be interposed. Reported so they can be checked by hand.
const unscopedCombinators = [];

function splitTopLevel(css) {
  const out = [];
  let depth = 0;
  let buf = "";
  let inStr = null;
  let inComment = false;

  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    const next = css[i + 1];

    if (inComment) {
      buf += c;
      if (c === "*" && next === "/") {
        buf += next;
        i += 1;
        inComment = false;
        // A comment sitting between rules is its own chunk. Letting it ride
        // along into the next rule's prelude is what corrupted the output the
        // first time: the prose got comma-split and scoped as if it were a
        // selector list.
        const t = buf.trim();
        if (depth === 0 && t.startsWith("/*") && t.endsWith("*/")) {
          out.push(buf);
          buf = "";
        }
      }
      continue;
    }
    if (!inStr && c === "/" && next === "*") {
      buf += c + next;
      i += 1;
      inComment = true;
      continue;
    }
    if (inStr) {
      buf += c;
      if (c === "\\") {
        buf += next;
        i += 1;
      } else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }

    if (c === "}" && depth === 0) {
      // A stray closing brace. site.css has one at line 2258 (the
      // @media (max-width:430px) block is closed twice). Browsers discard it
      // during error recovery so his site looks fine, but counting it would
      // drive depth negative and every following `;` would read as top-level,
      // shredding the rest of the file. Drop it, exactly as a browser does,
      // and report it so it can be fixed upstream.
      strays.push(chunkIndexOfLine(css, i));
      continue;
    }

    buf += c;
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push(buf);
        buf = "";
      }
    } else if (c === ";" && depth === 0) {
      // top-level at-statement such as @import / @charset
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function transform(css) {
  return splitTopLevel(css)
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return "";

      // A chunk that is nothing but a comment passes through untouched. This
      // has to be checked BEFORE looking for a `{`, because a comment is free
      // to contain one: site.css has `/* must out-specify `.js .w{opacity:0}`
      // above ... */`, and treating that brace as a block opener scoped the
      // comment's prose as if it were a selector.
      if (trimmed.startsWith("/*") && trimmed.endsWith("*/")) return chunk;

      // Locate the real block opener on a copy with comments blanked out, so
      // a `{` inside a leading comment can never be mistaken for it.
      const masked = trimmed.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
      if (!masked.includes("{")) return chunk;

      const open = masked.indexOf("{");
      const prelude = trimmed.slice(0, open).trim();
      const close = masked.lastIndexOf("}");
      const body = trimmed.slice(open + 1, close === -1 ? undefined : close);

      if (prelude.startsWith("@")) {
        if (PASSTHROUGH_AT.test(prelude)) {
          // @font-face is dropped entirely — see the note in the header:
          // his five "weights" are one byte-identical file, and this app
          // already loads real Lexend 100..900 from Google Fonts.
          if (/^@font-face\b/.test(prelude)) return "";
          return `${prelude}{${body}}`;
        }
        // ThemeProvider resolves "system" into the .dark class before paint,
        // so the class alone already encodes the OS preference. Leaving this
        // media query wrapped around rules we just moved onto `.dark` would
        // double-gate them: choosing dark on a light-OS machine would set the
        // class but fail the query, and the tokens would never apply.
        if (/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/.test(prelude)) {
          return transform(body);
        }
        if (/prefers-color-scheme/.test(prelude)) {
          compoundColorSchemeAt.push(prelude);
        }
        if (NESTING_AT.test(prelude)) {
          return `${prelude}{\n${transform(body)}\n}`;
        }
        return chunk;
      }

      return `${scopeSelectorList(prelude)}{${fixDeclarations(prelude, body)}}`;
    })
    .filter(Boolean)
    .join("\n");
}

// ── run ───────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(CSS_DIR)) {
    console.error(
      `[port-ds-css] source not found: ${CSS_DIR}
` +
        "Clone RichardEnoch/adlm-studio-site next to this repo as ADLMWebNewUI.",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const sheet of SHEETS) {
    const src = path.join(CSS_DIR, sheet.in);
    if (!fs.existsSync(src)) {
      console.error(`[port-ds-css] missing sheet: ${src}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(src, "utf8");
    const ported = transform(raw);

    const header = `/* GENERATED — do not edit by hand.
 *
 * Ported from RichardEnoch/adlm-studio-site  site/assets/css/${sheet.in}
 * by client/scripts/port-ds-css.mjs. Re-run that script to pick up his
 * changes; hand edits here are lost.
 *
 * Every rule is scoped under .ds, so this file cannot affect a page that
 * has not opted in. Ten class names were renamed to avoid colliding with
 * index.css and Tailwind: ${Object.entries(RENAME)
   .map(([a, b]) => `.${a}->.${b}`)
   .join(" ")}
 */
`;

    const out = path.join(OUT_DIR, sheet.out);
    fs.writeFileSync(out, `${header}
${ported}
`, "utf8");
    const size = (t) => `${(Buffer.byteLength(t) / 1024).toFixed(1)} KB`;
    console.log(`[port-ds-css] ${sheet.in} ${size(raw)} -> ${sheet.out} ${size(ported)}`);
  }

  if (unscopedCombinators.length) {
    console.warn(
      `[port-ds-css] ${unscopedCombinators.length} selector(s) could not take the .ds scope:\n  ` +
        [...new Set(unscopedCombinators)].join("\n  "),
    );
  }
  if (compoundColorSchemeAt.length) {
    console.warn(
      "[port-ds-css] compound prefers-color-scheme query left wrapped — " +
        "check it resolves against the .dark class:\n  " +
        compoundColorSchemeAt.join("\n  "),
    );
  }
  if (strays.length) {
    console.warn(
      `[port-ds-css] dropped ${strays.length} stray '}' in the source at line(s) ` +
        `${strays.join(", ")} — worth fixing upstream in site.css.`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("port-ds-css.mjs")) {
  main();
}
