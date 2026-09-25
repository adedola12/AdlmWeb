// Seeds the read-only sample projects (learning material) for every ADLM
// product with a cloud project view:
//   revit (QUIV), planswift (HERON)  four duplexes, one per foundation type
//   mep (Revit MEP)                  the services for the same four duplexes
//   civil3d (CIVIQ)                  four roads (asphalt, concrete, interlock, laterite)
//   archicad (ArchiCAD)              the four duplexes, with their ArchiCAD BoQ versions
// Each is a complete job: bill, budget, locked contract, certificates,
// variations and programme. Model-based samples also carry IFC models, uploaded
// to R2.
//
// Dry run by default: builds everything, writes the IFC files and project JSON
// to seed/samples/.out for review, and prints a summary. Nothing is written to
// the database or R2 without --apply.
//
// Usage (from server/):
//   node scripts/seed-sample-projects.mjs                  # dry run, every product
//   node scripts/seed-sample-projects.mjs --product mep    # dry run, one product
//   node scripts/seed-sample-projects.mjs --apply          # write DB + R2
//   node scripts/seed-sample-projects.mjs --remove --apply # delete every sample
//
// Re-running --apply updates the samples in place (same _id, same URL).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGNS } from "../seed/samples/duplexModel.js";
import { assembleSampleProject, duplexScheme } from "../seed/samples/sampleProject.js";
import { mepScheme } from "../seed/samples/mepSample.js";
import { ROAD_DESIGNS, roadScheme } from "../seed/samples/roadSample.js";
import { archicadVersionDoc } from "../seed/samples/archicadSample.js";
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
// productKey -> the product's name, its designs and how each becomes a scheme.
const REGISTRY = {
  revit: { name: "QUIV", designs: DESIGNS, scheme: (d) => duplexScheme(d, "revit") },
  planswift: { name: "HERON", designs: DESIGNS, scheme: (d) => duplexScheme(d, "planswift") },
  mep: { name: "Revit MEP", designs: DESIGNS, scheme: mepScheme },
  civil3d: { name: "CIVIQ", designs: ROAD_DESIGNS, scheme: roadScheme },
  archicad: { name: "ArchiCAD", designs: DESIGNS, scheme: (d) => duplexScheme(d, "archicad") },
};
const PRODUCTS = opt("product") ? [opt("product")] : Object.keys(REGISTRY);
const ONLY = opt("only");

for (const p of PRODUCTS) {
  if (!REGISTRY[p]) {
    console.error(`Unknown --product ${p}. Use one of: ${Object.keys(REGISTRY).join(", ")}.`);
    process.exit(1);
  }
}

const naira = (n) => `N${(n / 1e6).toFixed(2)}m`;

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
    if (PRODUCTS.includes("archicad")) {
      const { ArchicadBoqVersion: V } = await import("../models/ArchicadBoqVersion.js");
      const ids = await TakeoffProject.find({ isSample: true, productKey: "archicad" }).distinct("_id");
      await V.deleteMany({ projectId: { $in: ids } });
    }
    const r = await TakeoffProject.deleteMany(filter);
    console.log(`Deleted ${r.deletedCount} sample project(s). R2 objects under adlm/samples/ were left in place.`);
    return;
  }

  let ArchicadBoqVersion = null;
  if (APPLY && PRODUCTS.includes("archicad")) {
    ({ ArchicadBoqVersion } = await import("../models/ArchicadBoqVersion.js"));
  }

  const rows = [];
  // An IFC file depends only on the scheme's model, so one upload serves
  // every product that shares it (QUIV and ArchiCAD share the duplex).
  const uploaded = {};
  for (const productKey of PRODUCTS) {
    const reg = REGISTRY[productKey];
    for (const d of reg.designs.filter((x) => !ONLY || x.key === ONLY)) {
      const scheme = reg.scheme(d);
      const modelUrls = {};
      for (const disc of scheme.modelDisciplines || []) {
        const file = `${d.key}-${disc}.ifc`;
        if (!uploaded[file]) {
          const text = writeIfc({
            projectName: `Sample: ${scheme.design.title}`,
            buildingName: scheme.design.title,
            siteName: d.location,
            elements: scheme.model.elements,
            discipline: disc,
            seed: `${d.key}-${disc}`,
            storeyHeight: d.storeyHeight,
            storeyLevels: scheme.storeyLevels,
          });
          fs.writeFileSync(path.join(OUT, file), text);
          const buffer = Buffer.from(text, "ascii");
          const key = `adlm/samples/ifc/${file}`;
          if (APPLY) {
            const up = await uploadBufferToR2(buffer, {
              key,
              contentType: "application/x-step",
              cacheControl: "public, max-age=3600",
            });
            uploaded[file] = { key: up.public_id, url: up.secure_url, sizeBytes: buffer.length };
          } else {
            uploaded[file] = { key, url: "", sizeBytes: buffer.length };
          }
        }
        modelUrls[disc] = uploaded[file];
      }

      const { project } = assembleSampleProject(scheme, productKey, { modelUrls });
      const boq = productKey === "archicad" ? archicadVersionDoc(scheme, project) : null;
      fs.writeFileSync(
        path.join(OUT, `${productKey}-${d.key}.json`),
        JSON.stringify(boq ? { project, boq } : project, null, 2),
      );

      let action = "dry run";
      if (APPLY) {
        const filter = { productKey, isSample: true, "sample.key": d.key };
        const existing = await TakeoffProject.findOne(filter);
        const doc = existing || new TakeoffProject();
        doc.set(project);
        await doc.save();
        action = existing ? `updated ${doc._id}` : `created ${doc._id}`;
        if (boq) {
          // One current BoQ version per ArchiCAD sample, replaced on re-seed.
          await ArchicadBoqVersion.deleteMany({ projectId: doc._id });
          await ArchicadBoqVersion.create({ projectId: doc._id, ...boq });
        }
      }

      const measured = project.items.reduce((a, it) => a + it.qty * it.rate, 0);
      const last = project.certificates[project.certificates.length - 1];
      rows.push({
        product: reg.name,
        sample: d.key,
        lines: project.items.length,
        budget: project.budgetItems.length,
        measured: naira(measured),
        contract: naira(project.contract.contractSum),
        certs: project.certificates.length,
        valued: `${Math.round((last.cumulativeValue / project.contract.contractSum) * 100)}%`,
        final: project.finalAccount.finalized ? "yes" : "",
        model: Object.keys(modelUrls).join("+"),
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
