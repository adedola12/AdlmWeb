// His checkout, wired to the real purchase API.
//
// The markup is his — .chk / .field / .toggle2 / .paypane / .bankbox /
// .bankrow / .btn-full — and the three payment routes are the three he
// designed: card, bank transfer, request an invoice. What sits behind them is
// ours, because his is a static prototype:
//
//   * His form posts nowhere. It is <a href="thanks">, so "Pay ₦207,475" was
//     a link to a thank-you page and no order was ever created.
//   * His bank box is filled in with an account that is not ours —
//     "Guaranty Trust Bank / ADLM Studio Ltd / 0123456789". Publishing a
//     placeholder account number on a checkout page is the one thing on this
//     page that could actually cost somebody money, so the box is filled from
//     GET /purchase/bank-details, which reads them from the environment.
//   * There was no way to send proof of a transfer. Buyers were asked for it
//     over WhatsApp; now the receipt uploads onto the order itself, and the
//     team is alerted that a purchase is waiting to be verified.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { readCartItems, readCartMeta } from "../lib/cart.js";

const METHODS = [
  { key: "card", label: "Card · Paystack" },
  { key: "transfer", label: "Bank transfer" },
  { key: "invoice", label: "Request invoice" },
];

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(n) || 0);

export default function DsCheckoutWire() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  // Read on mount rather than frozen into initial state: arriving here from
  // the quotation builder writes the cart immediately before this renders.
  const [items, setItems] = React.useState(() => readCartItems());
  const [meta, setMeta] = React.useState(() => readCartMeta());
  React.useEffect(() => {
    setItems(readCartItems());
    setMeta(readCartMeta());
  }, []);

  // The quotation already decided these. Arriving here having priced six
  // products in dollars and then being charged in naira, or having chosen an
  // Abuja training class that silently vanished, is exactly the kind of drift
  // that makes a quotation worthless.
  const [currency, setCurrency] = React.useState(() => readCartMeta().currency || "NGN");
  const [billing, setBilling] = React.useState(() => {
    const m = readCartMeta();
    return {
      company: m?.org?.name || "",
      city: "",
      country: "Nigeria",
      taxId: "",
    };
  });
  const [method, setMethod] = React.useState("card");

  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [order, setOrder] = React.useState(null); // { purchaseId, totalAmount, ... }
  const [bank, setBank] = React.useState(null);
  const [receipt, setReceipt] = React.useState(null); // uploaded URL
  const fileRef = React.useRef(null);

  const total = order?.totalAmount ?? null;

  // ── create the order ─────────────────────────────────────────────────────
  const createOrder = React.useCallback(async () => {
    const payload = {
      currency,
      // The cart's own shape, read exactly as Purchase.jsx reads it:
      // addProductToCart writes { productKey, qty, firstTime } and nothing
      // else, so a mapping that looked for `periods` and `months` found
      // neither and sent 1 of everything regardless of what was in the cart.
      items: items.map((e) => ({
        productKey: String(e.productKey || e.key || "").trim(),
        seats: Math.max(1, parseInt(e.seats ?? 1, 10) || 1),
        periods: Math.max(1, parseInt(e.periods ?? e.qty ?? 1, 10) || 1),
        firstTime: !!e.firstTime,
      })),
      licenseType: billing.company ? "organization" : "personal",
      organization: billing.company
        ? {
            name: billing.company,
            email: meta?.org?.email || user?.email || "",
            phone: meta?.org?.phone || "",
          }
        : null,
      autoRenew: false,
      paymentMethod: method,
    };

    // On-site training rides along from the quotation. The server only accepts
    // it on an organization purchase, which is what having a company name
    // means here.
    if (payload.licenseType === "organization" && meta?.training?.locationId) {
      payload.physicalTraining = {
        requested: true,
        locationId: meta.training.locationId,
        bimInstallRequested: !!meta.training.bimInstall,
      };
    }
    return apiAuthed("/purchase/cart", {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }, [accessToken, billing.company, currency, items, meta, method, user?.email]);

  const onPay = async () => {
    setMsg(null);

    if (!accessToken) {
      // The order has to belong to somebody — every route here needs an
      // account, so send them to sign in and bring them back.
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!items.length) {
      setMsg({ kind: "err", text: "Your cart is empty." });
      return;
    }

    setBusy(true);
    try {
      const out = order || (await createOrder());
      setOrder((o) => o || out);
      setCurrency(out.currency || currency);

      if (method === "card") {
        const init = await apiAuthed(`/purchase/${out.purchaseId}/paystack/init`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const url = init.authorization_url || init.authorizationUrl || init.url;
        if (!url) throw new Error("Paystack did not return a payment link.");
        // A real redirect, not a router navigation — Paystack is another origin.
        window.location.href = url;
        return;
      }

      if (method === "transfer") {
        try {
          setBank(await apiAuthed("/purchase/bank-details", { token: accessToken }));
        } catch {
          setBank(null);
        }
        setMsg({
          kind: "ok",
          text: "Order created. Transfer the exact amount, then upload the receipt below.",
        });
        return;
      }

      setMsg({
        kind: "ok",
        text:
          "Request received. We will email a proforma invoice to your billing contact, " +
          "payable by transfer within 14 days.",
      });
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "That did not go through — please try again." });
    } finally {
      setBusy(false);
    }
  };

  // ── receipt upload ───────────────────────────────────────────────────────
  const onReceipt = async (file) => {
    if (!file || !order?.purchaseId) return;
    setBusy(true);
    setMsg(null);
    try {
      const body = new FormData();
      body.append("receipt", file);
      // FormData sets its own multipart boundary — a Content-Type header here
      // would override it with one that has no boundary and the upload fails.
      const res = await fetch(`${API_BASE}/purchase/${order.purchaseId}/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The receipt could not be uploaded.");
      setReceipt(data.receiptUrl || "");
      setMsg({
        kind: "ok",
        text: data.message || "Receipt received. We will confirm your licence shortly.",
      });
    } catch (e) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const field = (id, label, key, extra = {}) => (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={billing[key]}
        onChange={(e) => setBilling({ ...billing, [key]: e.target.value })}
        {...extra}
      />
    </div>
  );

  return (
    <>
      <h3>Billing details</h3>
      {field("co", "Company or practice", "company", { autoComplete: "organization" })}
      <div className="frow">
        {field("ci", "City", "city", { autoComplete: "address-level2" })}
        <div className="ds-field">
          <label htmlFor="cn">Country</label>
          <select
            id="cn"
            value={billing.country}
            onChange={(e) => setBilling({ ...billing, country: e.target.value })}
          >
            <option>Nigeria</option>
            <option>Ghana</option>
            <option>Kenya</option>
            <option>South Africa</option>
            <option>United Kingdom</option>
            <option>United States</option>
            <option>Other</option>
          </select>
        </div>
      </div>
      {field("tx", "Tax ID (optional)", "taxId")}
      <p className="small">Added to your invoice if supplied.</p>

      <h3 style={{ marginTop: "28px" }}>Pay with</h3>
      <p className="sub">Choose how you&apos;d like to settle this.</p>

      <div className="toggle2" role="group" aria-label="Payment method">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={method === m.key ? "on" : ""}
            // Changing route after an order exists would leave the first one
            // orphaned at "pending", so the choice is fixed once it is created.
            disabled={!!order}
            onClick={() => setMethod(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {method === "card" && (
        <div className="paypane">
          <p className="small">
            You&apos;ll be handed to Paystack to enter your card details, then returned here. Your
            licences activate the moment the payment clears.
          </p>
        </div>
      )}

      {method === "transfer" && (
        <div className="paypane">
          {bank ? (
            <div className="bankbox">
              <div className="bankrow">
                <span>Bank</span>
                <b>{bank.bankName}</b>
              </div>
              <div className="bankrow">
                <span>Account name</span>
                <b>{bank.accountName}</b>
              </div>
              <div className="bankrow">
                <span>Account number</span>
                <b>{bank.accountNumber}</b>
              </div>
              <div className="bankrow">
                <span>Reference</span>
                <b>{String(order?.purchaseId || "").slice(-8).toUpperCase()}</b>
              </div>
              {total != null && (
                <div className="bankrow">
                  <span>Amount</span>
                  <b>{fmt(total, currency)}</b>
                </div>
              )}
            </div>
          ) : (
            <p className="small">
              Create the order below and the account details to transfer to will appear here.
            </p>
          )}
          <p className="small">
            Transfer the exact amount and quote the reference. Licences are activated once we have
            checked the transfer against your receipt — usually the same working day.
          </p>

          {order && (
            <div className="chk-receipt">
              <label className="ds-btn btn-o ds-btn-sm" htmlFor="receipt-file">
                {receipt ? "Upload a different receipt" : "Upload your receipt"}
              </label>
              <input
                id="receipt-file"
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => onReceipt(e.target.files?.[0])}
              />
              <span className="small">
                {receipt ? (
                  <a href={receipt} target="_blank" rel="noreferrer">
                    Receipt uploaded — view it
                  </a>
                ) : (
                  "A photo or PDF, up to 8MB. No need to send it anywhere else."
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {method === "invoice" && (
        <div className="paypane">
          <p className="small">
            We&apos;ll email a proforma invoice to your billing contact, payable by transfer within
            14 days. This is usually the easier route for a firm buying several seats, and it ends
            with exactly the same licences.
          </p>
        </div>
      )}

      {msg && (
        <p className={msg.kind === "err" ? "chk-msg is-err" : "chk-msg is-ok"} role="status">
          {msg.text}
        </p>
      )}

      <button
        type="button"
        className="ds-btn btn-p btn-full"
        style={{ marginTop: "22px" }}
        disabled={busy || (!!order && method !== "card")}
        onClick={onPay}
      >
        {busy
          ? "One moment…"
          : order && method === "transfer"
            ? "Order created"
            : order && method === "invoice"
              ? "Invoice requested"
              : method === "card"
                ? `Pay${total != null ? ` ${fmt(total, currency)}` : ""}`
                : method === "transfer"
                  ? "Create the order"
                  : "Request an invoice"}
      </button>
    </>
  );
}
