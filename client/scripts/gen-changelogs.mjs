// scripts/gen-changelogs.mjs
//
// Generates src/data/changelogs.js from every src/data/changelogs/*.md file
// (one markdown file per product). The markdown is the single source of truth
// — edit those, never the generated .js.
//
// Run manually:           npm run gen:changelogs
// Runs automatically on:   npm run build  (prebuild)  and  npm run dev (predev)
//
// Pure Node, no dependencies. Each .md file is:
//   ---                                  ← front matter (product card metadata)
//   slug: quiv
//   name: QUIV
//   accent: orange
//   ...
//   ---
//   ## <version> — <date> — <title>      → a release (top one = latest)
//   <paragraph under the heading>        → that release's "highlight"
//   ### New | Improved | Fixed           → a change group (matched by keyword)
//   - bullet                             → an item in the current group

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dedash } from "./lib/dedash.mjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, "../src/data/changelogs");
const OUT = resolve(__dirname, "../src/data/changelogs.js");

// Spaced dash separator used in the heading: " — " / " – " / " - ".
const DASH = /\s+[—–-]\s+/;

function stripInline(s) {
  return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function classifyType(heading) {
  const h = heading.toLowerCase();
  if (/\bfix|bug\b/.test(h)) return "fixed";
  if (/improv|enhanc|chang|updat/.test(h)) return "improved";
  if (/\bnew\b|feature|add/.test(h)) return "new";
  return null; // unrecognised section — skipped
}

// Pull a leading `--- … ---` front-matter block off the top of the file.
// Returns { meta, body }. Release separators (`---`) inside the body are left
// untouched because we only consume the FIRST fenced block.
function splitFrontMatter(md) {
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (!lines[i] || lines[i].trim() !== "---") return { meta: {}, body: md };

  const meta = {};
  i++;
  for (; i < lines.length && lines[i].trim() !== "---"; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  i++; // skip the closing ---
  return { meta, body: lines.slice(i).join("\n") };
}

function parseReleases(body) {
  const lines = body.split(/\r?\n/);
  const releases = [];
  let cur = null; // current release
  let group = null; // current change group
  let inComment = false; // inside an <!-- … --> HTML comment block

  const flushGroup = () => {
    if (cur && group && group.items.length) cur.changes.push(group);
    group = null;
  };
  const flushRelease = () => {
    flushGroup();
    if (cur) {
      cur.highlight = cur._hl.join(" ").trim();
      // Every release must carry a highlight, because the highlight is now the
      // ONLY prose that ships (see stripDetail below). If the note has none,
      // fall back to the lead sentence of its first bullet rather than
      // publishing a release with no description at all.
      if (!cur.highlight) {
        const first = cur.changes[0]?.items?.[0] || "";
        cur.highlight = (first.split(/(?<=\.)\s/)[0] || "").trim();
      }
      if (!cur.highlight) delete cur.highlight;
      delete cur._hl;
      releases.push(cur);
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.startsWith("<!--")) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }

    // Release heading — exactly two leading '#'.
    const relMatch = line.match(/^##\s+(?!#)(.*)$/);
    if (relMatch) {
      flushRelease();
      const head = relMatch[1].trim().replace(/^version\s+/i, "");
      const parts = head.split(DASH);
      const version = (parts[0] || head).replace(/^v/i, "").trim();
      const date = (parts[1] || "").trim();
      const title = parts.slice(2).join(" — ").trim();
      cur = { version, date, latest: releases.length === 0, title, changes: [], _hl: [] };
      continue;
    }

    if (!cur) continue;

    // Change-group heading — three leading '#'.
    const grpMatch = line.match(/^###\s+(.*)$/);
    if (grpMatch) {
      flushGroup();
      const type = classifyType(grpMatch[1]);
      group = type ? { type, items: [] } : null;
      continue;
    }

    // Bullet item.
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (group) group.items.push(stripInline(bullet[1]));
      continue;
    }

    // Horizontal rule / blank line.
    if (/^-{3,}$/.test(line) || line === "") continue;

    // Anything else before the first group → release highlight text.
    if (!group) cur._hl.push(stripInline(line));
  }
  flushRelease();

  for (const r of releases) if (!r.title) r.title = `Version ${r.version}`;
  return releases;
}

function buildProduct(file) {
  const { meta, body } = splitFrontMatter(readFileSync(join(SRC_DIR, file), "utf8"));
  const releases = parseReleases(body);
  const slug = (meta.slug || file.replace(/\.md$/, "")).toLowerCase();
  const status = (meta.status || (releases.length ? "live" : "coming-soon")).toLowerCase();
  const itemCount = releases.reduce((n, r) => n + r.changes.reduce((m, g) => m + g.items.length, 0), 0);

  // WHAT SHIPS TO THE BROWSER
  // The bullets under each release are our internal record: they name file
  // paths, environment variables, root causes and the exact shape of past
  // defects. Publishing them told competitors how the products are built and
  // read, page after page, as an apology.
  //
  // So the site publishes the one-to-two sentence highlight and the change
  // TYPES (which render as the New / Improved / Fixed pills) — and nothing
  // else. The bullets stay in src/data/changelogs/*.md as the internal record
  // and as the source for the user guides; they simply never reach the bundle.
  const published = releases.map((r) => ({
    ...r,
    changes: r.changes.map((g) => ({ type: g.type })),
  }));

  return {
    slug,
    name: meta.name || slug.toUpperCase(),
    tagline: meta.tagline || "",
    category: meta.category || "",
    accent: meta.accent || "blue",
    icon: meta.icon || "cube",
    status,
    compatibility: meta.compatibility || "",
    summary: meta.summary || meta.tagline || "",
    order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : 999,
    latest: releases[0]?.version || null,
    lastUpdated: releases[0]?.date || null,
    itemCount,
    releases: published,
  };
}

const files = readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith(".md"));
if (!files.length) {
  console.error("[gen-changelogs] No .md files found in", SRC_DIR);
  process.exit(1);
}

const products = files
  .map(buildProduct)
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

// Every string in the payload, dash-free. Applied here rather than in the
// markdown so the source a human writes stays natural, and so a changelog
// pasted in from a plugin CHANGELOG cannot reintroduce them.
function dedashDeep(value) {
  if (typeof value === "string") return dedash(value);
  if (Array.isArray(value)) return value.map(dedashDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dedashDeep(v)]));
  }
  return value;
}

const out = `/* eslint-disable */
// ⚠️  AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Source of truth: src/data/changelogs/*.md  (one markdown file per product)
// Regenerate:      npm run gen:changelogs  (also runs on build & dev)
export const products = ${JSON.stringify(dedashDeep(products), null, 2)};

export const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));

export default products;
`;

writeFileSync(OUT, out, "utf8");
console.log(`[gen-changelogs] Wrote ${products.length} products → ${OUT}`);
for (const p of products) {
  console.log(`  • ${p.name} (${p.slug}) — ${p.status}, ${p.releases.length} releases, ${p.itemCount} items`);
}
