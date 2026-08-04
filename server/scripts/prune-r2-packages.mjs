#!/usr/bin/env node
/**
 * Deletes superseded installer packages from R2, keeping the ones any product
 * still points at plus a configurable number of previous versions.
 *
 * WHY NOT DELETE ON UPLOAD
 *   Deleting inside the upload path means a failure mid-publish can remove the
 *   package customers are currently installing, and there is no undo — R2 has
 *   no bucket versioning here. Pruning as a separate, dry-run-by-default step
 *   keeps the destructive part deliberate and reviewable.
 *
 * WHY NOT AN R2 LIFECYCLE RULE
 *   Lifecycle rules delete by AGE. A product that has not shipped in six
 *   months would have its LIVE package deleted, and the first sign would be
 *   customers unable to install. This script decides by "is anything still
 *   pointing at it", which is the actual question.
 *
 * WHAT IS NEVER DELETED
 *   Any object whose URL appears as packageUri on a ProductDeployment. That is
 *   read from the database at run time, so a product added later is protected
 *   without touching this script.
 *
 * USAGE
 *   node scripts/prune-r2-packages.mjs                  # dry run, keep 2 previous
 *   node scripts/prune-r2-packages.mjs --keep 1
 *   node scripts/prune-r2-packages.mjs --delete         # actually remove
 *
 * Needs MONGO_URI and the five R2_* variables in the environment.
 */

import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { ProductDeployment } from "../models/ProductDeployment.js";
import { isR2Configured, listFromR2, deleteFromR2 } from "../utils/r2Upload.js";

const args = process.argv.slice(2);
const DO_DELETE = args.includes("--delete");
const keepIdx = args.indexOf("--keep");
const KEEP = keepIdx > -1 ? Math.max(0, Number(args[keepIdx + 1])) : 2;

const fmt = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/**
 * Groups by the product a package belongs to.
 *
 * Keys look like  adlm/installers/<baseName>/<fileName>  where baseName is the
 * sanitized file name and therefore carries the VERSION — which is exactly why
 * every release lands in its own folder and nothing is ever overwritten. The
 * family is the name with the trailing version stripped, so
 * adlm-revit-plugin-v3.1.7 and adlm-revit-plugin-v3.1.6 group together.
 */
function familyOf(key) {
  const parts = key.split("/");
  const base = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return base.replace(/[-_.]?v?\d+(\.\d+)*$/i, "") || base;
}

const main = async () => {
  if (!isR2Configured()) {
    console.error(
      "\n  R2 is not configured. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID," +
        "\n  R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL.\n",
    );
    process.exit(1);
  }

  await connectDB(process.env.MONGO_URI);

  const deployments = await ProductDeployment.find({}, { productKey: 1, version: 1, packageUri: 1 }).lean();
  const live = new Set(
    deployments.map((d) => String(d.packageUri || "").trim()).filter(Boolean),
  );

  console.log(`\nLive packages referenced by ${deployments.length} deployment record(s):`);
  for (const d of deployments) {
    console.log(`  ${String(d.productKey).padEnd(16)} v${d.version || "?"}  ${d.packageUri || "(none)"}`);
  }

  const objects = await listFromR2("adlm/installers");
  console.log(`\n${objects.length} object(s) in R2 under adlm/installers`);

  const families = new Map();
  for (const o of objects) {
    const f = familyOf(o.publicId);
    if (!families.has(f)) families.set(f, []);
    families.get(f).push(o);
  }

  const toDelete = [];
  let keptBytes = 0;

  for (const [family, items] of [...families].sort()) {
    // Newest first, so "keep N previous" means the N after the live one.
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    console.log(`\n${family}`);
    let keptPrevious = 0;

    for (const o of items) {
      const isLive = live.has(o.packageUri);
      let verdict;

      if (isLive) {
        verdict = "LIVE      keep — a deployment points at this";
        keptBytes += o.bytes;
      } else if (keptPrevious < KEEP) {
        keptPrevious += 1;
        verdict = `rollback  keep — previous ${keptPrevious} of ${KEEP}`;
        keptBytes += o.bytes;
      } else {
        verdict = "SUPERSEDED  delete";
        toDelete.push(o);
      }

      const when = o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : "unknown";
      console.log(`  ${verdict.padEnd(42)} ${o.originalName}  ${fmt(o.bytes)}  ${when}`);
    }
  }

  const freed = toDelete.reduce((n, o) => n + o.bytes, 0);
  console.log(`\n${"-".repeat(70)}`);
  console.log(`Keeping  : ${objects.length - toDelete.length} object(s), ${fmt(keptBytes)}`);
  console.log(`Deleting : ${toDelete.length} object(s), ${fmt(freed)} freed`);

  if (!toDelete.length) {
    console.log("\nNothing to prune.\n");
  } else if (!DO_DELETE) {
    console.log(
      "\nDRY RUN — nothing was deleted. Re-run with --delete to remove them." +
        "\nCheck the LIVE lines above first: anything listed as LIVE is what your" +
        "\ncustomers are installing right now.\n",
    );
  } else {
    console.log("");
    for (const o of toDelete) {
      try {
        await deleteFromR2(o.publicId);
        console.log(`  deleted  ${o.originalName}`);
      } catch (e) {
        console.log(`  FAILED   ${o.originalName}: ${e?.message || e}`);
      }
    }
    console.log(`\nDone. ${fmt(freed)} freed.\n`);
  }

  await mongoose.connection.close();
};

main().catch(async (e) => {
  console.error(`\n  ERROR: ${e?.message || e}\n`);
  try { await mongoose.connection.close(); } catch { /* already closed */ }
  process.exit(1);
});
