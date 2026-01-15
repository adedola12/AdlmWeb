import mongoose from "mongoose";

const RateGenMetaSchema = new mongoose.Schema(
  {
    // e.g. "materials", "labour", "compute"
    name: { type: String, unique: true, required: true, index: true },

    version: { type: Number, default: 1 },
    nextSn: { type: Number, default: 1 },

    updatedBy: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

export const RateGenMeta =
  mongoose.models.RateGenMeta ||
  mongoose.model("RateGenMeta", RateGenMetaSchema);

// Helpers
export async function ensureMeta(name) {
  const meta = await RateGenMeta.findOne({ name });
  if (meta) return meta;
  return RateGenMeta.create({ name, version: 1, nextSn: 1 });
}

export async function bumpMeta(name, updatedBy = "", note = "") {
  const meta = await ensureMeta(name);
  meta.version += 1;
  meta.updatedBy = updatedBy;
  meta.note = note;
  await meta.save();
  return meta;
}

export async function allocateSn(name) {
  const meta = await ensureMeta(name);
  const sn = meta.nextSn;
  meta.nextSn += 1;
  meta.version += 1; // allocating SN is a change users should see
  await meta.save();
  return sn;
}
