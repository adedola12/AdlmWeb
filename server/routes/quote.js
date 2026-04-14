import express from "express";
import dayjs from "dayjs";
import { sendMail } from "../util/mailer.js";

const router = express.Router();

// Send a quotation email (public — no auth required)
router.post("/send", async (req, res) => {
  try {
    const { email, clientName, currency, lineItems, subtotal, billingMode } =
      req.body || {};

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return res.status(400).json({ error: "At least one line item required" });
    }

    const curr = currency === "USD" ? "$" : "N";
    const name = (clientName || "").trim() || "Client";
    const total = Number(subtotal || 0);

    const itemsHtml = lineItems
      .map(
        (it, i) =>
          `<tr style="border-bottom:1px solid #eee;background:${i % 2 === 1 ? "#f4f4f4" : "#fff"}">
            <td style="padding:8px 10px;font-size:13px">${i + 1}.</td>
            <td style="padding:8px 10px;font-size:13px">${it.description || "—"}</td>
            <td style="padding:8px 10px;font-size:13px;text-align:center">${it.qty || 1}</td>
            <td style="padding:8px 10px;font-size:13px;text-align:right">${curr}${Number(it.unitPrice || 0).toLocaleString()}</td>
            <td style="padding:8px 10px;font-size:13px;text-align:right;font-weight:600">${curr}${Number(it.total || 0).toLocaleString()}</td>
          </tr>`,
      )
      .join("");

    const WEB_URL =
      String(
        process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "",
      ).trim() || "http://localhost:5173";

    await sendMail({
      to: email.trim(),
      subject: `Your ADLM Studio Quotation — ${curr}${total.toLocaleString()}`,
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#262626">
          <div style="background:#091E39;padding:20px 24px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">
            <span style="color:#fff;font-size:18px;font-weight:700">ADLM Studio</span>
            <span style="color:#E86A27;font-size:18px;font-weight:700">Quotation</span>
          </div>
          <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
            <p>Dear ${name},</p>
            <p>Thank you for your interest in ADLM Studio products. Here is your quotation:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#091E39;color:#fff">
                <th style="padding:8px 10px;text-align:left;font-size:12px">#</th>
                <th style="padding:8px 10px;text-align:left;font-size:12px">Description</th>
                <th style="padding:8px 10px;text-align:center;font-size:12px">Qty</th>
                <th style="padding:8px 10px;text-align:right;font-size:12px">Rate</th>
                <th style="padding:8px 10px;text-align:right;font-size:12px">Amount</th>
              </tr>
              ${itemsHtml}
            </table>
            <div style="text-align:right;margin-top:8px">
              <div style="display:inline-block;background:#091E39;color:#fff;padding:8px 20px;border-radius:4px;font-size:16px;font-weight:700">
                Estimated Total: ${curr}${total.toLocaleString()}
              </div>
            </div>
            <div style="margin-top:8px;text-align:right;font-size:12px;color:#888">
              Billing: ${billingMode === "yearly" ? "Yearly" : "Monthly"} | Currency: ${currency || "NGN"}
            </div>
            <div style="margin-top:24px;padding:16px;background:#f0f7ff;border-radius:8px;border:1px solid #c5ddf5">
              <p style="margin:0 0 8px;font-weight:600;color:#091E39">Ready to proceed?</p>
              <p style="margin:0 0 12px;font-size:13px;color:#333">
                Visit our website to purchase your subscription or contact us for a custom quote.
              </p>
              <a href="${WEB_URL}/purchase" style="display:inline-block;padding:10px 24px;background:#091E39;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;margin-right:8px">
                Purchase Now
              </a>
              <a href="${WEB_URL}/quote" style="display:inline-block;padding:10px 24px;background:#E86A27;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
                Recalculate Quote
              </a>
            </div>
            <p style="margin-top:16px;font-size:12px;color:#888">
              This is an estimate only. Final pricing may include discounts or additional fees.
              Contact us at hello@adlmstudio.net for custom enterprise pricing.
            </p>
          </div>
          <div style="text-align:center;padding:12px;font-size:11px;color:#999">
            &copy; ${new Date().getFullYear()} ADLM Studio &mdash; www.adlmstudio.net
          </div>
        </div>
      `,
    });

    return res.json({ ok: true, message: "Quotation sent" });
  } catch (e) {
    console.error("quote/send error:", e);
    return res.status(500).json({ error: "Failed to send quotation" });
  }
});

export default router;
