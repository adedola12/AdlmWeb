import express from "express";
import crypto from "crypto";
import { Purchase } from "../models/Purchase.js";
import { autoEnrollFromPurchase } from "../util/autoEnroll.js";

const router = express.Router();

// Paystack webhook
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

    const purchase = await Purchase.findOne({ paystackRef: ref });
    if (!purchase) return res.json({ ok: true });

    // mark paid
    purchase.paid = true;
    purchase.status = "approved";
    await purchase.save();

    // auto enroll for any course lines
    await autoEnrollFromPurchase(purchase);

    res.json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: true }); // keep webhook 200
  }
});

export default router;
