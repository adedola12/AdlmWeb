// scripts/gen-changelog.mjs
//
// Generates src/data/quivChangelog.js from src/data/quiv-changelog.md.
// The markdown is the single source of truth — edit that, never the .js.
//
// Run manually:           npm run gen:changelog
// Runs automatically on:   npm run build  (prebuild)  and  npm run dev (predev)
//
// Pure Node, no dependencies. Parsing rules:
//   ## <version> — <date> — <title>     → a release (top one = latest)
//   <paragraph under the heading>        → that release's "highlight"
//   ### New | Improved | Fixed           → a change group (matched by keyword;
//                                          emojis/extra words are ignored)
//   - bullet                             → an item in the current group

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src/data/quiv-changelog.md");
const OUT = resolve(__dirname, "../src/data/quivChangelog.js");

// Product meta that rarely changes. `compatibility` is overridden by the
// markdown's "> **Compatibility:** …" line when present.
const PRODUCT = {
  name: "QUIV",
  tagline: "Quantity takeoff & estimating for Autodesk Revit",
  compatibility: "Revit 2024, 2026 & 2027",
};

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

function parse(md) {
  const lines = md.split(/\r?\n/);
  const releases = [];
  let compatibility = PRODUCT.compatibility;

  let cur = null; // current release being built
  let group = null; // current change group being built
  let inComment = false; // inside an <!-- … --> HTML comment block

  const flushGroup = () => {
    if (cur && group && group.items.length) cur.changes.push(group);
    group = null;
  };
  const flushRelease = () => {
    flushGroup();
    if (cur) {
      cur.highlight = cur._hl.join(" ").trim();
      if (!cur.highlight) delete cur.highlight;
      delete cur._hl;
      releases.push(cur);
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    // Skip HTML comment blocks (the editing instructions in the .md).
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.startsWith("<!--")) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }

    // Compatibility blockquote (before the first release).
    if (!cur && /^>\s/.test(line) && /compatibility/i.test(line)) {
      const m = line.replace(/^>\s*/, "").match(/compatibility:?\s*(.+)$/i);
      if (m) compatibility = stripInline(m[1]);
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
      cur = {
        version,
        date,
        latest: releases.length === 0,
        title,
        changes: [],
        _hl: [],
      };
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

  // Fallback title if a release heading omitted one.
  for (const r of releases) {
    if (!r.title) r.title = `Version ${r.version}`;
  }

  return { product: { ...PRODUCT, compatibility }, releases };
}

function emit({ product, releases }) {
  return `/* eslint-disable */
// ⚠️  AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Source of truth: src/data/quiv-changelog.md
// Regenerate:      npm run gen:changelog  (also runs on build & dev)
export const QUIV_PRODUCT = ${JSON.stringify(product, null, 2)};

export const releases = ${JSON.stringify(releases, null, 2)};

export default releases;
`;
}

const md = readFileSync(SRC, "utf8");
const data = parse(md);

if (!data.releases.length) {
  console.error("[gen-changelog] No releases parsed from", SRC);
  process.exit(1);
}

writeFileSync(OUT, emit(data), "utf8");
const counts = data.releases
  .map((r) => `v${r.version} (${r.changes.reduce((n, g) => n + g.items.length, 0)} items)`)
  .join(", ");
console.log(`[gen-changelog] Wrote ${data.releases.length} releases → ${OUT}`);
console.log(`[gen-changelog] ${counts}`);
