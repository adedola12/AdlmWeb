// The acceptance test: prove every public route serves real content with
// JavaScript disabled.
//
// It fetches the raw HTML — no browser, no JS engine, exactly what Bingbot
// stores — and reports what a crawler can actually extract: the H1, the first
// body paragraph, the word count of the body, and whether JSON-LD is present.
//
// A route fails if it has no H1 or no body paragraph. That is the bar the site
// was missing entirely: it served the same empty shell for every URL.
//
//   node scripts/seo-check.mjs                       # local SSR server
//   node scripts/seo-check.mjs https://www.adlmstudio.net
import { ROUTES } from "./seo-routes.mjs";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

/**
 * The page's own content, not the chrome around it.
 *
 * Scoped to <main> because the nav and footer render on every route: measuring
 * the whole body would score an empty page at ~110 words and report the first
 * nav link as its opening paragraph. Both of those read as a pass while telling
 * you nothing about the page.
 */
function body(html) {
  const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (main) return main[1];
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : "";
}

function stripTags(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * First occurrence of a tag with real text in it.
 *
 * `minLength` exists because the first <p> on a page is often an eyebrow or a
 * label three words long. Quoting that as proof the page has body copy is the
 * kind of evidence that passes a check while telling you nothing, so a
 * paragraph has to be a sentence before it counts.
 */
function firstText(html, tag, minLength = 0) {
  for (const m of html.matchAll(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"),
  )) {
    const text = stripTags(m[1]);
    if (text && text.length >= minLength) return text;
  }
  return "";
}

const results = [];

for (const route of ROUTES) {
  const url = `${BASE}${route}`;
  let html = "";
  let status = 0;

  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0)" },
    });
    status = res.status;
    html = await res.text();
  } catch (e) {
    results.push({ route, status: 0, error: e.message });
    continue;
  }

  const b = body(html);
  const h1 = firstText(b, "h1");
  const p = firstText(b, "p", 60);
  const words = stripTags(b).split(" ").filter(Boolean).length;
  const ld = (html.match(/application\/ld\+json/g) || []).length;
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";

  // A route that renders the not-found page still returns markup with an H1 in
  // it, so "has an H1" alone would pass a page that does not exist. Catching it
  // by content is deliberate: the check should fail on a broken route whatever
  // status code the server chose to send with it.
  const notFound = /^404\b/.test(h1) || /page not found/i.test(h1);

  results.push({
    route,
    status,
    h1,
    p,
    words,
    ld,
    title,
    notFound,
    pass: Boolean(h1 && p && status === 200 && !notFound && words >= 50),
  });
}

let failed = 0;

for (const r of results) {
  if (r.error) {
    failed++;
    console.log(`\n${"=".repeat(78)}\nFAIL  ${r.route}\n  request failed: ${r.error}`);
    continue;
  }
  if (!r.pass) failed++;

  console.log(`\n${"=".repeat(78)}`);
  console.log(
    `${r.pass ? "PASS" : "FAIL"}  ${r.route}   HTTP ${r.status}   ` +
      `${r.words} words in <main>   ${r.ld} JSON-LD` +
      (r.notFound ? "   *** RENDERS THE 404 PAGE ***" : ""),
  );
  console.log(`  <title>  ${r.title}`);
  console.log(`  <h1>     ${r.h1 || "*** MISSING ***"}`);
  console.log(`  <p>      ${(r.p || "*** MISSING ***").slice(0, 150)}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log(`${results.length - failed}/${results.length} routes passed against ${BASE}`);

process.exit(failed ? 1 : 0);
