// One rate, and what it is made of.
//
// This screen has no equivalent anywhere in the app. /rategen lists rates and
// lets you edit them; nothing has ever shown a rate broken into the materials,
// labour and plant underneath it, with the overhead and profit that turn a net
// cost into a rate. That breakdown is the product's whole argument — "Measure
// it. Price it. Defend it." — and defending a rate means being able to show it.
//
// The data was already there. RateGenRate stores `breakdown`, an array of
// components each carrying refKind (material / labour / plant), a quantity, a
// unit price and what it comes to, plus the date that price was taken. The
// sync route sends it. Nothing needed adding server-side.
//
// His markup: .wk-back / .wk-hd / .wk-panel / .wk-ph / .wk-bt with .wk-bhd,
// .wk-grp per group, .wk-bl per line, and .wk-sub / .wk-tot for the closing
// rows.
//
// His percentage inputs are NOT reproduced. On his build they are live and
// recompute the rate as you type; ours would have to write back through
// /rategen-v2/library/user-rates, and a control that looks editable but throws
// the edit away on reload is worse than a figure. The rate is read here and
// edited in RateGen, and the screen says so.

import React from "react";
import { Link, useParams } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const qty = (n) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 4 }).format(Number(n) || 0);

const longDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

// His two groups, plus a third for anything that is neither. refKind is a free
// string on the model rather than an enum, so unknown kinds are grouped rather
// than dropped — a component nobody can see is a component nobody can check.
const GROUPS = [
  { id: "material", label: "Materials", match: (k) => k === "material" || k === "consumable" },
  { id: "labour", label: "Labour", match: (k) => k === "labour" },
  { id: "plant", label: "Plant and other", match: () => true },
];

export default function DsWorkRate() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const [rates, setRates] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/rategen-v2/library/rates/sync", {
      token: accessToken,
      params: { limit: 500 },
    })
      .then((d) => alive && setRates(Array.isArray(d.items) ? d.items : []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const rate = React.useMemo(
    () => (rates ? rates.find((r) => String(r.id) === String(id)) || null : null),
    [rates, id],
  );

  const grouped = React.useMemo(() => {
    if (!rate) return [];
    const rows = Array.isArray(rate.breakdown) ? rate.breakdown : [];
    const taken = new Set();
    return GROUPS.map((g) => {
      const items = rows.filter((r, i) => {
        if (taken.has(i)) return false;
        const kind = String(r.refKind || "").toLowerCase();
        if (!g.match(kind)) return false;
        taken.add(i);
        return true;
      });
      return {
        ...g,
        items,
        total: items.reduce((n, r) => n + (Number(r.totalPrice) || 0), 0),
      };
    }).filter((g) => g.items.length > 0);
  }, [rate]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">That rate could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!rates) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading the rate…</p>
      </div>
    );
  }
  if (!rate) {
    return (
      <div className="dsh-in">
        <p className="wk-back">
          <Link to="/work/library">← Rate library</Link>
        </p>
        <p className="sub">
          That rate is not in this library. It may have been removed, or it belongs to another
          account.
        </p>
      </div>
    );
  }

  const net = Number(rate.netCost) || 0;
  const overhead = Number(rate.overheadValue) || 0;
  const profit = Number(rate.profitValue) || 0;
  const total = Number(rate.totalCost) || 0;

  // The components should add up to the net cost. When they do not, the rate
  // carries a figure its own build-up cannot explain — which is exactly the
  // thing this screen exists to make visible, so it is stated rather than
  // hidden behind a rounding tolerance.
  const componentSum = grouped.reduce((n, g) => n + g.total, 0);
  const unexplained = Math.round((net - componentSum) * 100) / 100;

  return (
    <div className="dsh-in">
      <p className="wk-back">
        <Link to="/work/library">← Rate library</Link>
      </p>

      <div className="wk-head">
        <div>
          <h1>{rate.description || rate.itemNo || "Rate"}</h1>
          <p className="wk-ref">
            {[rate.itemNo, rate.sectionLabel, rate.unit ? `per ${rate.unit}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="wk-acts">
          <Link className="btn btn-o btn-sm" to="/rategen">
            Edit in RateGen
          </Link>
        </div>
      </div>

      <div className="wk-two">
        <div>
          <section className="wk-panel">
            <div className="wk-ph">
              <h2>The build-up</h2>
              <span className="wk-locnote">
                {rate.zone || rate.state
                  ? `Priced for ${rate.zone || rate.state}`
                  : "Priced from the master library"}
              </span>
            </div>

            {grouped.length ? (
              <div className="wk-bt">
                <div className="wk-bhd">
                  <span>Component</span>
                  <span>Quantity</span>
                  <span>Unit price</span>
                  <span>Amount</span>
                </div>

                {grouped.map((g) => (
                  <React.Fragment key={g.id}>
                    <div className="wk-grp">{g.label}</div>
                    {g.items.map((c, i) => (
                      <div className="wk-bl" key={`${g.id}-${i}`}>
                        <span className="nm">
                          {c.componentName || c.refName || "Component"}
                          {c.priceAsOf ? <em>priced {longDate(c.priceAsOf)}</em> : null}
                        </span>
                        <span className="qt">
                          {qty(c.quantity)}
                          <i>{c.unit || ""}</i>
                        </span>
                        <span className="pr">{money(c.unitPrice)}</span>
                        <span className="am">{money(c.totalPrice)}</span>
                      </div>
                    ))}
                  </React.Fragment>
                ))}

                {unexplained !== 0 && (
                  <div className="wk-bl">
                    <span className="nm">
                      Not itemised
                      <em>carried in the net cost without a component behind it</em>
                    </span>
                    <span className="qt" />
                    <span className="pr" />
                    <span className="am">{money(unexplained)}</span>
                  </div>
                )}

                <div className="wk-bl wk-sub">
                  <span className="nm">Net cost</span>
                  <span className="qt" />
                  <span className="pr" />
                  <span className="am">{money(net)}</span>
                </div>

                <div className="wk-bl">
                  <span className="nm">Overhead</span>
                  <span className="qt">
                    {qty(rate.overheadPercent)}
                    <i>%</i>
                  </span>
                  <span className="pr">on {money(net)}</span>
                  <span className="am">{money(overhead)}</span>
                </div>

                <div className="wk-bl">
                  <span className="nm">Profit</span>
                  <span className="qt">
                    {qty(rate.profitPercent)}
                    <i>%</i>
                  </span>
                  <span className="pr">on {money(net)}</span>
                  <span className="am">{money(profit)}</span>
                </div>

                <div className="wk-bl wk-tot">
                  <span className="nm">Rate</span>
                  <span className="qt" />
                  <span className="pr">per {rate.unit || "unit"}</span>
                  <span className="am">{money(total)}</span>
                </div>
              </div>
            ) : (
              <div style={{ padding: "16px 20px" }}>
                <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
                  This rate has no components stored against it, so there is nothing to break
                  down. It carries {money(total)} per {rate.unit || "unit"} as a flat figure.
                </p>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="wk-panel">
            <div className="wk-ph">
              <h2>What this rate is</h2>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <div className="dsh-kv">
                <div>
                  <span>Item number</span>
                  <b>{rate.itemNo || "—"}</b>
                </div>
                <div>
                  <span>Section</span>
                  <b>{rate.sectionLabel || "—"}</b>
                </div>
                <div>
                  <span>Unit</span>
                  <b>{rate.unit || "—"}</b>
                </div>
                <div>
                  <span>Priced for</span>
                  <b>{rate.zone || rate.state || "Master library"}</b>
                </div>
                <div>
                  <span>Components</span>
                  <b>{(rate.breakdown || []).length}</b>
                </div>
                <div>
                  <span>Last changed</span>
                  <b>{longDate(rate.updatedAt) || "—"}</b>
                </div>
              </div>
            </div>
          </section>

          <section className="wk-panel">
            <div className="wk-ph">
              <h2>Changing it</h2>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.65,
                }}
              >
                This is the rate as it stands, read from the library. Editing happens in
                RateGen, and a change there reaches every product on this account and every
                project priced against it afterwards. Projects already priced keep the figure
                they were priced with.
              </p>
              <Link className="btn btn-o btn-sm" to="/rategen" style={{ marginTop: 16 }}>
                Edit in RateGen
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
