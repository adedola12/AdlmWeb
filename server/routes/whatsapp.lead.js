import express from "express";
import { Lead } from "../models/Lead.js";
import { syncLeadToNotion } from "../util/notion.js";
import { requireAdminKey } from "../middleware/requireAdminKey.js";

const router = express.Router();

/**
 * Server-to-server intake for the WhatsApp bot (ADLMWhatsAppBot).
 *
 * The bot owns the conversation; this owns the customer record. Keeping the
 * CRM write here rather than in the bot means there is one implementation of
 * the Notion sync and one dedupe path — a second copy in the bot would drift
 * from this one within a release or two.
 *
 * The bot calls this only when a conversation becomes worth a human's
 * attention (hot, waitlisted, or needing a person), never on every message,
 * or the CRM becomes a chat log.
 */

/**
 * Chat stage -> CRM Stage. Every target already exists as an option in the
 * ADLM CRM database, so nothing new is created on the board.
 */
const STAGE_TO_CRM = {
  "01-New": "New",
  "02-Enquiry": "In Conversation",
  "03-Hot": "Negotiating",
  "04-Customer": "Closed Won",
  "05-Waitlist": "Nurture",
  "06-Dormant": "Nurture",
  "07-Lost": "Closed Lost",
};

const STAGE_TO_OUTCOME = {
  "03-Hot": "Interested",
  "04-Customer": "Converted",
  "06-Dormant": "No Response",
  "07-Lost": "Not Interested",
};

/** Product tag -> the productKey the rest of the platform uses. */
const TAG_TO_PRODUCT_KEY = {
  "p-QUIV": "revit",
  "p-HERON": "planswift",
  "p-RateGen": "rategen",
  "p-MEP": "mep",
  "p-CIVIQ": "civil3d",
  "p-ArchiCAD": "archicad",
  "p-Courses": "bimbld",
};

function str(v, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}

router.post("/lead", requireAdminKey, async (req, res) => {
  const b = req.body || {};
  const phone = str(b.phone, 32);
  if (!phone) return res.status(400).json({ error: "phone is required" });

  const productKeys = (Array.isArray(b.products) ? b.products : [])
    .map((t) => TAG_TO_PRODUCT_KEY[t])
    .filter(Boolean);

  const interest = [
    b.intent ? `Intent: ${b.intent}.` : "",
    b.stage ? `Stage: ${b.stage}.` : "",
    b.next_action ? `Next: ${b.next_action}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    // Upsert by phone, never create. A second create here would reproduce the
    // duplicate problem one layer below Notion, in our own database.
    const lead = await Lead.findOneAndUpdate(
      { phone, source: "whatsapp" },
      {
        $set: {
          name: str(b.name, 120),
          firm: str(b.firm, 160),
          interest: str(interest, 500),
          productKeys,
          note: str(b.notes, 1000),
          source: "whatsapp",
        },
        $setOnInsert: { phone, status: "new" },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Hand Notion the richer view. Unknown values are filtered there.
    const notion = await syncLeadToNotion({
      ...lead.toObject(),
      crmStage: STAGE_TO_CRM[b.stage] || null,
      outcome: STAGE_TO_OUTCOME[b.stage] || "Pending",
      category: b.stage === "04-Customer" ? "Client" : "Lead",
      followUpDate: b.follow_up_on || null,
    });

    lead.notion = notion;
    await lead.save();

    res.json({
      ok: true,
      leadId: String(lead._id),
      contactPageId: notion.contactPageId || null,
      notionError: notion.lastError || null,
    });
  } catch (err) {
    console.error("[whatsapp-lead] failed:", err?.message || err);
    res.status(500).json({ error: "lead sync failed" });
  }
});

export default router;
