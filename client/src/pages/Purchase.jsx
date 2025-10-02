import React from "react";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

// Format helpers
const fmt = (n, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    n || 0
  );

export default function Purchase() {
  const { accessToken } = useAuth();
  const [products, setProducts] = React.useState([]);
  const [cart, setCart] = React.useState({}); // { [productKey]: { qty, firstTime } }
  const [currency, setCurrency] = React.useState("NGN"); // "NGN" | "USD"
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  // Load published products (public endpoint now returns price.{NGN,USD} + fxRateNGNUSD)
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products?page=1&pageSize=100`, {
          credentials: "include",
        });
        const json = await res.json();
        setProducts(json.items || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  function updateItem(key, patch) {
    setCart((c) => ({
      ...c,
      [key]: { ...(c[key] || { qty: 1, firstTime: false }), ...patch },
    }));
  }
  function toggleInCart(key) {
    setCart((c) =>
      c[key]
        ? (() => {
            const { [key]: _, ...rest } = c;
            return rest;
          })()
        : { ...c, [key]: { qty: 1, firstTime: false } }
    );
  }

  // Client-side subtotal (server re-checks)
  function unitPrice(p) {
    if (p.billingInterval === "yearly") {
      return currency === "USD"
        ? p.price?.yearlyUSD || 0
        : p.price?.yearlyNGN || 0;
    }
    return currency === "USD"
      ? p.price?.monthlyUSD || 0
      : p.price?.monthlyNGN || 0;
  }
  function installFee(p, firstTime) {
    if (!firstTime) return 0;
    return currency === "USD"
      ? p.price?.installUSD || 0
      : p.price?.installNGN || 0;
  }
  function lineSubtotal(p, entry) {
    if (!entry) return 0;
    const qty = Math.max(parseInt(entry.qty || 1, 10), 1);
    return unitPrice(p) * qty + installFee(p, entry.firstTime);
  }

  const chosen = products.filter((p) => !!cart[p.key]);
  const total = chosen.reduce(
    (sum, p) => sum + lineSubtotal(p, cart[p.key]),
    0
  );

  async function pay() {
    if (!chosen.length) return;
    setSubmitting(true);
    setMsg("");
    try {
      const items = chosen.map((p) => ({
        productKey: p.key,
        qty: Math.max(parseInt(cart[p.key].qty || 1, 10), 1),
        firstTime: !!cart[p.key].firstTime,
      }));

      const out = await apiAuthed(`/purchase/cart`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, items }),
      });

      // If NGN and Paystack was initialized, redirect user to Paystack
      if (out?.paystack?.authorization_url) {
        window.location.href = out.paystack.authorization_url;
        return;
      }

      setMsg(out.message || "Order submitted. Admin will verify.");
      setCart({});
    } catch (e) {
      setMsg(e.message || "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Subscribe</h1>
          <p className="text-sm text-slate-600">
            Select products, duration, and if you’re a first-time user
            (installation fee applies).
          </p>
        </div>
        <label className="text-sm">
          <div className="mb-1">Currency</div>
          <select
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="NGN">NGN (₦)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
      </div>

      {/* Catalog */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => {
          const entry = cart[p.key];
          const inCart = !!entry;
          const qtyLabel = p.billingInterval === "yearly" ? "Years" : "Months";
          const unit = unitPrice(p);

          return (
            <div
              key={p._id}
              className={`border rounded p-3 ${
                inCart ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-slate-600">{p.blurb}</div>

              <div className="mt-2 text-sm">
                Billing:{" "}
                <span className="font-medium">{p.billingInterval}</span>
              </div>

              {/* Show both prices for clarity */}
              <div className="text-xs text-slate-600 mt-1">
                NGN:{" "}
                {p.billingInterval === "yearly"
                  ? `₦${(p.price?.yearlyNGN || 0).toLocaleString()}/yr`
                  : `₦${(p.price?.monthlyNGN || 0).toLocaleString()}/mo`}
                {p.price?.installNGN > 0 &&
                  ` · Install: ₦${(p.price.installNGN || 0).toLocaleString()}`}
              </div>
              <div className="text-xs text-slate-600">
                USD:{" "}
                {p.billingInterval === "yearly"
                  ? `$${(p.price?.yearlyUSD || 0).toFixed(2)}/yr`
                  : `$${(p.price?.monthlyUSD || 0).toFixed(2)}/mo`}
                {p.price?.installUSD > 0 &&
                  ` · Install: $${(p.price.installUSD || 0).toFixed(2)}`}
              </div>

              <div className="text-sm mt-1">
                Price ({currency}):{" "}
                <span className="font-medium">
                  {fmt(unit, currency)} /{" "}
                  {p.billingInterval === "yearly" ? "year" : "month"}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => toggleInCart(p.key)}
                >
                  {inCart ? "Remove" : "Add"}
                </button>
              </div>

              {inCart && (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm">
                    {qtyLabel}
                    <input
                      type="number"
                      min="1"
                      className="input mt-1"
                      value={entry.qty}
                      onChange={(e) =>
                        updateItem(p.key, { qty: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.firstTime}
                      onChange={(e) =>
                        updateItem(p.key, { firstTime: e.target.checked })
                      }
                    />
                    First-time user? (add install fee)
                  </label>

                  <div className="text-sm">
                    Subtotal:{" "}
                    <span className="font-semibold">
                      {fmt(lineSubtotal(p, entry), currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cart summary */}
      <div className="card">
        <h2 className="font-semibold mb-2">Summary</h2>

        {chosen.length === 0 ? (
          <div className="text-sm text-slate-600">No items selected.</div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              {chosen.map((p) => {
                const entry = cart[p.key];
                const unit = unitPrice(p);
                const qtyLabel = p.billingInterval === "yearly" ? "yr" : "mo";
                return (
                  <div
                    key={p.key}
                    className="flex items-center justify-between"
                  >
                    <div>
                      {p.name} · {entry.qty} {qtyLabel} @ {fmt(unit, currency)}
                      {entry.firstTime && " + install"}
                    </div>
                    <div className="font-medium">
                      {fmt(lineSubtotal(p, entry), currency)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between text-lg">
              <div>Total</div>
              <div className="font-semibold">{fmt(total, currency)}</div>
            </div>

            <button
              className="btn mt-4"
              onClick={pay}
              disabled={!chosen.length || submitting}
            >
              {submitting
                ? "Redirecting…"
                : currency === "NGN"
                ? "Pay with Paystack"
                : "Place Order"}
            </button>
            {msg && <div className="text-sm mt-2">{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}
