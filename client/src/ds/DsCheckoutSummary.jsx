// The order summary beside his checkout form, from the real cart.
//
// His panel is dressed with one sample order — "5 seats across 3 products",
// "Then ₦128,000 monthly until cancelled" — and an #ord-rows div his script
// never fills. On a checkout page that is worse than empty: it states a figure
// the buyer has not agreed to, next to the control that takes their money.
//
// The rows, the seat count and the renewal line all come from the cart and the
// catalogue. His markup and classes are unchanged.

import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config.js";
import { readCartItems } from "../lib/cart.js";

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(n) || 0);

export default function DsCheckoutSummary() {
  const [items, setItems] = React.useState([]);
  const [products, setProducts] = React.useState(null);

  React.useEffect(() => {
    setItems(readCartItems());
    let alive = true;
    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!alive || !raw) return;
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        setProducts(Object.fromEntries(all.map((p) => [p.key, p])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const rows = React.useMemo(
    () =>
      items.map((it) => {
        const key = String(it.productKey || "").trim();
        const p = products?.[key] || null;
        const seats = Math.max(1, parseInt(it.seats ?? 1, 10) || 1);
        const periods = Math.max(1, parseInt(it.periods ?? it.qty ?? 1, 10) || 1);
        // Yearly is the price the builder quotes and the one the cart is
        // filled at; a product with no yearly figure falls back to monthly
        // rather than rendering a zero.
        const yearly = Number(p?.price?.yearlyNGN) || 0;
        const monthly = Number(p?.price?.monthlyNGN) || 0;
        const unit = yearly || monthly;
        return {
          key,
          name: p?.name || key,
          seats,
          periods,
          unit,
          amount: unit * seats * periods,
          // Unknown until the catalogue answers — shown as such rather than
          // as ₦0, which reads like a free licence.
          known: !!p,
        };
      }),
    [items, products],
  );

  const seatTotal = rows.reduce((n, r) => n + r.seats, 0);
  const renewal = rows.reduce((n, r) => n + (r.known ? r.unit * r.seats : 0), 0);
  const priced = rows.every((r) => r.known);

  if (!items.length) {
    return (
      <>
        <p className="sub">Your cart is empty.</p>
        <p className="small" style={{ marginTop: "16px" }}>
          <Link to="/products" style={{ color: "var(--action)" }}>
            Choose your licences
          </Link>{" "}
          — or price them first on the{" "}
          <Link to="/quote" style={{ color: "var(--action)" }}>
            quotation builder
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <p className="sub">
        {seatTotal} seat{seatTotal === 1 ? "" : "s"} across {rows.length} product
        {rows.length === 1 ? "" : "s"}.
      </p>

      <div>
        {rows.map((r) => (
          <div className="sumrow" key={r.key}>
            <span>
              {r.name}
              <i className="qt-q"> × {r.seats}</i>
            </span>
            <b>{r.known ? fmt(r.amount) : "—"}</b>
          </div>
        ))}
      </div>

      <p className="small" style={{ marginTop: "16px" }}>
        {priced ? (
          <>
            Then {fmt(renewal)} yearly until cancelled.{" "}
          </>
        ) : (
          <>Prices are confirmed on the next step. </>
        )}
        <Link to="/purchase" style={{ color: "var(--action)" }}>
          Edit cart
        </Link>
      </p>
    </>
  );
}
