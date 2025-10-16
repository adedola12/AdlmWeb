// server/util/rategenMaster.js
import { MongoClient } from "mongodb";
import { normalizeZone } from "./zones.js";

/* ---------------- env helpers ---------------- */
function env(name, defVal) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : defVal;
}

/* ---------------- single cached connection ---------------- */
let _client = null;
let _db = null;
let _mats = null;
let _labs = null;

async function ensureMasterDb() {
  if (_db) return _db;

  const uri = env("RATEGEN_MONGO_URI", "") || env("MONGO_URI", "");
  if (!uri) throw new Error("RATEGEN_MONGO_URI or MONGO_URI not set");

  const dbName = env("RATEGEN_DB", "ADLMRateDB");
  const matColl = env("RATEGEN_MAT_COLLECTION", "Materials");
  const labColl = env("RATEGEN_LAB_COLLECTION", "labours");

  _client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await _client.connect();

  _db = _client.db(dbName);
  _mats = _db.collection(matColl);
  _labs = _db.collection(labColl);

  // nice to have logs
  try {
    const host =
      _client?.topology?.s?.description?.servers?.keys?.().next?.()?.value ||
      "cluster";
    console.log(
      `[RateGen master] connected to ${host} / ${dbName} (${matColl}, ${labColl})`
    );
  } catch {}

  // graceful shutdown
  const close = async () => {
    try {
      await _client?.close();
    } catch {}
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  return _db;
}

/* ---------------- utilities ---------------- */
function hasPrice(doc, priceKey) {
  const v = Number(doc?.[priceKey]);
  return Number.isFinite(v) && v > 0;
}

/**
 * Pick one row per name using zone preference:
 *   1) exact zone
 *   2) "south_west"
 *   3) "national"
 *   4) any record (to at least show the row)
 */
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
    const chosen =
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
      (z && arr.find((x) => (x.zone || "").toLowerCase() === z)) ||
      arr[0];

    if (chosen) out.push(chosen);
  }
  return out;
}

/* ---------------- public API ---------------- */

/** Return [{ sn, description, unit, price }] for Materials */
export async function fetchMasterMaterials(zoneKey) {
  await ensureMasterDb();

  // Pull minimal fields. If you need more, add them here.
  const docs = await _mats
    .find(
      {},
      {
        projection: {
          MaterialName: 1,
          MaterialUnit: 1,
          MaterialPrice: 1,
          zone: 1,
        },
      }
    )
    .limit(5000)
    .toArray();

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

/** Return [{ sn, description, unit, price }] for Labour */
export async function fetchMasterLabour(zoneKey) {
  await ensureMasterDb();

  const docs = await _labs
    .find(
      {},
      { projection: { LabourName: 1, LabourUnit: 1, LabourPrice: 1, zone: 1 } }
    )
    .limit(5000)
    .toArray();

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
