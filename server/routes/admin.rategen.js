// server/routes/admin.rategen.js
import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ZONES } from "../util/zones.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

/* --------- connect to the RateGen DB (NOT the auth DB) --------- */
let rateConn = null;
function rategenConn() {
  if (rateConn) return rateConn;
  const uri = process.env.RATEGEN_MONGO_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("RATEGEN_MONGO_URI or MONGO_URI not set");
  rateConn = mongoose.createConnection(uri, {
    dbName: process.env.RATEGEN_DB || "ADLMRateDB",
    maxPoolSize: 3,
    bufferCommands: false,
  });
  rateConn.asPromise().then(() => {
    console.log(
      "[Admin RateGen] connected:",
      rateConn.host,
      "/",
      rateConn.name,
      "collections:",
      process.env.RATEGEN_MAT_COLLECTION || "Materials",
      ",",
      process.env.RATEGEN_LAB_COLLECTION || "labours"
    );
  });
  return rateConn;
}

function makeModel(name, shape, collection) {
  const c = rategenConn();
  const schema = new mongoose.Schema(shape, { strict: false, collection });
  return c.models[name] || c.model(name, schema, collection);
}

const Material = () =>
  makeModel(
    "MaterialAdmin",
    {
      MaterialName: String,
      MaterialUnit: String,
      MaterialCategory: String,
      MaterialPrice: Number,
      zone: String,

      // optional metadata (for “web added only” view)
      source: String, // e.g. "web"
      createdAt: Date,
      createdBy: mongoose.Schema.Types.ObjectId,
      updatedAt: Date,
      updatedBy: mongoose.Schema.Types.ObjectId,
    },
    process.env.RATEGEN_MAT_COLLECTION || "Materials"
  );

const Labour = () =>
  makeModel(
    "LabourAdmin",
    {
      LabourName: String,
      LabourUnit: String,
      LabourCategory: String,
      LabourPrice: Number,
      zone: String,

      // optional metadata (for “web added only” view)
      source: String, // e.g. "web"
      createdAt: Date,
      createdBy: mongoose.Schema.Types.ObjectId,
      updatedAt: Date,
      updatedBy: mongoose.Schema.Types.ObjectId,
    },
    process.env.RATEGEN_LAB_COLLECTION || "labours"
  );

const KIND = {
  material: {
    M: Material,
    name: "MaterialName",
    unit: "MaterialUnit",
    category: "MaterialCategory",
    price: "MaterialPrice",
  },
  labour: {
    M: Labour,
    name: "LabourName",
    unit: "LabourUnit",
    category: "LabourCategory",
    price: "LabourPrice",
  },
};

function norm(s) {
  return String(s || "").trim();
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a complete zone price map.
 * If the client only provides one zone price, we replicate it to missing zones.
 * If client provides all zone keys, we respect them exactly.
 */
function normalizePrices(pricesIn, zoneKeys) {
  const prices =
    pricesIn && typeof pricesIn === "object" ? { ...pricesIn } : {};

  const hasAllKeys = zoneKeys.every((k) =>
    Object.prototype.hasOwnProperty.call(prices, k)
  );
  if (hasAllKeys) return prices;

  // Find a sensible default price (first provided numeric)
  let def = null;
  for (const k of zoneKeys) {
    if (Object.prototype.hasOwnProperty.call(prices, k)) {
      const v = Number(prices[k]);
      if (Number.isFinite(v)) {
        def = v;
        break;
      }
    }
  }
  // If they didn’t provide any zone key, keep missing as 0
  if (def == null) def = 0;

  // Fill missing keys with default
  for (const k of zoneKeys) {
    if (!Object.prototype.hasOwnProperty.call(prices, k)) prices[k] = def;
  }
  return prices;
}

router.get("/zones", (_req, res) => res.json(ZONES));

/**
 * GET /admin/rategen/grid?kind=material|labour&search=...&source=web
 * source is optional:
 *  - source=web shows only items created by web admin (new inserts)
 */
router.get("/grid", async (req, res) => {
  const kindKey = (req.query.kind || "material").toLowerCase();
  const search = String(req.query.search || "").trim();
  const source = String(req.query.source || "").trim(); // optional filter
  const cfg = KIND[kindKey];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });

  const M = cfg.M();

  const filter = {};
  if (search) filter[cfg.name] = { $regex: search, $options: "i" };
  if (source) filter.source = source;

  const docs = await M.find(filter).lean();

  const byName = new Map();
  for (const d of docs) {
    const n = norm(d[cfg.name]);
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(d);
  }

  const zoneKeys = ZONES.map((z) => z.key);

  const rows = [...byName.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((name, i) => {
      const arr = byName.get(name);
      const any = arr[0] || {};
      const prices = {};
      for (const z of zoneKeys) {
        const hit = arr.find((d) => (d.zone || "").toLowerCase() === z);
        prices[z] = Number(hit?.[cfg.price] ?? 0);
      }

      // any row-level metadata you may want to show later
      const rowSource = arr.every((d) => d.source) ? arr[0].source : "";

      return {
        sn: i + 1,
        name,
        unit: any[cfg.unit] || "",
        category: any[cfg.category] || "",
        prices,
        source: rowSource || "",
      };
    });

  res.json({ rows, zones: ZONES, kind: kindKey });
});

/**
 * PUT /admin/rategen/grid
 * Upserts per-zone docs.
 * If client sends only ONE zone price, server auto-duplicates it to other zones (missing keys).
 */
router.put("/grid", async (req, res) => {
  const { kind = "material", rows } = req.body || {};
  const cfg = KIND[String(kind).toLowerCase()];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });
  if (!Array.isArray(rows))
    return res.status(400).json({ error: "rows[] required" });

  const M = cfg.M();
  const writes = [];
  const zoneKeys = ZONES.map((x) => x.key);
  const now = new Date();

  for (const r of rows) {
    const name = norm(r?.name);
    if (!name) continue;

    const unitVal = norm(r?.unit);
    const catVal = norm(r?.category);

    const normalized = normalizePrices(r?.prices, zoneKeys);

    for (const z of zoneKeys) {
      const filter = { [cfg.name]: name, zone: z };
      const update = {
        $set: {
          [cfg.unit]: unitVal,
          [cfg.category]: catVal,
          [cfg.price]: Number(normalized?.[z] ?? 0),
          zone: z,
          updatedAt: now,
          updatedBy: req.user?._id,
        },
        $setOnInsert: {
          [cfg.name]: name,
          source: "web", // mark rows created from web admin
          createdAt: now,
          createdBy: req.user?._id,
        },
      };
      writes.push({ updateOne: { filter, update, upsert: true } });
    }
  }

  if (writes.length) await M.bulkWrite(writes, { ordered: false });
  res.json({ ok: true, updated: rows.length });
});

/**
 * ✅ DELETE /admin/rategen/grid
 * Body: { kind: "material"|"labour", name: "..." }
 * Deletes the item across ALL zones (all docs with that exact name, case-insensitive).
 * Optional: pass { onlySource: "web" } to restrict delete to web-created rows.
 */
router.delete("/grid", async (req, res) => {
  const { kind = "material", name, onlySource } = req.body || {};
  const cfg = KIND[String(kind).toLowerCase()];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });

  const n = norm(name);
  if (!n) return res.status(400).json({ error: "name required" });

  const M = cfg.M();

  const filter = {
    [cfg.name]: { $regex: `^${escapeRegex(n)}$`, $options: "i" },
  };
  if (onlySource) filter.source = String(onlySource);

  const r = await M.deleteMany(filter);
  res.json({ ok: true, deleted: r.deletedCount || 0 });
});

export default router;
