// server/scripts/seed-changelogs.js
//
// Seed the ChangelogProduct collection from the bundled, markdown-generated
// client/src/data/changelogs.js (the existing source of truth). This keeps the
// markdown → generator pipeline as the seed path: edit the .md files, run
// `npm run gen:changelogs` in client/, then run this script.
//
// Usage (from server/):
//   node scripts/seed-changelogs.js           # insert only products that don't exist yet
//   node scripts/seed-changelogs.js --force    # also overwrite existing products (clobbers admin edits)
//
// Idempotent without --force: existing products (matched by slug) are left
// untouched so it never overwrites changes made in the admin UI.
import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { connectDB } from "../db.js";
import { ChangelogProduct } from "../models/Changelog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// Strip the computed/public-only fields back down to the stored DB shape.
function toDbShape(p) {
  return {
    slug: String(p.slug || "").toLowerCase(),
    name: p.name || "",
    tagline: p.tagline || "",
    category: p.category || "",
    accent: p.accent || "blue",
    icon: p.icon || "cube",
    status: p.status || (p.releases?.length ? "live" : "coming-soon"),
    compatibility: p.compatibility || "",
    summary: p.summary || "",
    order: Number.isFinite(Number(p.order)) ? Number(p.order) : 999,
    releases: (p.releases || []).map((r) => ({
      version: String(r.version || "").trim(),
      date: String(r.date || "").trim(),
      title: String(r.title || "").trim(),
      highlight: String(r.highlight || "").trim(),
      changes: (r.changes || [])
        .map((g) => ({
          type: String(g.type || "").toLowerCase(),
          items: (g.items || []).map((s) => String(s).trim()).filter(Boolean),
        }))
        .filter((g) => ["new", "improved", "fixed"].includes(g.type) && g.items.length),
    })),
  };
}

async function main() {
  const force = hasFlag("--force");

  const genPath = resolve(__dirname, "../../client/src/data/changelogs.js");
  let products;
  try {
    const mod = await import(pathToFileURL(genPath).href);
    products = mod.products || mod.default;
  } catch (err) {
    console.error(`[seed-changelogs] Could not import ${genPath}`);
    console.error("Run `npm run gen:changelogs` in client/ first.");
    console.error(err?.message || err);
    process.exit(1);
  }

  if (!Array.isArray(products) || !products.length) {
    console.error("[seed-changelogs] No products found in changelogs.js");
    process.exit(1);
  }

  await connectDB(process.env.MONGO_URI);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of products) {
    const shape = toDbShape(p);
    const existing = await ChangelogProduct.findOne({ slug: shape.slug });

    if (!existing) {
      await ChangelogProduct.create(shape);
      inserted += 1;
      console.log(`  + inserted ${shape.slug} (${shape.releases.length} releases)`);
    } else if (force) {
      existing.set(shape);
      await existing.save();
      updated += 1;
      console.log(`  ~ overwrote ${shape.slug} (${shape.releases.length} releases)`);
    } else {
      skipped += 1;
      console.log(`  · skipped ${shape.slug} (exists — use --force to overwrite)`);
    }
  }

  console.log(
    `[seed-changelogs] done — ${inserted} inserted, ${updated} overwritten, ${skipped} skipped.`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-changelogs] failed:", err);
  process.exit(1);
});
