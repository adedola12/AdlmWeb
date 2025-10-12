import mongoose from "mongoose";

let conn = null;
function connection() {
  if (conn) return conn;
  const uri = process.env.RATEGEN_MONGO_URI;
  if (!uri) throw new Error("RATEGEN_MONGO_URI not set");
  conn = mongoose.createConnection(uri, {
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 8000,
  });
  return conn;
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
  });

const Labour = () =>
  makeModel(process.env.RATEGEN_LAB_COLLECTION || "labours", {
    LabourName: String,
    LabourUnit: String,
    LabourPrice: Number,
  });

export async function fetchMasterMaterials() {
  const M = Material();
  const docs = await M.find({}).lean();
  return docs
    .sort((a, b) =>
      String(a.MaterialName || "").localeCompare(String(b.MaterialName || ""))
    )
    .map((d, i) => ({
      sn: i + 1,
      description: d.MaterialName || "",
      unit: d.MaterialUnit || "",
      price: Number(d.MaterialPrice || 0),
    }));
}
export async function fetchMasterLabour() {
  const L = Labour();
  const docs = await L.find({}).lean();
  return docs
    .sort((a, b) =>
      String(a.LabourName || "").localeCompare(String(b.LabourName || ""))
    )
    .map((d, i) => ({
      sn: i + 1,
      description: d.LabourName || "",
      unit: d.LabourUnit || "",
      price: Number(d.LabourPrice || 0),
    }));
}
