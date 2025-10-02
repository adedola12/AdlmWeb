// src/pages/Purchase.jsx
import React from "react";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

// Small display helper
function formatMoney(n) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n || 0);
}

export default function Purchase() {
  const { accessToken } = useAuth();
  const [products, setProducts] = React.useState([]);
  const [cart, setCart] = React.useState({}); // { [productKey]: { qty, firstTime } }
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  // Load published products
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

  // Pricing client-side (server will re-check)
  function lineSubtotal(p, entry) {
    if (!entry) return 0;
    const qty = Math.max(parseInt(entry.qty || 1, 10), 1);
    const install = entry.firstTime ? p.installFee || 0 : 0;
    const unit =
      p.billingInterval === "yearly" ? p.priceYearly || 0 : p.priceMonthly || 0;
    return unit * qty + install;
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
        body: JSON.stringify({ items }),
      });
      setMsg(out.message || "Order submitted. Admin will verify.");
      // Optionally clear cart:
      setCart({});
    } catch (e) {
      setMsg(e.message || "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Subscribe</h1>
      <p className="text-sm text-slate-600">
        Select the products, duration, and whether you’re a first-time user
        (installation fee applies if enabled).
      </p>

      {/* Catalog */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => {
          const entry = cart[p.key];
          const inCart = !!entry;
          const qtyLabel = p.billingInterval === "yearly" ? "Years" : "Months";
          const unit =
            p.billingInterval === "yearly" ? p.priceYearly : p.priceMonthly;

          return (
            <div
              key={p._id}
              className={`border rounded p-3 N{
                inCart ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-slate-600">{p.blurb}</div>
              <div className="mt-2 text-sm">
                Billing:{" "}
                <span className="font-medium">{p.billingInterval}</span>
              </div>
              <div className="text-sm">
                Price:{" "}
                <span className="font-medium">{formatMoney(unit || 0)}</span> /{" "}
                {p.billingInterval === "yearly" ? "year" : "month"}
              </div>
              {p.installFee > 0 && (
                <div className="text-xs text-slate-600">
                  Install fee: {formatMoney(p.installFee)}
                </div>
              )}

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
                      {formatMoney(lineSubtotal(p, entry))}
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
                const unit =
                  p.billingInterval === "yearly"
                    ? p.priceYearly
                    : p.priceMonthly;
                const qtyLabel = p.billingInterval === "yearly" ? "yr" : "mo";
                return (
                  <div
                    key={p.key}
                    className="flex items-center justify-between"
                  >
                    <div>
                      {p.name} · {entry.qty} {qtyLabel} @ {formatMoney(unit)}{" "}
                      {entry.firstTime && " + install"}
                    </div>
                    <div className="font-medium">
                      {formatMoney(lineSubtotal(p, entry))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between text-lg">
              <div>Total</div>
              <div className="font-semibold">{formatMoney(total)}</div>
            </div>

            <button
              className="btn mt-4"
              onClick={pay}
              disabled={!chosen.length || submitting}
            >
              {submitting ? "Submitting…" : "Pay (Simulated)"}
            </button>
            {msg && <div className="text-sm mt-2">{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}
