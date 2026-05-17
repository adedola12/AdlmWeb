import express from "express";
import { Proposal } from "../models/Proposal.js";
import { buildProposalPdfBuffer } from "./admin.proposals.js";

const router = express.Router();

// Public: server-rendered PDF of a proposal by share token (no auth).
router.get("/:token/pdf", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    const proposal = await Proposal.findOne({ shareToken: token }).lean();
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });
    const buf = await buildProposalPdfBuffer(proposal);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${proposal.proposalNumber}.pdf"`,
    );
    res.send(buf);
  } catch (e) {
    console.error("proposals public pdf error:", e);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Public: view a proposal by its share token (no auth — the client-facing link).
router.get("/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const proposal = await Proposal.findOne({ shareToken: token }).lean();
    if (!proposal)
      return res.status(404).json({ error: "Proposal not found" });

    // Drop internal-only fields before exposing publicly.
    delete proposal.createdBy;
    delete proposal.notion;
    delete proposal.seq;
    delete proposal.__v;

    res.json({ ok: true, proposal });
  } catch (e) {
    console.error("proposals public view error:", e);
    res.status(500).json({ error: "Failed to load proposal" });
  }
});

export default router;
