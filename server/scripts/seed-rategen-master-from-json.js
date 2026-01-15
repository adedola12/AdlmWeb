import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import { connectDB } from "../db.js";
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { allocateSn, bumpMeta, ensureMeta } from "../models/RateGenMeta.js";

function getArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function normKey(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function ensureObj(v) {
  return v && typeof v === "object" ? v : {};
}

function ensureArr(v) {
  return Array.isArray(v) ? v : [];
}

async function resolveSn({ kind, Model, key, preferredSn, snMap }) {
  // 1) If a preferred SN is provided, only use it if it doesn't collide wrongly.
  if (Number.isFinite(preferredSn) && preferredSn > 0) {
    const existingBySn = await Model.findOne({ sn: preferredSn }).lean();
    if (!existingBySn || existingBySn.key === key) {
      snMap[key] = preferredSn;
      return preferredSn;
    }
    // collision: ignore preferredSn
  }

  // 2) If we have a stored mapping, use it.
  if (Number.isFinite(snMap[key]) && snMap[key] > 0) return snMap[key];

  // 3) If Mongo already has this key, reuse that SN.
  const existingByKey = await Model.findOne({ key }).select("sn").lean();
  if (existingByKey?.sn) {
    snMap[key] = existingByKey.sn;
    return existingByKey.sn;
  }

  // 4) Allocate a new SN
  const newSn = await allocateSn(kind);
  snMap[key] = newSn;
  return newSn;
}

async function main() {
  const file = getArg("--file");
  const mapFile =
    getArg("--map") ||
    (file ? path.join(path.dirname(file), "rategen-sn-map.json") : null);

  const mongoUri = getArg("--mongo", process.env.MONGO_URI);

  if (!file) {
    console.error(
      "Missing --file. Example: node server/scripts/seed-rategen-master-from-json.js --file ./data/rategen-master.json"
    );
    process.exit(1);
  }
  if (!mongoUri) {
    console.error(
      "Missing mongo uri. Provide --mongo or set MONGO_URI in env."
    );
    process.exit(1);
  }

  const input = readJson(file);

  // Accept a few shapes:
  //  - { materials: [...], labour: [...] }
  //  - { materials: [...], labours: [...] }
  //  - { master: { materials: [...], labour: [...] } }
  const root = input.master ? input.master : input;

  const materials = ensureArr(root.materials);
  const labour = ensureArr(root.labour).length
    ? ensureArr(root.labour)
    : ensureArr(root.labours);

  // Load or create the SN map
  let map = { materials: {}, labour: {} };
  if (mapFile && fs.existsSync(mapFile)) {
    map = ensureObj(readJson(mapFile));
    map.materials = ensureObj(map.materials);
    map.labour = ensureObj(map.labour);
  }

  // Ensure metas exist (so allocateSn works consistently)
  await ensureMeta("materials");
  await ensureMeta("labour");

  await connectDB(mongoUri);

  let matCount = 0;
  let labCount = 0;

  // Seed materials
  for (const it of materials) {
    const name = String(it?.name || "").trim();
    if (!name) continue;

    const key = normKey(it?.key || name);
    const sn = await resolveSn({
      kind: "materials",
      Model: RateGenMaterial,
      key,
      preferredSn: it?.sn,
      snMap: map.materials,
    });

    const payload = {
      sn,
      key,
      name,
      unit: String(it?.unit || "").trim(),
      defaultUnitPrice: Number(it?.defaultUnitPrice || it?.unitPrice || 0),
      enabled: it?.enabled !== false,
      tags: ensureArr(it?.tags),
    };

    await RateGenMaterial.findOneAndUpdate({ sn }, payload, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    matCount += 1;
  }

  // Seed labour
  for (const it of labour) {
    const name = String(it?.name || "").trim();
    if (!name) continue;

    const key = normKey(it?.key || name);
    const sn = await resolveSn({
      kind: "labour",
      Model: RateGenLabour,
      key,
      preferredSn: it?.sn,
      snMap: map.labour,
    });

    const payload = {
      sn,
      key,
      name,
      unit: String(it?.unit || "").trim(),
      defaultUnitPrice: Number(it?.defaultUnitPrice || it?.unitPrice || 0),
      enabled: it?.enabled !== false,
      tags: ensureArr(it?.tags),
    };

    await RateGenLabour.findOneAndUpdate({ sn }, payload, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    labCount += 1;
  }

  // Save the map for stability across future runs
  if (mapFile) {
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), "utf8");
  }

  // Bump metas so clients know library changed (optional but recommended)
  if (matCount)
    await bumpMeta("materials", "seed", `seeded ${matCount} materials`);
  if (labCount) await bumpMeta("labour", "seed", `seeded ${labCount} labour`);

  console.log("✅ Seed done:", {
    materialsUpserted: matCount,
    labourUpserted: labCount,
    snMapFile: mapFile,
  });

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Seed failed:", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
