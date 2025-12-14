import express from "express";
import {
  IndustryLeader,
  TrainedCompany,
  Testimonial,
} from "../models/Showcase.js";

const router = express.Router();

// GET /showcase/industry-leaders
router.get("/industry-leaders", async (_req, res) => {
  try {
    // only featured leaders
    const items = await IndustryLeader.find({ featured: true }).sort({
      createdAt: -1,
    });
    res.json({ items });
  } catch (err) {
    console.error("GET /showcase/industry-leaders error", err);
    res.status(500).json({ error: "Failed to fetch industry leaders" });
  }
});

// GET /showcase/companies
router.get("/companies", async (_req, res) => {
  try {
    // only featured companies
    const items = await TrainedCompany.find({ featured: true }).sort({
      createdAt: -1,
    });
    res.json({ items });
  } catch (err) {
    console.error("GET /showcase/companies error", err);
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

// GET /showcase/testimonials
router.get("/testimonials", async (_req, res) => {
  try {
    const items = await Testimonial.find({ featured: true }).sort({
      createdAt: -1,
    });
    res.json({ items });
  } catch (err) {
    console.error("GET /showcase/testimonials error", err);
    res.status(500).json({ error: "Failed to fetch testimonials" });
  }
});

// GET /showcase/stats  – high-level training stats for the UI
router.get("/stats", async (_req, res) => {
  try {
    const companiesTrained = await TrainedCompany.countDocuments({
      featured: true,
    });
    const testimonialsCount = await Testimonial.countDocuments({
      featured: true,
    });

    res.json({
      companiesTrained,
      employeesTrained: 15000,
      trainingSessions: 1200,
      trainingRating: 4.9,
      testimonials: testimonialsCount,

      heroTitle: "Customer Testimonials",
      heroSubtitle:
        "Hear from over 10,000+ satisfied customers who have transformed their construction projects with ConstructTech",
      heroHappyCustomers: 10000,
      heroAverageRating: 4.8,
      heroSatisfactionRate: 98,
      heroCountriesServed: 10,
    });
  } catch (err) {
    console.error("GET /showcase/stats error", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
