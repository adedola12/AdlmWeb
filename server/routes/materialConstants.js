// The Material Constants library — read and edit the factors behind every
// generated Material & Labour schedule.
//
// Mounted at /me/material-constants. One profile per user (a firm's house
// standards). Only overrides are stored; the catalog in util/materialConstants.js
// supplies everything else, so a firm that never touches a value keeps getting
// the improved default.
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { ensureDb } from "../db.js";
import { MaterialConstantProfile } from "../models/MaterialConstantProfile.js";
import {
  constantsForClient,
  sanitizeConstantOverrides,
  clampConstant,
} from "../util/materialConstants.js";

const router = express.Router();
router.use(requireAuth);

function uid(req) {
  return req.user?._id || req.user?.id || null;
}

async function loadOverrides(userId) {
  const doc = userId ? await MaterialConstantProfile.findOne({ userId }).lean() : null;
  return doc?.values || {};
}

// GET / — the whole library: every constant with its group, unit, range, the
// firm's current value and whether that value is still the default.
router.get("/", async (req, res) => {
  try {
    await ensureDb();
    const overrides = await loadOverrides(uid(req));
    res.json({ ok: true, ...constantsForClient(overrides) });
  } catch (e) {
    console.error("material-constants GET error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT / — merge edits into the firm's overrides.
// Body: { values: { "<key>": <number>, … } }. A value equal to the catalog
// default, or null, clears the override rather than storing a redundant copy.
router.put("/", async (req, res) => {
  try {
    await ensureDb();
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const raw = req.body?.values;
    if (!raw || typeof raw !== "object") {
      return res.status(400).json({ error: "values object required" });
    }

    // Report what was refused instead of silently dropping it — a typo'd key
    // or an out-of-range figure should not look like a successful save.
    const rejected = Object.keys(raw).filter((k) => clampConstant(k, raw[k]) === null);
    const accepted = sanitizeConstantOverrides(raw);

    const doc =
      (await MaterialConstantProfile.findOne({ userId })) ||
      new MaterialConstantProfile({ userId });
    for (const [key, value] of Object.entries(accepted)) doc.values.set(key, value);
    // Explicit nulls clear an override back to the catalog default.
    for (const [key, value] of Object.entries(raw)) {
      if (value === null && doc.values.has(key)) doc.values.delete(key);
    }
    await doc.save();

    res.json({
      ok: true,
      saved: Object.keys(accepted).length,
      rejected,
      ...constantsForClient(Object.fromEntries(doc.values)),
    });
  } catch (e) {
    console.error("material-constants PUT error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE / — reset the whole library to the catalog defaults.
// DELETE /:key — reset one constant.
//
// Two routes, not one "/:key?": Express 5's path-to-regexp removed the optional
// parameter suffix and throws at mount time, taking the whole API down.
async function resetConstants(req, res) {
  try {
    await ensureDb();
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const doc = await MaterialConstantProfile.findOne({ userId });
    if (doc) {
      const key = req.params.key;
      if (key) doc.values.delete(key);
      else doc.values.clear();
      await doc.save();
    }
    const overrides = doc ? Object.fromEntries(doc.values) : {};
    res.json({ ok: true, ...constantsForClient(overrides) });
  } catch (e) {
    console.error("material-constants DELETE error:", e);
    res.status(500).json({ error: "Server error" });
  }
}

router.delete("/", resetConstants);
router.delete("/:key", resetConstants);

export default router;
