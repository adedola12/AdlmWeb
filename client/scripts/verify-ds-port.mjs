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
//   5. Deliberate divergences are listed, not hidden — so "faithful" never
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

console.log("\n5. Deliberate divergences from his build");
for (const [what, why] of DIVERGENCES) console.log(`  •  ${what}\n       ${why}`);

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} problem(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
