import React from "react";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useSearchParams } from "react-router-dom";
import ComingSoonModal from "../components/ComingSoonModal.jsx";


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
  const [qs] = useSearchParams();
  const [showManualPayModal, setShowManualPayModal] = React.useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = React.useState(null);
  const [showComingSoonModal, setShowComingSoonModal] = React.useState(false);

  const closeComingSoonModal = () => {
    setShowComingSoonModal(false);
  };

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

  // Prefill from ?product=KEY&months=N (kept)
  React.useEffect(() => {
    const k = qs.get("product");
    const m = Math.max(parseInt(qs.get("months") || "1", 10), 1);
    if (!k) return;
    setCart((c) => (c[k] ? c : { ...c, [k]: { qty: m, firstTime: false } }));
  }, [qs, products.length]);

  // Prefill from localStorage cartItems after products load
  React.useEffect(() => {
    if (!products.length) return;
    const raw = localStorage.getItem("cartItems");
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      setCart((c) => {
        const next = { ...c };
        arr.forEach(({ productKey, qty, firstTime }) => {
          next[productKey] = {
            qty: Math.max(parseInt(qty || 1, 10), 1),
            firstTime: !!firstTime,
          };
        });
        return next;
      });
    } catch {}
  }, [products.length]);

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

  // PRICING HELPERS
  function getPrices(p) {
    const monthly =
      currency === "USD" ? p.price?.monthlyUSD : p.price?.monthlyNGN;
    const yearly = currency === "USD" ? p.price?.yearlyUSD : p.price?.yearlyNGN;
    const install =
      currency === "USD" ? p.price?.installUSD : p.price?.installNGN;
    return {
      monthly: Number(monthly || 0),
      yearly: Number(yearly || 0),
      install: Number(install || 0),
    };
  }

  function priceForQuantity(p, qty, firstTime) {
    const { monthly, yearly, install } = getPrices(p);
    let total = 0;
    let note = "";

    if (p.billingInterval === "yearly") {
      total = yearly * qty;
      note = `${qty} yr × ${fmt(yearly, currency)}`;
    } else {
      const years = Math.floor(qty / 12);
      const rem = qty % 12;

      if (years > 0) {
        total += years * yearly;
        note = `${years}× yearly`;
      }

      if (rem >= 6) {
        const discounted = rem * monthly * 0.85;
        total += discounted;
        note += note ? ` + ${rem} mo @15% off` : `${rem} mo @15% off`;
      } else if (rem > 0) {
        total += rem * monthly;
        note += note ? ` + ${rem} mo` : `${rem} mo`;
      }
    }

    if (firstTime) total += install || 0;
    return {
      total,
      note: note || (p.billingInterval === "yearly" ? "yearly" : "monthly"),
    };
  }

  function lineSubtotal(p, entry) {
    if (!entry) return 0;
    const qty = Math.max(parseInt(entry.qty || 1, 10), 1);
    return priceForQuantity(p, qty, !!entry.firstTime).total;
  }

  const chosen = products.filter((p) => !!cart[p.key]);
  const total = chosen.reduce(
    (sum, p) => sum + lineSubtotal(p, cart[p.key]),
    0
  );

  // NEW: show manual-pay modal instead of redirecting to Paystack
  async function createPendingPurchaseAndShowModal() {
    if (!chosen.length) return;
    setSubmitting(true);
    setMsg("");
    try {
      const items = chosen.map((p) => ({
        productKey: p.key,
        qty: Math.max(parseInt(cart[p.key].qty || 1, 10), 1),
        firstTime: !!cart[p.key].firstTime,
      }));

      // call server to create pending purchase (same endpoint as before)
      const out = await apiAuthed(`/purchase/cart`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, items }),
      });

      // We intentionally do NOT redirect to Paystack.
      // Instead, show modal with bank details and let user confirm manual payment.
      setPendingPurchaseId(out.purchaseId || out.purchase?._id || null);
      setShowManualPayModal(true);

      // leave cart intact until the user confirms "I have paid"
      setMsg(out.message || "Order created. Please pay manually and confirm.");
    } catch (e) {
      setMsg(e.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  // called when user presses "I have paid" in the modal
  async function confirmManualPayment() {
    if (!pendingPurchaseId) {
      setMsg("No pending purchase found.");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      // Clear the cart locally (so UI updates)
      setCart({});
      localStorage.setItem("cartItems", "[]");
      localStorage.setItem("cartCount", "0");

      // Optionally tell backend to mark as waiting-for-admin-review (already pending)
      // We can also hit a "notify" endpoint if you prefer to send an admin notification.
      // For now: purchase already has status 'pending', so admin UI will show it.
      setShowManualPayModal(false);
      setPendingPurchaseId(null);
      setMsg("Thank you. Your payment request is pending admin verification.");
    } catch (e) {
      setMsg(e.message || "Confirmation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ComingSoonModal
        show={showComingSoonModal}
        onClose={closeComingSoonModal}
      />
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
          const { monthly, yearly, install } = getPrices(p);

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
                {Number(p.price?.installNGN) > 0 &&
                  ` · Install: ₦${(p.price.installNGN || 0).toLocaleString()}`}
              </div>
              <div className="text-xs text-slate-600">
                USD:{" "}
                {p.billingInterval === "yearly"
                  ? `$${(p.price?.yearlyUSD || 0).toFixed(2)}/yr`
                  : `$${(p.price?.monthlyUSD || 0).toFixed(2)}/mo`}
                {Number(p.price?.installUSD) > 0 &&
                  ` · Install: $${(p.price.installUSD || 0).toFixed(2)}`}
              </div>

              <div className="text-sm mt-1">
                Current ({currency}):{" "}
                <span className="font-medium">
                  {fmt(
                    p.billingInterval === "yearly" ? yearly : monthly,
                    currency
                  )}{" "}
                  / {p.billingInterval === "yearly" ? "year" : "month"}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => setShowComingSoonModal(true)}
                  // onClick={() => toggleInCart(p.key)}
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

                  {(() => {
                    const qty = Math.max(parseInt(entry.qty || 1, 10), 1);
                    const { total: sub, note } = priceForQuantity(
                      p,
                      qty,
                      entry.firstTime
                    );
                    return (
                      <div className="text-sm">
                        Subtotal:{" "}
                        <span className="font-semibold">
                          {fmt(sub, currency)}
                        </span>
                        <span className="ml-2 text-xs text-slate-600">
                          ({note}
                          {entry.firstTime ? " + install" : ""})
                        </span>
                      </div>
                    );
                  })()}
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
                const qty = Math.max(parseInt(entry.qty || 1, 10), 1);
                const { total: lineTotal, note } = priceForQuantity(
                  p,
                  qty,
                  entry.firstTime
                );
                const qtyLabel = p.billingInterval === "yearly" ? "yr" : "mo";
                return (
                  <div
                    key={p.key}
                    className="flex items-center justify-between"
                  >
                    <div>
                      {p.name} · {qty} {qtyLabel} ({note})
                      {entry.firstTime && " + install"}
                    </div>
                    <div className="font-medium">
                      {fmt(lineTotal, currency)}
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
              onClick={createPendingPurchaseAndShowModal}
              disabled={!chosen.length || submitting}
            >
              {submitting ? "Processing…" : "Pay"}
            </button>
            {msg && <div className="text-sm mt-2">{msg}</div>}
          </>
        )}
      </div>

      {/* Manual payment modal */}
      {showManualPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowManualPayModal(false)}
          />
          <div className="relative bg-white rounded p-6 max-w-lg w-full z-10">
            <h3 className="text-lg font-semibold mb-2">Pay to account</h3>
            <p className="text-sm text-slate-700 mb-4">
              Use the following account details to make payment, then click "I
              have paid".
            </p>

            <div className="space-y-2 mb-4">
              <div className="font-medium">Account number</div>
              <div className="text-lg">1634998770</div>

              <div className="font-medium mt-2">Account name</div>
              <div className="text-lg">ADLM Studio</div>

              <div className="font-medium mt-2">Bank</div>
              <div className="text-lg">Access Bank</div>

              <div className="text-xs text-slate-500 mt-2">
                After you click "I have paid", we'll clear your cart locally and
                the admin will be notified to approve or reject your
                subscription.
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-ghost"
                onClick={() => setShowManualPayModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={confirmManualPayment}
                disabled={submitting}
              >
                {submitting ? "Confirming…" : "I have paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
