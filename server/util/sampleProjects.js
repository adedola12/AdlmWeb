// Sample projects: fully worked, owner-less TakeoffProject documents that every
// subscriber of a product can open as learning material. They are read-only for
// everybody; the only way to change one is to re-run
// scripts/seed-sample-projects.mjs.

import mongoose from "mongoose";
import { TakeoffProject } from "../models/TakeoffProject.js";

// router.param("id", rejectSampleWrites) — refuses every non-GET request whose
// :id is a sample, before any handler runs. That covers handlers that only
// check read access (accessFilter) and never look at canEdit.
export async function rejectSampleWrites(req, res, next, id) {
  try {
    if (req.method === "GET" || req.method === "HEAD") return next();
    if (!mongoose.Types.ObjectId.isValid(String(id))) return next();
    const sample = await TakeoffProject.exists({ _id: id, isSample: true });
    if (!sample) return next();
    return res.status(403).json({
      error: "Sample projects are read-only learning material.",
      code: "SAMPLE_READ_ONLY",
    });
  } catch (err) {
    return next(err);
  }
}

// The card the project list shows for a sample. Totals are computed here rather
// than in an aggregate: there are a handful of samples per product.
export function sampleSummary(project) {
  const p = project?.toObject ? project.toObject() : project || {};
  const items = Array.isArray(p.items) ? p.items : [];
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const measured = items.reduce((a, it) => a + num(it?.qty) * num(it?.rate), 0);
  const priced = items.filter((it) => num(it?.qty) > 0);
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug || "",
    clientName: p.clientName || "",
    productKey: p.productKey,
    sample: p.sample || {},
    itemCount: priced.length,
    totalCost: measured,
    contractSum: num(p.contract?.contractSum),
    certificateCount: Array.isArray(p.certificates) ? p.certificates.length : 0,
    hasModel: Boolean(
      p.models?.architectural?.key || p.models?.structural?.key || p.models?.mep?.key,
    ),
    updatedAt: p.updatedAt,
  };
}
