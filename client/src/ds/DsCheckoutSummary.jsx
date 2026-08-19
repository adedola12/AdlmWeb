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
import { readCartItems, readCartMeta } from "../lib/cart.js";
import { termTotalNGN, unitPrices } from "../lib/termPricing.js";

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(n) || 0);

export default function DsCheckoutSummary() {
  const [items, setItems] = React.useState([]);
  const [products, setProducts] = React.useState(null);
  // On-site training is not a catalogue product, so it is not a cart line —
  // it travels on cartMeta. It still has to appear here, or the panel quietly
  // omits the largest figure on the order.
  const [training, setTraining] = React.useState(null);

  React.useEffect(() => {
    setItems(readCartItems());
    const chosen = readCartMeta()?.training;
    if (chosen?.locationId) {
      fetch(`${API_BASE}/training-locations`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const loc = (d?.locations || []).find(
            (l) => String(l._id) === String(chosen.locationId),
          );
          if (loc) setTraining({ loc, bimInstall: !!chosen.bimInstall });
        })
        .catch(() => {});
    }
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

        // termTotalNGN, not price x periods.
        //
        // A monthly-billed product is priced in tiers — six months has its own
        // figure, twelve months uses the yearly one — and the yearly price IS
        // twelve months. Multiplying it by twelve periods put QUIV at
        // ₦12,000,000 on this panel. This is the same helper the purchase page
        // uses and it mirrors the server's computeRecurring, so the three
        // cannot disagree.
        const term = p ? termTotalNGN(p, periods) : 0;
        const install = p && it.firstTime ? Number(unitPrices(p).install) || 0 : 0;

        return {
          key,
          name: p?.name || key,
          seats,
          periods,
          amount: (term + install) * seats,
          recurring: term * seats,
          // Unknown until the catalogue answers — shown as such rather than as
          // ₦0, which reads like a free licence.
          known: !!p,
        };
      }),
    [items, products],
  );

  const seatTotal = rows.reduce((n, r) => n + r.seats, 0);
  const renewal = rows.reduce((n, r) => n + (r.known ? r.recurring : 0), 0);
  const yearly = items.every(
    (it) => Math.max(1, parseInt(it.periods ?? it.qty ?? 1, 10) || 1) >= 12,
  );
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
        {rows.length === 1 ? "" : "s"}
        {training ? ", with on-site training" : ""}.
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

        {training && (
          <>
            <div className="sumrow">
              <span>
                On-site training
                <i className="qt-q"> · {training.loc.city}</i>
              </span>
              <b>{fmt(training.loc.trainingCostNGN)}</b>
            </div>
            {training.bimInstall && Number(training.loc.bimInstallCostNGN) > 0 && (
              <div className="sumrow">
                <span>CAD set-up on site</span>
                <b>{fmt(training.loc.bimInstallCostNGN)}</b>
              </div>
            )}
          </>
        )}
      </div>

      <p className="small" style={{ marginTop: "16px" }}>
        {priced ? (
          <>
            Then {fmt(renewal)} {yearly ? "yearly" : "monthly"} until cancelled.{" "}
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
