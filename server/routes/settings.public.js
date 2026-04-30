// Public, unauthenticated read-only access to non-sensitive global settings.
// Used by the checkout, quote, and receipt pages so they can display the
// configured VAT line that the server will charge.
import express from "express";
import { Setting } from "../models/Setting.js";

const router = express.Router();

router.get("/vat", async (_req, res) => {
  const s = await Setting.findOne({ key: "global" }).lean();
  res.json({
    enabled: !!s?.vatEnabled,
    percent: Number(s?.vatPercent || 0),
    label: s?.vatLabel || "VAT",
    applyToPurchases: s?.vatApplyToPurchases !== false,
    applyToQuotes: s?.vatApplyToQuotes !== false,
    applyToInvoices: s?.vatApplyToInvoices !== false,
  });
});

export default router;
