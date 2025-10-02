// server/routes/projects.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const router = express.Router();

// All routes below require user + active revit sub
router.use(requireAuth, requireEntitlement("revit"));

// POST /projects  { name, items:[{sn,description,qty,unit}] }
router.post("/", async (req, res) => {
  const { name, items } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const proj = await TakeoffProject.create({
    userId: req.user._id,
    name,
    items: Array.isArray(items) ? items : [],
  });
  res.json(proj);
});

// GET /projects (mine)
router.get("/", async (req, res) => {
  const list = await TakeoffProject.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .select("_id name items updatedAt version");
  // lightweight: send item count, not the whole table
  res.json(
    list.map((p) => ({
      _id: p._id,
      name: p.name,
      itemCount: p.items.length,
      updatedAt: p.updatedAt,
      version: p.version,
    }))
  );
});

// GET /projects/:id
router.get("/:id", async (req, res) => {
  const p = await TakeoffProject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// PUT /projects/:id  { name?, items, baseVersion }
router.put("/:id", async (req, res) => {
  const { name, items, baseVersion } = req.body || {};
  const p = await TakeoffProject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!p) return res.status(404).json({ error: "Not found" });
  if (typeof baseVersion === "number" && baseVersion !== p.version) {
    return res.status(409).json({ error: "Version conflict" });
  }
  if (name !== undefined) p.name = name;
  if (Array.isArray(items)) p.items = items;
  p.version += 1;
  await p.save();
  res.json(p);
});

export default router;
