// routes/admin.migrations.js
import express from "express";
import mongoose from "mongoose";
const router = express.Router();

import { ZONES } from "../util/zones.js";

function makeModel(conn, collection, shape) {
  const schema = new mongoose.Schema(shape, { strict: false, collection });
  return conn.model(collection, schema, collection);
}

router.post("/rategen/backfill-zones", async (req, res) => {
  // require admin here…
  const c = mongoose.connection;
  const Materials = makeModel(c, "Materials", {
    MaterialName: String,
    zone: String,
  });
  const Labours = makeModel(c, "labours", { LabourName: String, zone: String });

  await Materials.updateMany(
    { $or: [{ zone: { $exists: false } }, { zone: null }, { zone: "" }] },
    { $set: { zone: "south_west" } }
  );
  await Labours.updateMany(
    { $or: [{ zone: { $exists: false } }, { zone: null }, { zone: "" }] },
    { $set: { zone: "south_west" } }
  );

  const mats = await Materials.find({ zone: "south_west" }).lean();
  for (const m of mats) {
    for (const z of ZONES) {
      await Materials.updateOne(
        { MaterialName: m.MaterialName, zone: z.key },
        {
          $setOnInsert: {
            MaterialUnit: m.MaterialUnit || "",
            MaterialCategory: m.MaterialCategory || "",
            MaterialPrice: z.key === "south_west" ? m.MaterialPrice : null,
          },
        },
        { upsert: true }
      );
    }
  }

  const labs = await Labours.find({ zone: "south_west" }).lean();
  for (const l of labs) {
    for (const z of ZONES) {
      await Labours.updateOne(
        { LabourName: l.LabourName, zone: z.key },
        {
          $setOnInsert: {
            LabourUnit: l.LabourUnit || "",
            LabourCategory: l.LabourCategory || "",
            LabourPrice: z.key === "south_west" ? l.LabourPrice : null,
          },
        },
        { upsert: true }
      );
    }
  }

  res.json({ ok: true });
});

export default router;
