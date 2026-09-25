// Fidelity check: does the port still match Richard's build?
//
// Run after re-porting, or after he pushes changes upstream:
//   node scripts/verify-ds-port.mjs
//
// Checks, in order of how expensive the mistake would be:
//   1. Every page of his that we claim to port has a generated component.
//   2. Every rule in his stylesheet survives into ds.css, and nothing escapes
//      the .ds scope to reach the rest of the app.
//   3. Every link and image in his markup resolves, and every asset exists.
//   4. Every icon a page references exists in the sprite.
//   5. Every ds class our HAND-WRITTEN components render still exists in the
//      generated CSS. Checks 2-4 only compare his markup against his CSS, so
//      they cannot see this: on 17 Sep he renamed the theme swatch .sw -> .tsw,
//      we regenerated the sheets from his HEAD, and ThemeMenu.jsx kept
//      emitting .sw. Every swatch on the site rendered as a bordered line and
//      nothing complained. That is the class of bug this section exists for.
//   6. Deliberate divergences are listed, not hidden — so "faithful" never
//      quietly comes to mean "whatever we ended up with".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHref } from "../src/lib/dsRoutes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(here, "..");
const SITE = path.resolve(CLIENT, "../../ADLMWebNewUI/site");

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};
const ok = (msg) => console.log(`  ok    ${msg}`);

// Divergences we chose. Each needs a reason; an unexplained one is a bug.
const DIVERGENCES = [
  ["@font-face dropped", "his five Lexend 'weights' are one byte-identical file; the app loads real Lexend 100..900"],
  ["body{overflow-x:hidden} -> overflow-x:clip", "on a div, hidden creates a scroll container and breaks position:sticky (killed the pinned carousel)"],
  ["dark scope [data-theme] -> .dark", "ThemeProvider already drives a .dark class; two theme systems would fight"],
  ["10 class names prefixed ds-", "grid/btn/btn-sm/card/a/accent/lede/sub/fill/field collide with index.css and Tailwind"],
  ["favicon painter not ported", "it rewrites <link rel=icon> on document.head, changing the whole site's favicon and persisting after unmount"],
  ["cart/checkout basket not ported", "his is a localStorage mock with hardcoded prices; these pages have the real Paystack flow"],
  ["Products nav: Mobile app, Ada, How ADLM works removed", "not products — per Adedolapo 2026-08-17"],
  ["civiq page hand-authored", "his predates the Civil 3D spec; rebuilt on his section order with real spec + live catalogue data"],
  ["compare given its own /compare route", "his lives as #compare inside pricing.html; same table markup, prices now read from the catalogue"],
  ["prices read from GET /products", "his were typed into the markup and could drift from what checkout charges"],
  ["css url(../img/x) -> url(/ds/x)", "his sheets sit in assets/css; ported into src/styles that path points at nothing and Vite fails the build"],
  ["images only his JS names are not copied", "assets/img is synced for what his markup and stylesheets reference; the rest is weight for a picture nothing ported can draw"],
];

console.log("\n1. Page coverage");
const manifest = fs.readFileSync(path.join(CLIENT, "src/ds/pages/manifest.js"), "utf8");
const slugs = [...manifest.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
const generated = fs.readdirSync(path.join(CLIENT, "src/ds/pages")).filter((f) => f.endsWith(".jsx"));
const custom = fs.existsSync(path.join(CLIENT, "src/ds/custom"))
  ? fs.readdirSync(path.join(CLIENT, "src/ds/custom")).filter((f) => f.endsWith(".jsx"))
  : [];
const componentCount = generated.length + custom.length;
if (componentCount < slugs.length) {
  fail(`manifest lists ${slugs.length} pages but only ${componentCount} components exist`);
} else {
  ok(`${slugs.length} staged pages, ${generated.length} generated + ${custom.length} hand-authored`);
}

// His marketing pages, i.e. everything not auth/commerce/app-screen.
const APP_SCREENS = /^(dash-|work-|ada|doc-preview|quiv-legacy|login|signup|verify|cart|checkout|thanks|account)/;
const hisMarketing = fs
  .readdirSync(path.join(SITE, "src"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""))
  .filter((n) => !APP_SCREENS.test(n));
const missing = hisMarketing.filter((n) => {
  const slug = n === "index" ? "home" : n;
  return !slugs.includes(slug);
});
if (missing.length) fail(`his marketing pages not staged: ${missing.join(", ")}`);
else ok(`all ${hisMarketing.length + 1} of his marketing pages staged (incl. index)`);

console.log("\n2. Stylesheet fidelity");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ");
const dsCss = strip(fs.readFileSync(path.join(CLIENT, "src/styles/ds.css"), "utf8"));
// scope escapes
const flat = dsCss.replace(/@(media|supports|layer|container)[^{]*\{/g, "");
const escapes = [];
{
  let depth = 0;
  let buf = "";
  for (const c of flat) {
    if (c === "{") {
      if (depth === 0) {
        for (const sel of buf.split(",")) {
          const t = sel.trim();
          if (!t || t.startsWith("@")) continue;
          if (t.startsWith(".ds") || t.startsWith(":root")) continue;
          if (/^(from|to|[\d.]+%)$/.test(t)) continue;
          escapes.push(t);
        }
      }
      depth += 1;
      buf = "";
      continue;
    }
    if (c === "}") { depth = Math.max(0, depth - 1); buf = ""; continue; }
    if (depth === 0) buf += c;
  }
}
if (escapes.length) fail(`${escapes.length} selector(s) escaped the .ds scope: ${[...new Set(escapes)].slice(0, 5).join(", ")}`);
else ok("no selector escapes the .ds scope");

const COLLIDING = ["grid", "btn", "btn-sm", "card", "a", "accent", "lede", "sub", "fill", "field"];
const leftover = COLLIDING.filter((c) => new RegExp(`\\.${c.replace(/-/g, "\\-")}(?![\\w-])`).test(dsCss));
if (leftover.length) fail(`un-renamed colliding class(es) in ds.css: ${leftover.join(", ")}`);
else ok("all 10 colliding class names renamed");

if (/overflow-x\s*:\s*hidden/i.test(dsCss.slice(0, 6000))) {
  fail("body overflow-x:hidden survived onto .ds — position:sticky will break");
} else {
  ok("overflow-x:clip on .ds (sticky-safe)");
}

console.log("\n3. Links and assets");
const files = [
  ...fs.readdirSync(path.join(SITE, "src")).map((f) => path.join(SITE, "src", f)),
  path.join(SITE, "index.html"),
].filter((f) => f.endsWith(".html"));
let refs = 0;
const unmapped = [];
const missingAssets = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:href|src)="([^"]*)"/g)) {
    let r;
    try { r = resolveHref(m[1]); } catch { unmapped.push(`${path.basename(f)}: ${m[1]}`); continue; }
    if (!r) continue;
    refs += 1;
    if (/^\/(ds|docs)\//.test(r) && !fs.existsSync(path.join(CLIENT, "public", r))) {
      missingAssets.push(r);
    }
  }
}
if (unmapped.length) fail(`${unmapped.length} unmapped href(s): ${unmapped.slice(0, 3).join("; ")}`);
else ok(`${refs} links and image sources all resolve`);
if (missingAssets.length) fail(`${missingAssets.length} missing asset(s): ${[...new Set(missingAssets)].slice(0, 3).join(", ")}`);
else ok("every referenced asset exists in public/");

// The same question for his STYLESHEETS, which check 3 above cannot see: a
// background image is written url("../img/x.jpg") and the porter rewrites it
// to /ds/x.jpg. Nothing needed that until hub.css on 22 Sep, and a url that
// resolves to nothing fails `npm run build` rather than degrading.
const cssDir = path.join(CLIENT, "src/styles");
const cssAssets = new Set();
const cssRelative = [];
for (const file of fs.readdirSync(cssDir).filter((f) => /^ds.*\.css$/.test(f))) {
  const css = fs.readFileSync(path.join(cssDir, file), "utf8");
  for (const m of css.matchAll(/url\(\s*["']?(\/[^"')]+)/g)) cssAssets.add(m[1]);
  for (const m of css.matchAll(/url\(\s*["']?(\.\.?\/[^"')]+)/g)) {
    cssRelative.push(`${file}: ${m[1]}`);
  }
}
const missingCssAssets = [...cssAssets].filter((u) => !fs.existsSync(path.join(CLIENT, "public", u)));
if (cssRelative.length) fail(`${cssRelative.length} relative url() left in the ported CSS: ${cssRelative.slice(0, 3).join("; ")}`);
else if (missingCssAssets.length) fail(`${missingCssAssets.length} stylesheet asset(s) missing from public/: ${missingCssAssets.slice(0, 3).join(", ")}`);
else ok(`${cssAssets.size} stylesheet image(s) resolve under public/`);

console.log("\n4. Icon sprite");
const allJsx = [
  ...generated.map((f) => path.join(CLIENT, "src/ds/pages", f)),
  ...custom.map((f) => path.join(CLIENT, "src/ds/custom", f)),
  ...fs.readdirSync(path.join(CLIENT, "src/ds/chrome")).map((f) => path.join(CLIENT, "src/ds/chrome", f)),
].map((f) => fs.readFileSync(f, "utf8"));
const blob = allJsx.join("\n");
const ids = new Set([...blob.matchAll(/\bid="([^"]+)"/g)].map((m) => `#${m[1]}`));
const used = new Set([...blob.matchAll(/<use href="(#[^"]+)"/g)].map((m) => m[1]));
const missingIcons = [...used].filter((u) => !ids.has(u));
if (missingIcons.length) fail(`icon(s) referenced but not in the sprite: ${missingIcons.join(", ")}`);
else ok(`all ${used.size} icon references resolve in the sprite`);

// Hand-written components that live in the .ds world. ds/pages and ds/chrome
// are excluded on purpose: the porter writes them, so checks 2-4 already cover
// them and a re-run would overwrite anything said about them here. ds/custom is
// NOT excluded — port-ds-html.mjs writes only src/ds/pages (see its header), so
// those wrappers are hand-maintained like every other file listed here, and a
// class the sheets drop would rot there unseen.
const HAND_WRITTEN_DIRS = [
  "src/ds",
  "src/ds/feedback",
  "src/ds/cert",
  "src/ds/custom",
  "src/ds/rategen",
];

// Class names our components write that no .ds stylesheet defines, and which
// are fine: Tailwind used on purpose, a marker something else reads, or one of
// HIS OWN structural wrappers — a div his JS creates and his stylesheet never
// styles, ported verbatim because the rule belongs upstream and inventing one
// here would be us designing, not porting. Every entry needs a reason.
const UNSTYLED_OK = [
  // Tailwind, deliberately. DsPreviewIndex says in its own header that it is a
  // review tool styled with the app's Tailwind rather than the ported design
  // system, precisely so it is not mistaken for one of his pages.
  ["text-2xl", "Tailwind (DsPreviewIndex is a review tool, not a ported page)"],
  ["text-sm", "Tailwind (DsPreviewIndex)"],
  ["text-xs", "Tailwind (DsPreviewIndex)"],
  ["gap-3", "Tailwind (DsPreviewIndex)"],
  ["mb-1", "Tailwind (DsPreviewIndex)"],
  ["mb-2", "Tailwind (DsPreviewIndex)"],
  ["mb-8", "Tailwind (DsPreviewIndex)"],
  ["rounded", "Tailwind (DsPreviewIndex)"],
  ["rounded-xl", "Tailwind (DsAdminOrgVideos thumbnail)"],

  // Marker classes. Never styled; something else reads them.
  ["sh-leave", "marker on his wk-modal so DsLeaveStudio can find its own dialog"],
  ["ct", "cert dialog hook (ds/cert), styled through .cx-* not .ct"],

  // His own structural wrappers. Each is written by HIS javascript and styled
  // by no rule in HIS stylesheet — the children carry the whole appearance —
  // so the port is faithful and a rule of ours would be an invention. Checked
  // against his build on 24 Sep 2026; worth sending back to him with .adm-link.
  ["adm-burn", "his admin-ai.js does el('div','adm-burn'); .adm-burn-bar and .adm-burn-k style themselves"],
  ["lx-cont-in", "his learn.js writes it inside .lx-cont, which styles .k and the card through it"],
  ["pj-out", "his work-proj.js writes it as the swap target for .pj-grid / .pj-table / .pj-empty"],
];

// Known gaps: written by a component, defined by no sheet. Recorded, not
// blessed — each one is a CHR-1 in miniature, and each belongs to the stream
// that owns the file. Delete the entry when the rule lands. The point of
// listing them is that the check still fails for anything NEW.
//
// Empty since 24 Sep 2026 (S18 G1). The last thirteen were closed by using a
// class of his where he had one (.adm-h, .adm-drawer-x, .adm-fields input,
// .dsh-att, .panel rise), by deleting a hook name nothing reads (.qt-close),
// and by writing two rules in ds-local.css for the two cases he genuinely has
// no equivalent for (.dsh-notice, .sform-status). Keep it empty: a new entry
// here is a screen shipping unstyled, not a to-do.
const TRACKED_GAPS = [];

// Bases whose variants are sibling classes rather than compounds, so
// `base ${variant}` is correct even though no `.base.variant` selector exists.
const SIBLING_MODIFIER_BASES = [
  ["pill", "his pill variants are .pill-a / .pill-b / .pill-d, not .pill.a"],
];

/** Every class the .ds stylesheets define, and which of them take modifiers. */
function readDsStylesheets() {
  const dir = path.join(CLIENT, "src/styles");
  const defined = new Set();
  const compounds = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => /^ds.*\.css$/.test(f))) {
    const css = strip(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
    // ".a.b" — a modifier is only ever reachable as a compound.
    for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (!compounds.has(m[1])) compounds.set(m[1], new Set());
      compounds.get(m[1]).add(m[2]);
    }
  }
  return { defined, compounds };
}

/** className="..." and className={`...`}, with the literals inside ${}. */
function readClassUses(src) {
  const statics = [];
  const dynamic = [];
  for (const m of src.matchAll(/className="([^"]*)"/g)) statics.push(m[1]);
  for (const m of src.matchAll(/className=\{`([^`]*)`\}/g)) {
    const lit = m[1];
    statics.push(lit.replace(/\$\{[^}]*\}/g, " "));
    // A ternary inside the template still names its classes outright.
    for (const e of lit.matchAll(/\$\{([^}]*)\}/g)) {
      if (/["']/.test(e[1])) {
        for (const s of e[1].matchAll(/["']([^"']*)["']/g)) statics.push(s[1]);
      } else {
        dynamic.push(lit);
      }
    }
  }
  return { statics, dynamic };
}

const tokensOf = (s) =>
  s
    .split(/\s+/)
    // Lower-case, hyphenated names only: that is what his CSS is written in.
    // A trailing hyphen is the left half of a name completed at runtime
    // ("is-${band}"), which cannot be checked from here.
    .filter((t) => /^[a-z][a-z0-9-]*$/.test(t) && !t.endsWith("-"));

function checkHandWrittenClasses() {
  const { defined, compounds } = readDsStylesheets();
  // "His namespace" is anything sharing a first segment with a class the
  // sheets define. It keeps the check off our own and Tailwind's names without
  // needing a list of either.
  const families = new Set([...defined].map((c) => c.split("-")[0]));
  const allowed = new Set([...UNSTYLED_OK, ...TRACKED_GAPS].map(([c]) => c));
  const siblings = new Set(SIBLING_MODIFIER_BASES.map(([c]) => c));

  const files = [];
  for (const rel of HAND_WRITTEN_DIRS) {
    const dir = path.join(CLIENT, rel);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".jsx") && !f.endsWith(".test.jsx")) files.push([rel, f, path.join(dir, f)]);
    }
  }

  const stale = new Map();
  const unmodifiable = [];
  for (const [, name, full] of files) {
    const src = fs.readFileSync(full, "utf8");
    const { statics, dynamic } = readClassUses(src);

    for (const chunk of statics) {
      for (const t of tokensOf(chunk)) {
        if (defined.has(t) || allowed.has(t)) continue;
        if (!families.has(t.split("-")[0])) continue;
        if (!stale.has(t)) stale.set(t, new Set());
        stale.get(t).add(name);
      }
    }

    // The CHR-1 shape: a base plus a modifier only known at runtime. If the
    // sheets give that base no modifiers at all, the modifier can never land.
    for (const lit of dynamic) {
      const base = tokensOf(lit.replace(/\$\{[^}]*\}/g, " ")).pop();
      if (!base || !defined.has(base) || siblings.has(base)) continue;
      if (!compounds.has(base)) {
        unmodifiable.push(`${name}: \`${lit.replace(/\s+/g, " ")}\` — .${base} takes no modifier`);
      }
    }
  }

  if (stale.size) {
    for (const [t, where] of [...stale].sort()) {
      fail(`.${t} is rendered by ${[...where].sort().join(", ")} but no .ds stylesheet defines it`);
    }
  } else {
    ok(
      `${files.length} hand-written components render no undefined ds class ` +
        `(${UNSTYLED_OK.length} allowed by design, ${TRACKED_GAPS.length} tracked gaps)`,
    );
  }
  for (const [c, why] of TRACKED_GAPS) console.log(`        gap: .${c} — ${why}`);

  if (unmodifiable.length) {
    for (const line of unmodifiable) fail(line);
  } else {
    ok("every runtime class modifier has a matching compound selector");
  }
}

console.log("\n5. Hand-written components against the generated CSS");
checkHandWrittenClasses();

console.log("\n6. Deliberate divergences from his build");
for (const [what, why] of DIVERGENCES) console.log(`  •  ${what}\n       ${why}`);

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} problem(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
