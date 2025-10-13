import mongoose from "mongoose";
import { normalizeZone } from "./zones.js";


let conn = null;
function connection() {
  if (conn) return conn;
  const uri =
    process.env.RATEGEN_MONGO_URI ||        // preferred
    process.env.MONGO_URI;                  // ← fallback to main
  if (!uri) throw new Error("RATEGEN_MONGO_URI or MONGO_URI not set");
  conn = mongoose.createConnection(uri, {
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 8000,
  });
  return conn;
}


function hasPrice(doc, priceKey) {
  const v = Number(doc?.[priceKey]);
  return !Number.isNaN(v) && v > 0; // treat 0 or NaN as “no price”
}

function makeModel(collection, shape) {
  const c = connection();
  const schema = new mongoose.Schema(shape, { strict: false, collection });
  return c.model(collection, schema, collection);
}

const Material = () =>
  makeModel(process.env.RATEGEN_MAT_COLLECTION || "Materials", {
    MaterialName: String,
    MaterialUnit: String,
    MaterialPrice: Number,
    zone: String, // 👈 ensure exists in Atlas rows
  });

const Labour = () =>
  makeModel(process.env.RATEGEN_LAB_COLLECTION || "labours", {
    LabourName: String,
    LabourUnit: String,
    LabourPrice: Number,
    zone: String, // 👈 ensure exists in Atlas rows
  });

function sortByName(a, b, key) {
  return String(a[key] || "").localeCompare(String(b[key] || ""));
}

function selectForZone(all, zoneKey, nameKey, priceKey) {
  const z = normalizeZone(zoneKey);
  const byName = new Map();
  for (const d of all) {
    const n = d[nameKey] || "";
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(d);
  }

  const out = [];
  for (const [, arr] of byName.entries()) {
    let chosen =
      (z &&
        arr.find(
          (x) => (x.zone || "").toLowerCase() === z && hasPrice(x, priceKey)
        )) ||
      arr.find(
        (x) =>
          (x.zone || "").toLowerCase() === "south_west" && hasPrice(x, priceKey)
      ) ||
      arr.find(
        (x) =>
          (x.zone || "").toLowerCase() === "national" && hasPrice(x, priceKey)
      ) ||
      // if nothing has a price, still return *something* so UI shows the row
      (z && arr.find((x) => (x.zone || "").toLowerCase() === z)) ||
      arr[0];

    out.push(chosen);
  }
  return out;
}

export async function fetchMasterMaterials(zoneKey) {
  const M = Material();
  const docs = await M.find({}).lean();
  const selected = selectForZone(
    docs,
    zoneKey,
    "MaterialName",
    "MaterialPrice"
  ).sort((a, b) =>
    String(a.MaterialName || "").localeCompare(String(b.MaterialName || ""))
  );
  return selected.map((d, i) => ({
    sn: i + 1,
    description: d.MaterialName || "",
    unit: d.MaterialUnit || "",
    price: Number(d.MaterialPrice || 0),
  }));
}

export async function fetchMasterLabour(zoneKey) {
  const L = Labour();
  const docs = await L.find({}).lean();
  const selected = selectForZone(
    docs,
    zoneKey,
    "LabourName",
    "LabourPrice"
  ).sort((a, b) =>
    String(a.LabourName || "").localeCompare(String(b.LabourName || ""))
  );
  return selected.map((d, i) => ({
    sn: i + 1,
    description: d.LabourName || "",
    unit: d.LabourUnit || "",
    price: Number(d.LabourPrice || 0),
  }));
}
