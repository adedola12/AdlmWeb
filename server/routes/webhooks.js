// server/routes/webhooks.js
import express from "express";
import crypto from "crypto";
import { Purchase } from "../models/Purchase.js";
import { autoEnrollFromPurchase } from "../util/autoEnroll.js";

const router = express.Router();

// Must receive raw body — index.js mounts this router BEFORE express.json;
// if that ordering ever breaks, req.body arrives pre-parsed and the HMAC
// check below throws on every event.
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

    const existing = await Purchase.findOne({ paystackRef: ref });
    if (!existing || existing.paid) {
      // Already paid or not found — idempotent success
      return res.json({ ok: true });
    }

    // The charge must cover the order in the order's currency — otherwise a
    // small self-initialized charge on the same reference would activate a
    // large order.
    const expectedMinor = Math.round(Number(existing.totalAmount || 0) * 100);
    const paidMinor = Number(event.data?.amount || 0);
    const paidCurrency = String(event.data?.currency || "").toUpperCase();
    if (paidCurrency !== existing.currency || paidMinor < expectedMinor) {
      console.error(
        `[webhook/paystack] amount/currency mismatch on ${ref}: paid ${paidMinor} ${paidCurrency}, expected ${expectedMinor} ${existing.currency}`,
      );
      return res.json({ ok: true }); // ack so Paystack doesn't retry; needs manual review
    }

    // Atomic update to prevent race condition with concurrent webhook calls
    const purchase = await Purchase.findOneAndUpdate(
      { paystackRef: ref, paid: { $ne: true } },
      {
        $set: {
          paid: true,
          status: "approved",
          // Entitlements are credited right below — mark them applied so a
          // later "mark installation complete" can't add the months again.
          "installation.entitlementsApplied": true,
          "installation.entitlementsAppliedAt": new Date(),
        },
      },
      { new: true },
    );

    if (!purchase) {
      // Raced with /purchase/verify — it already credited. Idempotent success.
      return res.json({ ok: true });
    }

    try {
      const { applyEntitlementsFromPurchase } = await import(
        "../util/applyEntitlements.js"
      );
      await applyEntitlementsFromPurchase(purchase);
      await autoEnrollFromPurchase(purchase);
    } catch (e) {
      // Crediting failed — clear the applied flag so admin can finish it via
      // the installation-complete flow. Payment itself stays recorded.
      await Purchase.updateOne(
        { _id: purchase._id },
        {
          $set: {
            "installation.entitlementsApplied": false,
            "installation.entitlementsAppliedAt": null,
          },
        },
      ).catch(() => {});
      throw e;
    }

    res.json({ ok: true });
  } catch (e) {
    // Log the error for debugging but always 200 so Paystack doesn't retry forever
    console.error("[webhook/paystack] error:", e?.message || e);
    res.status(200).json({ ok: true });
  }
});

export default router;
