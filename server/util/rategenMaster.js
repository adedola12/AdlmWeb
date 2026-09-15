// server/util/rategenMaster.js
import { MongoClient } from "mongodb";
import { normalizeZone } from "./zones.js";
import { normalizeState, zoneForState, ZONE_ANCHOR_STATE } from "./states.js";

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
function selectForZone(all, zoneKey, nameKey, priceKey, stateKey) {
  const st = normalizeState(stateKey);
  const z = st ? zoneForState(st) : normalizeZone(zoneKey);
  const byName = new Map();

  for (const d of all) {
    const n = d[nameKey] || "";
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(d);
  }

  const out = [];
  for (const [, arr] of byName.entries()) {
    // Preference order, most specific first. A state row that someone has
    // actually priced beats the zone row it was seeded from, which is the whole
    // point of materialising states: Lagos can diverge from Ogun without
    // anything else changing.
    const chosen =
      (st && arr.find((x) => x.state === st && hasPrice(x, priceKey))) ||
      (z && arr.find((x) => !x.state && (x.zone || "").toLowerCase() === z && hasPrice(x, priceKey))) ||
      (z && arr.find((x) => (x.zone || "").toLowerCase() === z && hasPrice(x, priceKey))) ||
      arr.find((x) => !x.state && (x.zone || "").toLowerCase() === "south_west" && hasPrice(x, priceKey)) ||
      arr.find((x) => (x.zone || "").toLowerCase() === "national" && hasPrice(x, priceKey)) ||
      (st && arr.find((x) => x.state === st)) ||
      (z && arr.find((x) => (x.zone || "").toLowerCase() === z)) ||
      arr[0];

    if (chosen) out.push(chosen);
  }
  return out;
}


// Only the rows that could possibly win: the requested state, its zone's rows,
// and the south_west fallback. Before states existed the collection was 3,576
// docs and `.limit(5000)` fetched all of it; it is now 25,628, so an unfiltered
// read with that limit would silently drop most states. Filter in the query.
function scopeFilter(zoneKey, stateKey) {
  const st = normalizeState(stateKey);
  const z = st ? zoneForState(st) : normalizeZone(zoneKey);
  const or = [];
  if (st) or.push({ state: st });
  if (z) or.push({ zone: z, state: { $exists: false } });
  or.push({ zone: "south_west", state: { $exists: false } });
  or.push({ zone: "national" });
  return or.length ? { $or: or } : {};
}

/* ---------------- public API ---------------- */

/** Return [{ sn, description, unit, price, category }] for Materials */
export async function fetchMasterMaterials(zoneKey, stateKey) {
  await ensureMasterDb();

  // MaterialCategory is NOT optional. RateGen's DataSourceCloudSync reads
  // `category` off this payload and falls back to "" when it is absent, so
  // omitting it here silently blanks the category on every row in every user's
  // library at their next sign-in — which broke the category filter in the
  // desktop app completely: the dropdown had values, the data had none, so
  // every selection matched nothing.
  const docs = await _mats
    .find(
      scopeFilter(zoneKey, stateKey),
      {
        projection: {
          MaterialName: 1,
          MaterialUnit: 1,
          MaterialPrice: 1,
          MaterialCategory: 1,
          zone: 1,
          state: 1,
        },
      }
    )
    .limit(20000)
    .toArray();

  const selected = selectForZone(
    docs,
    zoneKey,
    "MaterialName",
    "MaterialPrice",
    stateKey
  ).sort((a, b) =>
    // Same numeric collation as labour: materials name sizes too, and "0.55mm"
    // against "0.70mm" or "16mm2" against "4mm2" has the same problem.
    String(a.MaterialName || "").localeCompare(String(b.MaterialName || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  return selected.map((d, i) => ({
    sn: i + 1,
    description: d.MaterialName || "",
    unit: d.MaterialUnit || "",
    price: Number(d.MaterialPrice || 0),
    category: d.MaterialCategory || "",
    state: d.state || null,
    zone: d.zone || null,
  }));
}

/** Return [{ sn, description, unit, price, category }] for Labour */
export async function fetchMasterLabour(zoneKey, stateKey) {
  await ensureMasterDb();

  const docs = await _labs
    .find(
      scopeFilter(zoneKey, stateKey),
      {
        projection: {
          LabourName: 1,
          LabourUnit: 1,
          LabourPrice: 1,
          LabourCategory: 1,
          zone: 1,
          state: 1,
        },
      }
    )
    .limit(20000)
    .toArray();

  const selected = selectForZone(
    docs,
    zoneKey,
    "LabourName",
    "LabourPrice",
    stateKey
  ).sort((a, b) =>
    // Numeric collation, so sizes read in order. A plain compare is character
    // by character, which puts "(10 to 20 tonnes)" above "(2.7 to 10 tonnes)"
    // because "1" precedes "2", and scatters the generators as 1.5, 10, 125,
    // 150, 200, 250, 27, 50. Comparing digit runs as numbers sorts a catalogue
    // that names its sizes the way this one does.
    String(a.LabourName || "").localeCompare(String(b.LabourName || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  return selected.map((d, i) => ({
    sn: i + 1,
    description: d.LabourName || "",
    unit: d.LabourUnit || "",
    price: Number(d.LabourPrice || 0),
    category: d.LabourCategory || "",
    state: d.state || null,
    zone: d.zone || null,
  }));
}


/**
 * Update the price on individual master rows.
 *
 * ONE ROW AT A TIME, AND NEVER A REPLACE
 *
 * The desktop app writes this collection with DeleteMany + InsertMany, which
 * is safe when it owns the whole file and catastrophic when it does not: this
 * collection holds 25,628 rows across every zone and state, and a push from
 * one person whose local library is a single zone would delete everybody
 * else's. So a price change is an updateOne against the row it names, and a
 * row that cannot be found is reported rather than inserted — an unmatched
 * name is a rename or a typo, and inventing a row for it would quietly grow a
 * second copy of the catalogue.
 *
 * @param {"material"|"labour"} kind
 * @param {Array<{name: string, price: number}>} updates
 * @param {string} zoneKey  which zone's prices are being set
 * @param {string} [stateKey]  a state overrides its zone when given
 */
export async function updateMasterPrices(kind, updates, zoneKey, stateKey) {
  await ensureMasterDb();

  const isMaterial = kind === "material";
  const coll = isMaterial ? _mats : _labs;
  const nameField = isMaterial ? "MaterialName" : "LabourName";
  const priceField = isMaterial ? "MaterialPrice" : "LabourPrice";

  const st = normalizeState(stateKey);
  const z = normalizeZone(zoneKey) || "south_west";

  // A state row and a zone row are different documents; the caller says which
  // it is editing, and we must not silently write the zone row when a state
  // was meant or the other way round.
  const scope = st ? { state: st } : { zone: z, state: { $exists: false } };

  const changed = [];
  const missing = [];

  for (const u of updates) {
    const name = String(u?.name || "").trim();
    const price = Number(u?.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      missing.push({ name, reason: "not a usable name and price" });
      continue;
    }

    const res = await coll.updateOne(
      { ...scope, [nameField]: name },
      { $set: { [priceField]: price, priceUpdatedAt: new Date() } },
    );

    if (res.matchedCount) changed.push({ name, price });
    else missing.push({ name, reason: "no row with that name in this scope" });
  }

  return { changed, missing, scope: st ? { state: st } : { zone: z } };
}
