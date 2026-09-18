// Seeds the read-only sample projects (learning material) for QUIV and HERON:
// four duplex designs, one per foundation type, each a complete job with bill,
// budget, locked contract, certificates, variations and programme. QUIV samples
// also carry architectural and structural IFC models, uploaded to R2.
//
// Dry run by default: builds everything, writes the IFC files and project JSON
// to seed/samples/.out for review, and prints a summary. Nothing is written to
// the database or R2 without --apply.
//
// Usage (from server/):
//   node scripts/seed-sample-projects.mjs                  # dry run, both products
//   node scripts/seed-sample-projects.mjs --product revit  # dry run, QUIV only
//   node scripts/seed-sample-projects.mjs --apply          # write DB + R2
//   node scripts/seed-sample-projects.mjs --remove --apply # delete every sample
//
// Re-running --apply updates the samples in place (same _id, same URL).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGNS } from "../seed/samples/duplexModel.js";
import { buildSampleProject } from "../seed/samples/sampleProject.js";
import { writeIfc } from "../seed/samples/ifcWriter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "seed", "samples", ".out");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const APPLY = flag("apply");
const REMOVE = flag("remove");
const PRODUCTS = opt("product") ? [opt("product")] : ["revit", "planswift"];
const ONLY = opt("only");

for (const p of PRODUCTS) {
  if (!["revit", "planswift"].includes(p)) {
    console.error(`Unknown --product ${p}. Use revit (QUIV) or planswift (HERON).`);
    process.exit(1);
  }
}

const naira = (n) => `N${(n / 1e6).toFixed(2)}m`;
const designs = DESIGNS.filter((d) => !ONLY || d.key === ONLY);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  let TakeoffProject = null;
  let uploadBufferToR2 = null;
  if (APPLY) {
    const { connectDB } = await import("../db.js");
    ({ TakeoffProject } = await import("../models/TakeoffProject.js"));
    ({ uploadBufferToR2 } = await import("../utils/r2Upload.js"));
    await connectDB();
  }

  if (REMOVE) {
    const filter = { isSample: true, productKey: { $in: PRODUCTS } };
    if (!APPLY) {
      console.log(`[dry run] would delete every sample project for: ${PRODUCTS.join(", ")}`);
      return;
    }
    const r = await TakeoffProject.deleteMany(filter);
    console.log(`Deleted ${r.deletedCount} sample project(s). R2 objects under adlm/samples/ were left in place.`);
    return;
  }

  // IFC files are the same for every run, so they are built once per design.
  const ifcFiles = {};
  for (const d of designs) {
    const { model, project } = buildSampleProject(d, "revit");
    for (const disc of ["architectural", "structural"]) {
      const text = writeIfc({
        projectName: project.name,
        buildingName: d.title,
        siteName: d.location,
        elements: model.elements,
        discipline: disc,
        seed: `${d.key}-${disc}`,
        storeyHeight: d.storeyHeight,
      });
      const file = `${d.key}-${disc}.ifc`;
      fs.writeFileSync(path.join(OUT, file), text);
      ifcFiles[`${d.key}:${disc}`] = { file, buffer: Buffer.from(text, "ascii") };
    }
  }

  const rows = [];
  for (const productKey of PRODUCTS) {
    for (const d of designs) {
      const modelUrls = {};
      if (productKey === "revit") {
        for (const disc of ["architectural", "structural"]) {
          const f = ifcFiles[`${d.key}:${disc}`];
          const key = `adlm/samples/ifc/${f.file}`;
          if (APPLY) {
            const up = await uploadBufferToR2(f.buffer, {
              key,
              contentType: "application/x-step",
              cacheControl: "public, max-age=3600",
            });
            modelUrls[disc] = { key: up.public_id, url: up.secure_url, sizeBytes: f.buffer.length };
          } else {
            modelUrls[disc] = { key, url: "", sizeBytes: f.buffer.length };
          }
        }
      }

      const { project } = buildSampleProject(d, productKey, { modelUrls });
      fs.writeFileSync(
        path.join(OUT, `${productKey}-${d.key}.json`),
        JSON.stringify(project, null, 2),
      );

      let action = "dry run";
      if (APPLY) {
        const filter = { productKey, isSample: true, "sample.key": d.key };
        const existing = await TakeoffProject.findOne(filter);
        const doc = existing || new TakeoffProject();
        doc.set(project);
        await doc.save();
        action = existing ? `updated ${doc._id}` : `created ${doc._id}`;
      }

      const measured = project.items.reduce((a, it) => a + it.qty * it.rate, 0);
      const last = project.certificates[project.certificates.length - 1];
      rows.push({
        product: productKey === "revit" ? "QUIV" : "HERON",
        sample: d.key,
        lines: project.items.length,
        budget: project.budgetItems.length,
        measured: naira(measured),
        contract: naira(project.contract.contractSum),
        certs: project.certificates.length,
        valued: `${Math.round((last.cumulativeValue / project.contract.contractSum) * 100)}%`,
        final: project.finalAccount.finalized ? "yes" : "",
        action,
      });
    }
  }
  console.table(rows);
  console.log(`IFC files and project JSON written to ${OUT}`);
  if (!APPLY) console.log("Dry run: nothing was written to the database or R2. Re-run with --apply to seed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
