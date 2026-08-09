/**
 * Writes dist/sitemap.xml at build time.
 *
 * Runs as `postbuild`, so it cannot be forgotten and cannot drift from a
 * deploy: every Vercel build regenerates it.
 *
 * Three sources, in descending order of reliability:
 *   1. A hand-kept list of marketing routes. These change rarely and a wrong
 *      one is obvious.
 *   2. What's New slugs, read off the markdown in src/data/changelogs. Local,
 *      so it cannot fail.
 *   3. Products, fetched from the live API. This one CAN fail — a build must
 *      not, so a network problem logs and drops to the first two rather than
 *      breaking the deploy. A sitemap missing product URLs is a bad day; a
 *      failed deploy because a sitemap could not be written is a worse one.
 *
 * Only publicly indexable routes belong here. Anything in robots.txt under
 * Disallow must not appear — listing a URL you also forbid is a contradiction
 * Search Console reports as an error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const SITE = "https://www.adlmstudio.net";
const API = process.env.VITE_API_BASE || "https://api.adlmstudio.net";

/** priority is a hint, not a ranking factor. Kept coarse on purpose. */
const STATIC_ROUTES = [
  ["/", "weekly", "1.0"],
  ["/products", "weekly", "0.9"],
  ["/learn", "weekly", "0.8"],
  ["/trainings", "weekly", "0.8"],
  ["/about", "monthly", "0.7"],
  ["/testimonials", "monthly", "0.6"],
  ["/freebies", "monthly", "0.6"],
  ["/whats-new", "weekly", "0.6"],
  ["/support", "monthly", "0.4"],
  ["/quote", "monthly", "0.4"],
  ["/time-management", "monthly", "0.5"],
];

function iso(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** What's New slugs are the changelog filenames. */
function changelogSlugs() {
  const dir = path.join(root, "src", "data", "changelogs");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        loc: `/whats-new/${f.replace(/\.md$/, "")}`,
        lastmod: iso(fs.statSync(path.join(dir, f)).mtime),
        changefreq: "monthly",
        priority: "0.5",
      }));
  } catch {
    return [];
  }
}

async function productUrls() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API}/products?page=1&pageSize=200`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    return items
      // A product with no key has no reachable URL, and a "coming soon" page
      // is a thin page — both hurt more than the extra entry helps.
      .filter((p) => (p?.key || p?.productKey) && !p?.isComingSoon)
      .map((p) => ({
        loc: `/product/${encodeURIComponent(p.key || p.productKey)}`,
        lastmod: p.updatedAt ? iso(p.updatedAt) : iso(Date.now()),
        changefreq: "weekly",
        priority: "0.8",
      }));
  } catch (err) {
    console.warn(
      `[sitemap] product URLs skipped (${err.message}). ` +
        `Static and What's New routes still written.`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const entries = [
  ...STATIC_ROUTES.map(([loc, changefreq, priority]) => ({
    loc,
    changefreq,
    priority,
    lastmod: iso(Date.now()),
  })),
  ...changelogSlugs(),
  ...(await productUrls()),
];

// A duplicate <loc> is an error in Search Console, and two sources can
// legitimately produce the same path.
const seen = new Set();
const unique = entries.filter((e) => !seen.has(e.loc) && seen.add(e.loc));

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  unique
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${SITE}${e.loc}</loc>\n` +
        `    <lastmod>${e.lastmod}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `    <priority>${e.priority}</priority>\n` +
        `  </url>\n`,
    )
    .join("") +
  `</urlset>\n`;

const out = path.join(root, "dist", "sitemap.xml");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, xml);
console.log(`[sitemap] ${unique.length} URLs -> dist/sitemap.xml`);
