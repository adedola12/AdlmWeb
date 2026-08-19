// "A purchase is waiting to be verified" — the alert to whoever approves them.
//
// Until now nothing told anyone. A buyer paid by transfer, sent the receipt to
// a WhatsApp number, and the purchase sat at status "pending" until somebody
// happened to open the admin list. That is fine at two orders a week and not
// fine at twenty: the licence does not activate until it is approved, so an
// unseen order is a customer waiting with money already sent.
//
// Card purchases do not raise this — Paystack verifies those and the webhook
// approves them without a human. It fires for the two routes that need a
// person: a bank transfer, and a request for an invoice.

import { sendMail } from "./mailer.js";

const RECIPIENTS = () =>
  (
    process.env.PURCHASE_NOTIFY_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "admin@adlmstudio.net"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const WEB = () =>
  String(process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "https://adlmstudio.net")
    .replace(/\/+$/, "");

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmt = (n, currency) =>
  `${currency === "USD" ? "$" : "₦"}${Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  })}`;

const LABEL = {
  transfer: "Bank transfer — needs verifying against the receipt",
  invoice: "Invoice requested — no payment yet",
  card: "Card",
};

/**
 * Tell the team a purchase needs a human.
 *
 * Never throws: an alert that fails must not roll back an order the customer
 * has already paid for. Failures are logged and the purchase stands.
 *
 * @param {object} purchase          a Purchase document (hydrated or lean)
 * @param {object} [opts]
 * @param {"new"|"receipt"} [opts.reason]  what prompted it
 * @returns {Promise<boolean>}       whether the mail was accepted
 */
export async function notifyAdminOfPurchase(purchase, { reason = "new" } = {}) {
  try {
    if (!purchase) return false;

    const method = purchase.paymentMethod || "card";
    // Card orders are verified by Paystack, not by us.
    if (method === "card") return false;

    const id = String(purchase._id || "");
    const currency = purchase.currency || "NGN";
    const lines = (purchase.lines || [])
      .map(
        (l) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(
            l.productName || l.productKey || "Item",
          )}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${
            l.quantity || 1
          }</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${esc(
            fmt(l.lineTotal ?? l.amount ?? 0, currency),
          )}</td></tr>`,
      )
      .join("");

    const proof = purchase.paymentProof?.url
      ? `<p style="margin:14px 0"><a href="${esc(purchase.paymentProof.url)}"
           style="background:#239CFF;color:#fff;padding:10px 16px;border-radius:8px;
           text-decoration:none;display:inline-block">View the uploaded receipt</a></p>`
      : `<p style="margin:14px 0;color:#a15c00">No receipt uploaded yet.</p>`;

    const heading =
      reason === "receipt"
        ? "A buyer has uploaded a payment receipt"
        : "A new purchase is waiting to be verified";

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="margin:0 0 4px">${esc(heading)}</h2>
        <p style="margin:0 0 16px;color:#555">${esc(LABEL[method] || method)}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:4px 0;color:#666">Order</td><td style="padding:4px 0"><b>${esc(id)}</b></td></tr>
          <tr><td style="padding:4px 0;color:#666">Buyer</td><td style="padding:4px 0">${esc(purchase.email || "—")}</td></tr>
          ${
            purchase.organization?.name
              ? `<tr><td style="padding:4px 0;color:#666">Organisation</td><td style="padding:4px 0">${esc(
                  purchase.organization.name,
                )}</td></tr>`
              : ""
          }
          <tr><td style="padding:4px 0;color:#666">Total</td><td style="padding:4px 0"><b>${esc(
            fmt(purchase.totalAmount, currency),
          )}</b></td></tr>
        </table>
        ${lines ? `<table style="border-collapse:collapse;width:100%;margin-top:14px;font-size:13px">${lines}</table>` : ""}
        ${proof}
        <p style="margin:18px 0 0">
          <a href="${WEB()}/admin/purchases" style="color:#239CFF">Open it in the admin</a>
        </p>
        <p style="margin:18px 0 0;color:#888;font-size:12px">
          The licence does not activate until this is approved.
        </p>
      </div>`;

    await sendMail({
      to: RECIPIENTS(),
      subject:
        reason === "receipt"
          ? `Receipt uploaded — order ${id.slice(-6)} (${fmt(purchase.totalAmount, currency)})`
          : `Purchase to verify — ${LABEL[method] || method} ${fmt(purchase.totalAmount, currency)}`,
      html,
      text:
        `${heading}\n${LABEL[method] || method}\n` +
        `Order ${id}\nBuyer ${purchase.email || "—"}\n` +
        `Total ${fmt(purchase.totalAmount, currency)}\n` +
        (purchase.paymentProof?.url ? `Receipt: ${purchase.paymentProof.url}\n` : "No receipt yet\n") +
        `${WEB()}/admin/purchases`,
    });
    return true;
  } catch (e) {
    console.error("[purchaseAlert] could not send:", e?.message || e);
    return false;
  }
}

// SMS is deliberately not implemented here rather than stubbed.
//
// There is no SMS provider anywhere in this codebase and no credentials for
// one, so an sms() that quietly returns would read as "alerts are sent" while
// sending nothing — which is worse than the gap being visible. Adding Termii
// or Twilio is a small change once an account exists: it belongs beside
// notifyAdminOfPurchase and takes the same purchase argument.

export default notifyAdminOfPurchase;
