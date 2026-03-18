// server/routes/webhooks.js
import express from "express";
import crypto from "crypto";
import { Purchase } from "../models/Purchase.js";
import { autoEnrollFromPurchase } from "../util/autoEnroll.js";

const router = express.Router();

// Must receive raw body (index mounts this router BEFORE express.json)
router.post("/paystack", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers["x-paystack-signature"];
    const computed = crypto
      .createHmac("sha512", secret)
      .update(req.body)
      .digest("hex");
    if (signature !== computed) return res.status(401).end();

    const event = JSON.parse(req.body.toString("utf8") || "{}");
    if (event.event !== "charge.success") return res.json({ ok: true });

    const ref = event.data?.reference;
    if (!ref) return res.json({ ok: true });

    // Atomic update to prevent race condition with concurrent webhook calls
    const purchase = await Purchase.findOneAndUpdate(
      { paystackRef: ref, paid: { $ne: true } },
      { $set: { paid: true, status: "approved" } },
      { new: true },
    );

    if (!purchase) {
      // Already paid or not found — idempotent success
      return res.json({ ok: true });
    }

    const { applyEntitlementsFromPurchase } = await import(
      "../util/applyEntitlements.js"
    );
    await applyEntitlementsFromPurchase(purchase);
    await autoEnrollFromPurchase(purchase);

    res.json({ ok: true });
  } catch (e) {
    // Log the error for debugging but always 200 so Paystack doesn't retry forever
    console.error("[webhook/paystack] error:", e?.message || e);
    res.status(200).json({ ok: true });
  }
});

export default router;
