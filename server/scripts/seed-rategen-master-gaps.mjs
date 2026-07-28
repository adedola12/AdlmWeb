// server/scripts/seed-rategen-master-gaps.mjs
//
// Adds the handful of resources that the RateGen master price lists are
// genuinely missing — the ones the build-up sheets already price but that have
// no row of their own in ADLMRateDB.Materials / .labours.
//
// WHY THIS EXISTS
// The AI cost-intelligence service looks resources up BY NAME. Anything the
// build-ups reference but the master lists don't carry simply returns "no
// match", so the QS gets a model estimate instead of a library benchmark.
// Auditing all 285 names referenced by the build-ups found that the great
// majority are NOT missing materials at all — they are build-up internals
// (subtotals, "Add waste" percentages, "Output per day" rates) or job-specific
// composites ("Sheeting (975 x 2250)", "Mortar 12mm thick (See Blockwork)").
// Those must NOT become catalogue rows. What follows is only the genuine
// catalogue gaps.
//
// NOTHING HERE IS INVENTED. Every price is either taken from ADLM's own
// build-up breakdowns or derived from existing master rows, and the derivation
// is written out beside each entry so it can be checked.
//
// SAFETY
//   * Dry run by default. It prints every row it would write and exits.
//     Pass --write to actually insert.
//   * Idempotent: an existing (name, zone) row is never modified or
//     overwritten, only reported as "exists".
//   * Every inserted row carries seedSource: "master-gaps-v1", so the whole
//     batch can be found or removed with one query:
//        db.Materials.deleteMany({ seedSource: "master-gaps-v1" })
//
// USAGE
//   node server/scripts/seed-rategen-master-gaps.mjs            # dry run
//   node server/scripts/seed-rategen-master-gaps.mjs --write    # apply
//   node server/scripts/seed-rategen-master-gaps.mjs --write --only=materials
//
// Lives in the website repo because the AI service treats the RateGen library
// as read-only grounding data (see its CLAUDE.md); the website already owns
// RATEGEN_MONGO_URI and the RateGen admin surface.

import "dotenv/config";
import { MongoClient } from "mongodb";

const ZONES = [
  "north_central",
  "north_east",
  "north_west",
  "south_east",
  "south_south",
  "south_west",
];

// Regional spread measured from the 60 materials that are currently priced in
// all six zones: the median ratio of each zone's price to south_west. Applied
// to material rows so a new entry varies by region the way the existing
// catalogue does, instead of being flat.
const ZONE_FACTOR = {
  south_west: 1.0,
  north_central: 1.0204,
  north_east: 1.0612,
  north_west: 1.0918,
  south_east: 1.0714,
  south_south: 1.125,
};

// Prices below are the SOUTH_WEST base; other zones are derived from it.
const MATERIALS = [
  {
    name: "Granite (including transportation)",
    unit: "m3",
    category: "Crushed Rock Products",
    priceSouthWest: 33000,
    why:
      "The only aggregate the build-ups price by volume, and the master list has NO granite row at all. " +
      "Name and price are taken verbatim from the concretework build-ups (12 uses at N33,000/m3; a few carry N43,072 — " +
      "raise this if the higher figure is the current one). Cross-check: Crushed Rock Products runs N16,000-29,800 per " +
      "TONNE, and granite is roughly 1.5 t/m3, so ~N24,000-45,000/m3 — N33,000 sits mid-range.",
  },
  {
    // Name kept SHORT on purpose. "Steel reinforcement (high tensile)" reads
    // better but is unfindable: lookup penalises candidate words the query
    // never mentioned, so a QS typing "reinforcement" scored it 1.0 - 3x0.25 =
    // 0.25, under the 0.3 floor, and got nothing. The grade is already carried
    // by MaterialCategory, so the parenthetical only cost recall.
    name: "Steel reinforcement",
    unit: "Tonne",
    category: "High Tensile Steel Bar Reinforcement",
    // An alias must quote the SAME price as the rows it aliases, so its per-
    // zone figures are copied verbatim rather than derived. Reinforcement does
    // not follow the catalogue-wide spread at all — south_east and south_south
    // are CHEAPER than south_west here, the opposite of the median trend — so
    // applying ZONE_FACTOR would have overstated south_south by about 15%
    // (N1,337,775 against the true N1,157,625).
    mirrorOf: '1/2" diameter (112 pieces) - 12mm diameter.',
    why:
      "NOT a new price — an alias. Reinforcement IS already priced, but every row is named by diameter " +
      '(\'1/2" diameter (112 pieces) - 12mm diameter.\'), so the word "reinforcement" appears only in the CATEGORY and ' +
      "name-based lookup finds nothing. All 11 high-tensile rows carry this identical price, so this row restates it " +
      "under a name a QS would actually search for. Mild steel is deliberately excluded: its two rows disagree " +
      "(N1,189,132.98 and N1,528,885.26) and picking one would be a guess.",
  },
  {
    // Short for the same reason as the reinforcement row above — "Sawn timber
    // (hardwood, general)" left a plain "timber" search with no match. The
    // hardwood grade is carried by MaterialCategory.
    name: "Sawn timber",
    unit: "m3",
    category: "Timber - Hardwood",
    priceSouthWest: 117460,
    why:
      "The catalogue prices timber only as specific sawn sizes per Length, so there is no generic timber to quote. " +
      "Derived as the MEDIAN of the existing hardwood rows converted to m3 (south_west): " +
      "1x12\"x12'(4200) N1,000/0.0315=N31,746 | 1x12\"x12'(3600) N1,000/0.027=N37,037 | " +
      "2x12\"x12' N4,800/0.054=N88,889 | 2x6\"x12' N3,000/0.027=N111,111 | " +
      "2x4\"x12'(3600) N2,228.57/0.018=N123,809 | 2x4\"x12'(4200) N2,600/0.021=N123,810 | " +
      "2x2\" hardwood N1,274/0.009=N141,556 | 2x2\"x12' N1,600/0.009=N177,778. Median of those eight = N117,460/m3. " +
      "NOTE: this was N100,000 on the first run, because 2x4\"x12'(3600) was then priced at N170 — a data-entry " +
      "error (its identical-section 4200mm twin was N2,600). That row has since been corrected to N2,228.57 " +
      "(N2,600 x 3600/4200), which now yields N123,809/m3 against the twin's N123,810 — so the two agree and the " +
      "median moved up. The two 1x12\" rows still look low (N1,000 for a 25mm board against N4,800 for the same " +
      "board at 50mm) and are worth checking. The spread remains wide: treat this as a starting point.",
  },
];

// Labour is priced FLAT across zones on purpose: the existing labours
// collection carries a price for south_west only (every other zone is 0), so
// there is no regional labour differential in ADLM's data to derive from, and
// inventing one would be fabrication. Six identical rows are written so a
// zone-scoped lookup returns a real rate instead of N0.
const LABOUR = [
  {
    name: "Mason",
    unit: "day",
    category: "Labour",
    price: 14000,
    why:
      "Referenced 29 times across the blockwork build-ups as Masons / Mason / Mason. at N14,000 per day " +
      "(equivalently N1,750/hr x 8h), but absent from the labours collection entirely. Consistent with the trades " +
      "already there: Welder N15,000, Light plant operator N15,000.",
  },
  {
    name: "Carpenter",
    unit: "day",
    category: "Labour",
    price: 14000,
    why: "Build-ups price 'Tradesman (Carpenter)' at N1,750/hr (20 uses in roofwork and windowsAndDoor) = N14,000/day.",
  },
  {
    name: "Glazier",
    unit: "day",
    category: "Labour",
    price: 14000,
    why: "Build-ups price 'Tradesman (Glaziers)' at N1,750/hr (7 uses in windowsAndDoor) = N14,000/day.",
  },
  {
    name: "Steelfixer",
    unit: "day",
    category: "Labour",
    price: 14000,
    why: "Build-ups price 'Steelfixer hours' at N1,750/hr in concretework = N14,000/day.",
  },
  {
    name: "Tiler",
    unit: "day",
    category: "Labour",
    price: 14000,
    why: "Build-ups price 'Tiller/Terrazzo Man' at N1,750/hr in finishes = N14,000/day.",
  },
];
// Deliberately NOT added: a general labourer row. "Labourer" already exists at
// N5,500 and "Semi skilled" at N7,000, while the build-ups use N7,700/day for
// plain "Labour". Adding a third, conflicting rate would make the ambiguity
// worse, not better — reconcile the existing two first.
//
// Deliberately NOT added: water. It appears in neither the master lists nor any
// build-up, so ADLM has never priced it; a figure here would be invented, and
// water is normally absorbed into the rate anyway.

const SEED_SOURCE = "master-gaps-v1";
const WRITE = process.argv.includes("--write");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";

const naira = (n) =>
  `N${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function zonePrice(base, zone) {
  return Math.round(base * (ZONE_FACTOR[zone] ?? 1) * 100) / 100;
}

async function main() {
  const uri =
    (process.env.RATEGEN_MONGO_URI || "").trim() ||
    (process.env.MONGO_URI || "").trim();
  if (!uri) throw new Error("RATEGEN_MONGO_URI or MONGO_URI must be set");

  const dbName = (process.env.RATEGEN_DB || "ADLMRateDB").trim();
  const matColl = (process.env.RATEGEN_MAT_COLLECTION || "Materials").trim();
  const labColl = (process.env.RATEGEN_LAB_COLLECTION || "labours").trim();

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  console.log(
    `\n${WRITE ? "WRITE" : "DRY RUN"} — ${dbName} (${matColl}, ${labColl})` +
      `${WRITE ? "" : "   [nothing will be written; pass --write to apply]"}\n`,
  );

  const plan = [];

  if (ONLY !== "labour") {
    for (const m of MATERIALS) {
      console.log(`MATERIAL  ${m.name}  [${m.unit}]  ${m.category}`);
      console.log(`          ${m.why}\n`);

      // An alias row copies its source's per-zone prices exactly; a genuinely
      // new material derives them from its south_west base.
      let mirrored = null;
      if (m.mirrorOf) {
        const rows = await db
          .collection(matColl)
          .find({ MaterialName: m.mirrorOf })
          .toArray();
        if (!rows.length) {
          throw new Error(
            `mirrorOf source not found: "${m.mirrorOf}" — refusing to guess prices for "${m.name}"`,
          );
        }
        mirrored = Object.fromEntries(
          rows.map((r) => [r.zone, Number(r.MaterialPrice) || 0]),
        );
        const missingZones = ZONES.filter((z) => !(z in mirrored));
        if (missingZones.length) {
          throw new Error(
            `mirrorOf source "${m.mirrorOf}" has no row for: ${missingZones.join(", ")} — refusing to guess`,
          );
        }
        console.log(`          mirroring per-zone prices from: ${m.mirrorOf}\n`);
      }

      for (const zone of ZONES) {
        const exists = await db
          .collection(matColl)
          .findOne({ MaterialName: m.name, zone });
        const price = mirrored ? mirrored[zone] : zonePrice(m.priceSouthWest, zone);
        plan.push({
          coll: matColl,
          zone,
          label: m.name,
          price,
          exists: !!exists,
          doc: {
            MaterialName: m.name,
            MaterialUnit: m.unit,
            MaterialPrice: price,
            MaterialCategory: m.category,
            zone,
            updatedAt: new Date(),
            updatedBy: null,
            seedSource: SEED_SOURCE,
          },
        });
      }
    }
  }

  if (ONLY !== "materials") {
    for (const l of LABOUR) {
      console.log(`LABOUR    ${l.name}  [${l.unit}]  ${l.category}`);
      console.log(`          ${l.why}\n`);
      for (const zone of ZONES) {
        const exists = await db
          .collection(labColl)
          .findOne({ LabourName: l.name, zone });
        plan.push({
          coll: labColl,
          zone,
          label: l.name,
          price: l.price,
          exists: !!exists,
          doc: {
            LabourName: l.name,
            LabourUnit: l.unit,
            LabourPrice: l.price,
            LabourCategory: l.category,
            zone,
            updatedAt: new Date(),
            updatedBy: null,
            seedSource: SEED_SOURCE,
          },
        });
      }
    }
  }

  console.log("Rows:");
  console.table(
    plan.map((p) => ({
      collection: p.coll,
      name: p.label.slice(0, 36),
      zone: p.zone,
      price: naira(p.price),
      status: p.exists ? "exists — skip" : WRITE ? "INSERT" : "would insert",
    })),
  );

  const todo = plan.filter((p) => !p.exists);
  console.log(
    `\n${plan.length} row(s) considered — ${todo.length} new, ${plan.length - todo.length} already present.`,
  );

  if (!WRITE) {
    console.log(
      "\nDry run. Check the prices above, then re-run with --write to apply.",
    );
    await client.close();
    return;
  }

  let inserted = 0;
  for (const p of todo) {
    await db.collection(p.coll).insertOne(p.doc);
    inserted += 1;
  }
  console.log(`\nInserted ${inserted} row(s).`);
  console.log(
    `Undo with:  db.${matColl}.deleteMany({ seedSource: "${SEED_SOURCE}" })  ` +
      `and db.${labColl}.deleteMany({ seedSource: "${SEED_SOURCE}" })`,
  );
  await client.close();
}

main().catch((err) => {
  console.error("\nseed-rategen-master-gaps failed:", err?.message || err);
  process.exit(1);
});
