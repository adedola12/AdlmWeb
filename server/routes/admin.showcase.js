// server/routes/admin.showcase.js
import express from "express";
import {
  IndustryLeader,
  TrainedCompany,
  Testimonial,
} from "../models/Showcase.js";

import { requireAdminKey } from "../middleware/adminKey.js";

const router = express.Router();

/* =========================================================
   INDUSTRY LEADERS (PROTECTED - requires x-admin-key)
   ========================================================= */

// POST /admin/showcase/industry-leaders
router.post("/industry-leaders", requireAdminKey, async (req, res) => {
  try {
    const { name, code, logoUrl, website, featured } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const item = await IndustryLeader.create({
      name,
      code,
      logoUrl,
      website,
      featured: featured !== undefined ? featured : true,
    });

    res.status(201).json({ item });
  } catch (err) {
    console.error("POST /admin/showcase/industry-leaders error", err);
    res.status(500).json({ error: "Failed to create industry leader" });
  }
});

// DELETE /admin/showcase/industry-leaders/:id
router.delete("/industry-leaders/:id", requireAdminKey, async (req, res) => {
  try {
    await IndustryLeader.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/showcase/industry-leaders error", err);
    res.status(500).json({ error: "Failed to delete industry leader" });
  }
});

/* =========================================================
   COMPANIES (OPEN - NO auth / NO admin key)
   ========================================================= */

// POST /admin/showcase/companies
router.post("/companies", async (req, res) => {
  try {
    const { name, code, location, logoUrl, website, featured } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const item = await TrainedCompany.create({
      name,
      code,
      location,
      logoUrl,
      website,
      featured: featured !== undefined ? featured : true,
    });

    res.status(201).json({ item });
  } catch (err) {
    console.error("POST /admin/showcase/companies error", err);
    res.status(500).json({ error: "Failed to create company" });
  }
});

// DELETE /admin/showcase/companies/:id
router.delete("/companies/:id", async (req, res) => {
  try {
    await TrainedCompany.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/showcase/companies error", err);
    res.status(500).json({ error: "Failed to delete company" });
  }
});

/* =========================================================
   TESTIMONIALS (OPEN - NO auth / NO admin key)
   ========================================================= */

// POST /admin/showcase/testimonials
router.post("/testimonials", async (req, res) => {
  try {
    const {
      name,
      role,
      company,
      location,
      category,
      rating,
      text,
      avatarUrl,
      linkedinUrl,
      featured,
    } = req.body;

    if (!name || !role || !company || !location || !text) {
      return res
        .status(400)
        .json({ error: "name, role, company, location and text are required" });
    }

    const item = await Testimonial.create({
      name,
      role,
      company,
      location,
      category,
      rating,
      text,
      avatarUrl,
      linkedinUrl,
      featured,
    });

    res.status(201).json({ item });
  } catch (err) {
    console.error("POST /admin/showcase/testimonials error", err);
    res.status(500).json({ error: "Failed to create testimonial" });
  }
});

// PATCH /admin/showcase/testimonials/:id
router.patch("/testimonials/:id", async (req, res) => {
  try {
    const item = await Testimonial.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json({ item });
  } catch (err) {
    console.error("PATCH /admin/showcase/testimonials error", err);
    res.status(500).json({ error: "Failed to update testimonial" });
  }
});

// DELETE /admin/showcase/testimonials/:id
router.delete("/testimonials/:id", async (req, res) => {
  try {
    await Testimonial.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/showcase/testimonials error", err);
    res.status(500).json({ error: "Failed to delete testimonial" });
  }
});

export default router;
