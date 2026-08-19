// The proforma invoice a buyer gets when they choose "Request invoice".
//
// The checkout page promised one — "We'll email a proforma invoice to your
// billing contact, payable by transfer within 14 days" — and nothing in the
// codebase sent anything. That copy came from the static prototype, where it
// cost nothing because no order existed either. On a working checkout it is a
// promise to a firm's accounts department that never arrives, and the sale
// stalls waiting for a document nobody is producing.
//
// Written as an email rather than rendered through the document engine: an A4
// sheet built out of CSS custom properties, pt units and absolutely positioned
// watermarks does not survive Outlook. The layout follows routes/quote.js,
// which is the house style for transactional mail here.

import { sendMail } from "./mailer.js";
import { payoutAccount } from "./payoutAccount.js";

const WEB = () =>
  String(
    process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "https://adlmstudio.net",
  ).replace(/\/+$/, "") || "https://adlmstudio.net";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const money = (n, currency) =>
  `${currency === "USD" ? "$" : "₦"}${Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  })}`;

const DAYS_TO_PAY = 14;

/**
 * Email a proforma invoice for a pending purchase.
 *
 * Never throws: an order that exists must not be rolled back because a mail
 * server was slow. Returns whether it was accepted so the caller can say so.
 *
 * @param {object} purchase   a Purchase document
 * @param {string} to         the billing contact's address
 * @returns {Promise<boolean>}
 */
export async function sendProformaInvoice(purchase, to) {
  try {
    const email = String(to || "").trim();
    if (!purchase || !email) return false;
    const { subject, html, text } = buildProformaInvoice(purchase);
    await sendMail({ to: email, subject, html, text });
    return true;
  } catch (e) {
    console.error("[proformaInvoice] could not send:", e?.message || e);
    return false;
  }
}

/**
 * The document itself, separated from sending it.
 *
 * Split out so it can be rendered and checked without a mail server — the
 * first version of this went out with every description reading as a raw
 * product key and every amount as zero, which a test that only asserted
 * "the mail was accepted" would have passed.
 *
 * @param {object} purchase
 * @returns {{subject: string, html: string, text: string}}
 */
export function buildProformaInvoice(purchase) {
  {
    const currency = purchase.currency || "NGN";
    const id = String(purchase._id || "");
    // The same short reference the bank-transfer panel shows, so the payment
    // that arrives can be matched to this document without a lookup.
    const ref = id.slice(-8).toUpperCase();
    const due = new Date(Date.now() + DAYS_TO_PAY * 864e5);
    const dueStr = due.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // The field names are LineSchema's, checked against models/Purchase.js
    // rather than guessed: `name` (not productName), `qty` for seats (not
    // quantity), and `subtotal` for the line total in the order's currency
    // (not lineTotal). Guessing them printed every description as a raw
    // product key — "revit", "planswift" — and every amount as zero, on a
    // document asking a firm's accounts department for money.
    const rows = (purchase.lines || [])
      .map((l, i) => {
        const seats = Number(l.qty) || 1;
        const periods = Number(l.periods) || 1;
        // "2 seats · 12 months" says more than a bare number, and it is the
        // detail an accounts department checks the invoice against.
        const detail = [
          `${seats} seat${seats === 1 ? "" : "s"}`,
          l.billingInterval === "yearly"
            ? `${periods} year${periods === 1 ? "" : "s"}`
            : `${periods} month${periods === 1 ? "" : "s"}`,
        ].join(" · ");
        const install = Number(l.install) || 0;
        return `<tr style="border-bottom:1px solid #eee;background:${i % 2 ? "#f7f9fb" : "#fff"}">
            <td style="padding:8px 10px;font-size:13px;vertical-align:top">${i + 1}.</td>
            <td style="padding:8px 10px;font-size:13px">
              ${esc(l.name || l.productKey || "Item")}
              <div style="color:#777;font-size:11.5px">${esc(detail)}${
                install > 0 ? ` · includes ${esc(money(install, currency))} installation` : ""
              }</div>
            </td>
            <td style="padding:8px 10px;font-size:13px;text-align:center;vertical-align:top">${esc(seats)}</td>
            <td style="padding:8px 10px;font-size:13px;text-align:right;vertical-align:top">${esc(
              money(l.subtotal, currency),
            )}</td>
          </tr>`;
      })
      .join("");

    // Subtotal is the pre-VAT figure. Falling back to totalAmount printed the
    // VAT-inclusive total on the Subtotal row, so the document appeared to add
    // VAT twice.
    const subtotalShown =
      Number(purchase.totalBeforeDiscount) ||
      Math.max(Number(purchase.totalAmount || 0) - Number(purchase.vatAmount || 0), 0);

    const acct = payoutAccount();
    const bank = { number: acct.accountNumber, name: acct.accountName, bank: acct.bankName };

    const vatRow =
      Number(purchase.vatAmount) > 0
        ? `<tr><td style="padding:3px 0;color:#666">${esc(purchase.vatLabel || "VAT")}</td>
             <td style="padding:3px 0;text-align:right">${esc(money(purchase.vatAmount, currency))}</td></tr>`
        : "";

    return {
      subject: `Proforma invoice ${ref} — ${money(purchase.totalAmount, currency)}`,
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#262626">
          <div style="background:#091E39;padding:20px 24px;border-radius:8px 8px 0 0">
            <span style="color:#fff;font-size:18px;font-weight:700">ADLM Studio</span>
            <span style="color:#E86A27;font-size:18px;font-weight:700;float:right">Proforma invoice</span>
          </div>
          <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
            <table style="width:100%;font-size:13px;margin-bottom:16px">
              <tr><td style="padding:3px 0;color:#666">Reference</td><td style="padding:3px 0;text-align:right"><b>${esc(ref)}</b></td></tr>
              <tr><td style="padding:3px 0;color:#666">Payable by</td><td style="padding:3px 0;text-align:right">${esc(dueStr)}</td></tr>
              ${
                purchase.organization?.name
                  ? `<tr><td style="padding:3px 0;color:#666">For</td><td style="padding:3px 0;text-align:right">${esc(purchase.organization.name)}</td></tr>`
                  : ""
              }
            </table>

            <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
              <tr style="background:#091E39;color:#fff">
                <th style="padding:8px 10px;text-align:left;font-size:12px">#</th>
                <th style="padding:8px 10px;text-align:left;font-size:12px">Description</th>
                <th style="padding:8px 10px;text-align:center;font-size:12px">Qty</th>
                <th style="padding:8px 10px;text-align:right;font-size:12px">Amount</th>
              </tr>
              ${rows}
            </table>

            <table style="width:100%;font-size:13px">
              <tr><td style="padding:3px 0;color:#666">Subtotal</td>
                  <td style="padding:3px 0;text-align:right">${esc(money(subtotalShown, currency))}</td></tr>
              ${vatRow}
              <tr><td style="padding:8px 0;font-weight:700">Total due</td>
                  <td style="padding:8px 0;text-align:right;font-weight:700;font-size:16px">${esc(money(purchase.totalAmount, currency))}</td></tr>
            </table>

            <div style="margin-top:20px;padding:16px;background:#f0f7ff;border-radius:8px;border:1px solid #c5ddf5">
              <p style="margin:0 0 10px;font-weight:600;color:#091E39">How to pay</p>
              <table style="width:100%;font-size:13px">
                <tr><td style="padding:2px 0;color:#666">Bank</td><td style="padding:2px 0;text-align:right">${esc(bank.bank)}</td></tr>
                <tr><td style="padding:2px 0;color:#666">Account name</td><td style="padding:2px 0;text-align:right">${esc(bank.name)}</td></tr>
                <tr><td style="padding:2px 0;color:#666">Account number</td><td style="padding:2px 0;text-align:right"><b>${esc(bank.number)}</b></td></tr>
                <tr><td style="padding:2px 0;color:#666">Reference</td><td style="padding:2px 0;text-align:right"><b>${esc(ref)}</b></td></tr>
              </table>
              <p style="margin:10px 0 0;font-size:12px;color:#333">
                Transfer the exact amount and quote the reference. Upload your receipt on the
                order page and your licences are activated once we have checked it — usually the
                same working day.
              </p>
            </div>

            <p style="margin-top:18px">
              <a href="${WEB()}/order/${encodeURIComponent(id)}" style="display:inline-block;padding:10px 24px;background:#091E39;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
                Open your order
              </a>
            </p>

            <p style="margin-top:16px;font-size:12px;color:#888">
              This is a proforma invoice: it is a request for payment, not a tax invoice. A
              receipt follows once the payment clears. Questions: hello@adlmstudio.net
            </p>
          </div>
          <div style="text-align:center;padding:12px;font-size:11px;color:#999">
            &copy; ${new Date().getFullYear()} ADLM Studio &mdash; www.adlmstudio.net
          </div>
        </div>`,
      text:
        `Proforma invoice ${ref}\n` +
        `Total due ${money(purchase.totalAmount, currency)}, payable by ${dueStr}\n\n` +
        `${bank.bank} / ${bank.name} / ${bank.number}\nQuote reference ${ref}\n\n` +
        `${WEB()}/order/${encodeURIComponent(id)}`,
    };
  }
}

export default sendProformaInvoice;
