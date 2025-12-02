// server/routes/trainings.js
import express from "express";
import { Training } from "../models/Training.js";

const router = express.Router();

// GET /trainings -> { stats, items }
router.get("/", async (_req, res) => {
  try {
    const items = await Training.find().sort({ date: -1 });

    const stats = items.reduce(
      (acc, t) => {
        acc.totalEvents += 1;
        acc.totalAttendees += t.attendees || 0;

        if (t.mode === "online") acc.onlineSessions += 1;
        if (t.mode === "office") acc.officeTrainings += 1;
        if (t.mode === "conference") acc.conferences += 1;

        return acc;
      },
      {
        totalEvents: 0,
        onlineSessions: 0,
        officeTrainings: 0,
        conferences: 0,
        totalAttendees: 0,
      }
    );

    res.json({ stats, items });
  } catch (err) {
    console.error("GET /trainings error", err);
    res.status(500).json({ error: "Failed to fetch trainings" });
  }
});

export default router;
