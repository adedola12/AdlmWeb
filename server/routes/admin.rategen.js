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
    },
    process.env.RATEGEN_LAB_COLLECTION || "labours"
  );

/* ----------------- helpers & routes unchanged below ----------------- */
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

router.get("/zones", (_req, res) => res.json(ZONES));

router.get("/grid", async (req, res) => {
  const kindKey = (req.query.kind || "material").toLowerCase();
  const search = String(req.query.search || "").trim();
  const cfg = KIND[kindKey];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });

  const M = cfg.M();
  const filter = search
    ? { [cfg.name]: { $regex: search, $options: "i" } }
    : {};
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
      return {
        sn: i + 1,
        name,
        unit: any[cfg.unit] || "",
        category: any[cfg.category] || "",
        prices,
      };
    });

  res.json({ rows, zones: ZONES, kind: kindKey });
});

router.put("/grid", async (req, res) => {
  const { kind = "material", rows } = req.body || {};
  const cfg = KIND[String(kind).toLowerCase()];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });
  if (!Array.isArray(rows))
    return res.status(400).json({ error: "rows[] required" });

  const M = cfg.M();
  const writes = [];
  const zoneKeys = ZONES.map((x) => x.key);

  for (const r of rows) {
    const name = norm(r?.name);
    if (!name) continue;
    for (const z of zoneKeys) {
      const filter = { [cfg.name]: name, zone: z };
      const update = {
        $set: {
          [cfg.unit]: r.unit ?? "",
          [cfg.category]: r.category ?? "",
          [cfg.price]: Number(r?.prices?.[z] ?? 0),
          zone: z,
        },
        $setOnInsert: { [cfg.name]: name },
      };
      writes.push({ updateOne: { filter, update, upsert: true } });
    }
  }
  if (writes.length) await M.bulkWrite(writes, { ordered: false });
  res.json({ ok: true, updated: rows.length });
});

export default router;
