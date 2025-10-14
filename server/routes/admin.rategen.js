// server/routes/admin.rategen.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js"; // tiny helper (see below)
import mongoose from "mongoose";
import { ZONES } from "../util/zones.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

/* ---------- Models (reuse the same connection as your rategen util) ---------- */
const conn = mongoose.connection; // already connected by connectDB()
function model(name, shape, collection) {
  const schema = new mongoose.Schema(shape, { strict: false, collection });
  return conn.models[name] || conn.model(name, schema, collection);
}
const Material = () =>
  model(
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
  model(
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

/* ---------- Helpers ---------- */
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

/* ---------- Zones list (labels for the grid headers) ---------- */
router.get("/zones", (_req, res) => res.json(ZONES));

/* ---------- GET: pivot grid (material | labour) ---------- */
/* returns: [{ sn, name, unit, category, prices: { south_west: 123, ... } }] */
router.get("/grid", async (req, res) => {
  const kindKey = (req.query.kind || "material").toLowerCase();
  const search = String(req.query.search || "").trim();
  const cfg = KIND[kindKey];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });

  const M = cfg.M();

  // One read of everything we need
  const filter = search
    ? { [cfg.name]: { $regex: search, $options: "i" } }
    : {};
  const docs = await M.find(filter).lean();

  // group by name
  const byName = new Map();
  for (const d of docs) {
    const n = norm(d[cfg.name]);
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(d);
  }

  // add any names missing in filter result? (not needed; we’re already using filter)

  // build pivot rows
  const zoneKeys = ZONES.map((z) => z.key);
  const rows = [...byName.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((name, i) => {
      const arr = byName.get(name);
      const any = arr.find(Boolean) || {};
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

/* ---------- PUT: bulk update grid ---------- */
/* body: { kind: 'material'|'labour', rows: [{ name, unit?, category?, prices:{zone:number|null} }] } */
router.put("/grid", async (req, res) => {
  const { kind = "material", rows } = req.body || {};
  const cfg = KIND[String(kind).toLowerCase()];
  if (!cfg) return res.status(400).json({ error: "Invalid kind" });
  if (!Array.isArray(rows))
    return res.status(400).json({ error: "rows[] required" });

  const M = cfg.M();
  const writes = [];

  for (const r of rows) {
    const name = norm(r?.name);
    if (!name) continue;

    for (const z of ZONES.map((x) => x.key)) {
      // upsert a doc for each zone with this name
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
      writes.push({
        updateOne: {
          filter,
          update,
          upsert: true,
        },
      });
    }
  }
  if (writes.length) await M.bulkWrite(writes, { ordered: false });
  res.json({ ok: true, updated: rows.length });
});

export default router;
