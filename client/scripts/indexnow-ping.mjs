// Submits the site's URLs to IndexNow. Run after a deploy.
//
//   node scripts/indexnow-ping.mjs
//   node scripts/indexnow-ping.mjs https://www.adlmstudio.net/products
//   node scripts/indexnow-ping.mjs --dry-run
//
// --dry-run prints exactly what would be submitted and sends nothing. Worth
// using before the real thing: this script's failure mode is not an error, it
// is submitting a smaller set than you meant to and being told it succeeded.
//
// With no arguments it submits every URL in dist/sitemap.xml — which means
// running `npm run build` first, since that is what generates it.
//
// It reads the sitemap rather than a list in this repo because the sitemap is
// the only complete one: gen-sitemap.mjs fetches the live product catalogue and
// reads the changelog files, so it knows about pages no hand-kept array does.
// This script used to submit ROUTES from seo-routes.mjs, which is the
// acceptance-test list — 18 URLs against the sitemap's 31. It silently missed
// every /whats-new/* page and four of the seven products, while reporting
// success. ROUTES survives only as the fallback for when no build output exists.
//
// Submit everything exactly once, right after the deploy that first gave these
// pages real HTML. Afterwards prefer passing the specific URLs that changed:
// resubmitting the whole site on every deploy is what gets a key rate-limited.
//
// Never fails a deploy. A search engine ping is not worth a red build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTES } from "./seo-routes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SITEMAP = path.join(path.resolve(here, ".."), "dist", "sitemap.xml");

const SITE = "https://www.adlmstudio.net";
const KEY = String(process.env.INDEXNOW_KEY || "").trim();

const DRY_RUN = process.argv.includes("--dry-run");

// Checked after the dry-run flag so `--dry-run` still shows the URL list on a
// machine with no key, which is where you would want to sanity-check it.
if (!KEY && !DRY_RUN) {
  console.log("[indexnow] INDEXNOW_KEY not set — nothing submitted.");
  process.exit(0);
}

/** Every <loc> in the built sitemap, or null when there is no build output. */
function sitemapUrls() {
  try {
    const xml = fs.readFileSync(SITEMAP, "utf8");
    const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
      (m) => m[1],
    );
    return urls.length ? urls : null;
  } catch {
    return null;
  }
}

const explicit = process.argv
  .slice(2)
  .filter((arg) => arg && arg !== "--dry-run");

let urlList;
if (explicit.length) {
  urlList = explicit;
} else {
  const fromSitemap = sitemapUrls();
  if (fromSitemap) {
    urlList = fromSitemap;
  } else {
    // Loud, because the difference is silent otherwise: the submission still
    // succeeds, just against a fraction of the site.
    console.warn(
      `[indexnow] no sitemap at ${SITEMAP} — run \`npm run build\` first. ` +
        `Falling back to ${ROUTES.length} hand-kept routes, which omits ` +
        `product and What's New pages.`,
    );
    urlList = ROUTES.map((route) => `${SITE}${route}`);
  }
}

if (DRY_RUN) {
  console.log(`[indexnow] DRY RUN — would submit ${urlList.length} URLs:`);
  for (const url of urlList) console.log(`  ${url}`);
  process.exit(0);
}

try {
  const res = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: "www.adlmstudio.net",
      key: KEY,
      keyLocation: `${SITE}/${KEY}.txt`,
      urlList,
    }),
  });

  if (res.ok) {
    console.log(`[indexnow] submitted ${urlList.length} URLs (HTTP ${res.status}).`);
  } else if (res.status === 422) {
    // The one failure worth naming: it means /<key>.txt did not serve the key.
    console.warn(
      `[indexnow] rejected (422). ${SITE}/${KEY}.txt must return exactly the ` +
        `key. Check INDEXNOW_KEY is set on the deployment too.`,
    );
  } else {
    console.warn(`[indexnow] not accepted (HTTP ${res.status}).`);
  }
} catch (e) {
  console.warn(`[indexnow] submission failed: ${e?.message || e}`);
}
