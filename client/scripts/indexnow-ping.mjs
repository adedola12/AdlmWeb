// Submits the site's URLs to IndexNow. Run after a deploy.
//
//   node scripts/indexnow-ping.mjs
//   node scripts/indexnow-ping.mjs https://www.adlmstudio.net/products
//
// With no arguments it submits every route in the sitemap, which is the right
// thing to do exactly once: right after the deploy that gives these pages real
// HTML for the first time. Bing currently holds them as empty, and it will not
// find out otherwise until it recrawls on its own schedule.
//
// Afterwards, prefer passing the specific URLs that changed. Submitting the
// whole site on every deploy is the behaviour that gets a key rate-limited.
//
// Never fails a deploy. A search engine ping is not worth a red build.
import { ROUTES } from "./seo-routes.mjs";

const SITE = "https://www.adlmstudio.net";
const KEY = String(process.env.INDEXNOW_KEY || "").trim();

if (!KEY) {
  console.log("[indexnow] INDEXNOW_KEY not set — nothing submitted.");
  process.exit(0);
}

const explicit = process.argv.slice(2).filter(Boolean);
const urlList = explicit.length
  ? explicit
  : ROUTES.map((route) => `${SITE}${route}`);

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
