import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { Product } from "../models/Product.js";
import { getFxRate } from "../util/fx.js";

const router = express.Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY; // set in .env

function toKobo(naira) {
  return Math.round(Number(naira || 0) * 100);
}

// POST /purchase { productKey, months }
// Creates a PENDING purchase for admin review
router.post("/", requireAuth, async (req, res) => {
  const { productKey, months = 1 } = req.body || {};
  if (!productKey) {
    return res.status(400).json({ error: "productKey required" });
  }

  const p = await Purchase.create({
    userId: req.user._id,
    email: req.user.email,
    productKey,
    requestedMonths: Number(months) || 1,
    status: "pending",
  });

  return res.json({
    ok: true,
    purchase: p,
    message: "Purchase submitted and pending admin review.",
  });
});

router.post("/cart", requireAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const currency = (req.body?.currency || "NGN").toUpperCase(); // "NGN" | "USD"

    if (!items.length) return res.status(400).json({ error: "items required" });
    if (!["NGN", "USD"].includes(currency))
      return res.status(400).json({ error: "currency must be NGN or USD" });

    // Load products
    const keys = [...new Set(items.map((i) => i.productKey))];
    const products = await Product.find({
      key: { $in: keys },
      isPublished: true,
    }).lean();
    const byKey = Object.fromEntries(products.map((p) => [p.key, p]));

    const fx = await getFxRate();

    const lines = [];
    let total = 0;

    for (const i of items) {
      const p = byKey[i.productKey];
      if (!p)
        return res
          .status(400)
          .json({ error: `Invalid product: ${i.productKey}` });

      const qty = Math.max(parseInt(i.qty || 1, 10), 1);
      const firstTime = !!i.firstTime;

      // Choose unit price in requested currency
      let unitNGN =
        p.billingInterval === "yearly"
          ? p.price?.yearlyNGN || 0
          : p.price?.monthlyNGN || 0;
      let installNGN = firstTime ? p.price?.installNGN || 0 : 0;

      let unit = unitNGN;
      let install = installNGN;

      if (currency === "USD") {
        const ovUnit =
          p.billingInterval === "yearly"
            ? p.price?.yearlyUSD
            : p.price?.monthlyUSD;
        const ovInstall = p.price?.installUSD;

        unit = ovUnit != null ? ovUnit : unitNGN * fx;
        install = ovInstall != null ? ovInstall : installNGN * fx;

        // Round USD to 2dp
        unit = Math.round((unit + Number.EPSILON) * 100) / 100;
        install = Math.round((install + Number.EPSILON) * 100) / 100;
      }

      const recurring = unit * qty;
      const lineTotal = recurring + install;

      lines.push({
        productKey: p.key,
        name: p.name,
        billingInterval: p.billingInterval,
        qty,
        unit,
        install,
        subtotal: lineTotal,
      });

      total += lineTotal;
    }

    // Create one Purchase doc (cart snapshot)
    const purchase = await Purchase.create({
      userId: req.user._id,
      email: req.user.email,
      currency,
      totalAmount: total,
      lines,
      status: "pending",
    });

    // Init Paystack for NGN
    let paystackInit = null;
    if (currency === "NGN") {
      if (!PAYSTACK_SECRET) {
        // If not configured, return a simulated flow
        return res.json({
          ok: true,
          simulated: true,
          purchaseId: purchase._id,
          lines,
          total,
          currency,
          message: "Paystack secret not set; simulated order created.",
        });
      }

      const initBody = {
        email: req.user.email,
        amount: toKobo(total), // Paystack expects kobo
        currency: "NGN",
        metadata: { purchaseId: purchase._id.toString() },
        // callback_url: "https://your-frontend/checkout/thanks" // optional
      };

      const psRes = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(initBody),
        }
      );

      const psJson = await psRes.json();
      if (!psRes.ok || !psJson.status) {
        return res
          .status(400)
          .json({ error: psJson?.message || "Paystack init failed" });
      }

      // Save reference for webhook verification later
      await Purchase.updateOne(
        { _id: purchase._id },
        { $set: { paystackRef: psJson.data.reference } }
      );

      paystackInit = {
        authorization_url: psJson.data.authorization_url,
        reference: psJson.data.reference,
      };
    }

    return res.json({
      ok: true,
      purchaseId: purchase._id,
      lines,
      total,
      currency,
      paystack: paystackInit, // front-end can redirect to authorization_url
      message:
        currency === "NGN"
          ? "Proceed to Paystack to complete payment."
          : "USD selected — implement USD flow or convert to NGN for Paystack.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Cart purchase failed" });
  }
});

export default router;
