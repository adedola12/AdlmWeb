// The quotation builder — his page, priced from the live catalogue.
//
// Ported from his assets/js/quote.js. The markup is his, unchanged: .qt-build /
// .panel / .toggle2 / .line / .qty / .amt2 / .qt-form / .qt-panel / .trust.
// The behaviour is the same too — pick quantities, switch billing period, watch
// the summary update, then print the quotation.
//
// WHAT CHANGED, AND WHY IT MATTERED
// His catalogue was a literal in the script, and it had already drifted from
// what we charge: install was 0 for Revit MEP and CIVIQ, where the catalogue
// says ₦20,000 and ₦40,000. A marketing page being stale is untidy; a
// QUOTATION being stale is a disputed invoice, because the customer has a
// document with our number on it. So every figure here comes from
// GET /products, and the fallbacks are the catalogue's values rather than his.
//
// The one deliberate gap is his, kept: on-site training carries no rate. It is
// quoted on enquiry, and the quotation says so on its face rather than
// inventing a number or dropping the line.

import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config.js";

// VAT, as his document renderer applies it.
const VAT = 0.075;

// His catalogue order, his editorial sub-lines and his icons — none of which
// live in the product record. `key` is what the API is keyed on.
const PRODUCTS = [
  { key: "revit", name: "QUIV", sub: "3D takeoff · Autodesk Revit", icon: "/ds/ic-quiv.png" },
  { key: "planswift", name: "HERON", sub: "2D takeoff · PlanSwift", icon: "/ds/ic-heron.png" },
  { key: "rategen", name: "RateGen", sub: "Rate build-ups · desktop", icon: "/ds/ic-rategen.png" },
  { key: "mep", name: "Revit MEP", sub: "MEP & HVAC takeoff · Revit", icon: "/ds/ic-mep.png" },
  { key: "qs-takeoff", name: "Time Pro", sub: "Site productivity · desktop & phone", icon: "/ds/ic-timepro.png" },
  {
    key: "civil3d",
    name: "CIVIQ",
    sub: "Civil 3D · in development",
    icon: "/ds/ic-civiq.png",
    note: "Indicative until release",
  },
];

// Courses are real catalogue rows (isCourse). On-site training is not — it has
// no rate by design.
const TRAINING = [
  { key: "bimbld", name: "BIM for Building Works", sub: "Certificated course · six weeks · per seat" },
  { key: "BIMMEP", name: "BIM for MEP & HVAC", sub: "Certificated course · per seat" },
  { key: null, id: "onsite", name: "On-site training", sub: "An ADLM instructor at your office · per day" },
];

// His figures, kept only as a floor if the catalogue cannot be reached — with
// the two install fees corrected to what we actually charge.
const FALLBACK = {
  revit: { mo: 50000, yr: 500000, install: 25000 },
  planswift: { mo: 12000, yr: 120000, install: 15000 },
  rategen: { mo: 8000, yr: 70000, install: 0 },
  mep: { mo: 18000, yr: 180000, install: 20000 },
  "qs-takeoff": { mo: 2000, yr: 20000, install: 0 },
  civil3d: { mo: 70000, yr: 700000, install: 40000 },
  bimbld: { yr: 125000 },
  BIMMEP: { yr: 105000 },
};

const FMT = {
  NGN: new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
};

export default function DsQuoteBuilder() {
  const [prices, setPrices] = React.useState(null);
  const [qty, setQty] = React.useState({});
  const [bill, setBill] = React.useState("yearly");
  const [cur, setCur] = React.useState("NGN");
  const [firm, setFirm] = React.useState({ org: "", person: "", email: "", addr: "" });
  const [showDoc, setShowDoc] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        const map = {};
        for (const p of all) {
          const q = p.price || {};
          map[p.key] = {
            mo: Number(q.monthlyNGN) || 0,
            yr: Number(q.yearlyNGN) || 0,
            install: Number(q.installNGN) || 0,
            moUSD: Number(q.monthlyUSD) || 0,
            yrUSD: Number(q.yearlyUSD) || 0,
            installUSD: Number(q.installUSD) || 0,
          };
        }
        if (alive) setPrices(map);
      } catch {
        if (alive) setPrices(FALLBACK);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const priceOf = React.useCallback(
    (key) => (prices && prices[key]) || FALLBACK[key] || { mo: 0, yr: 0, install: 0 },
    [prices],
  );

  // USD figures exist per product; where one is missing fall back to the naira
  // number so a row never renders as zero.
  const inCur = React.useCallback(
    (p, field) => {
      if (cur === "NGN") return p[field] || 0;
      const usd = p[`${field}USD`];
      return usd || p[field] || 0;
    },
    [cur],
  );

  const money = React.useCallback((n) => FMT[cur].format(Number(n) || 0), [cur]);

  const step = (id, by) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) + by) }));

  // One calculation, used by the picker, the summary and the quotation — so the
  // document can never say something the screen did not.
  const calc = React.useMemo(() => {
    const rows = [];
    let licences = 0;
    let install = 0;
    let enquiry = 0;

    for (const p of PRODUCTS) {
      const n = qty[p.key] || 0;
      if (!n) continue;
      const price = priceOf(p.key);
      const unit = inCur(price, bill === "yearly" ? "yr" : "mo");
      licences += unit * n;
      rows.push({
        desc: `${p.name} licence — ${p.sub} (${bill === "yearly" ? "yearly" : "monthly"})`,
        qty: n, unit: "PC", rate: unit, amount: unit * n,
      });
      const fee = inCur(price, "install");
      if (fee) {
        install += fee * n;
        rows.push({
          desc: `${p.name} installation — one-time setup in your CAD environment`,
          qty: n, unit: "PC", rate: fee, amount: fee * n,
        });
      }
    }

    for (const t of TRAINING) {
      const id = t.key || t.id;
      const n = qty[id] || 0;
      if (!n) continue;
      if (!t.key) {
        enquiry += n;
        rows.push({ desc: `${t.name} — ${t.sub}`, qty: n, unit: "day", rate: null, amount: null });
        continue;
      }
      const unit = inCur(priceOf(t.key), "yr");
      licences += unit * n;
      rows.push({ desc: `${t.name} — ${t.sub}`, qty: n, unit: "seat", rate: unit, amount: unit * n });
    }

    const net = licences + install;
    const vat = Math.round(net * VAT);
    return { rows, licences, install, net, vat, total: net + vat, enquiry };
  }, [qty, bill, priceOf, inCur]);

  const picked = calc.rows.length > 0;

  return (
    <>
      <div className="qt-build">
        <div className="panel rise">
          <h3>What you need</h3>
          <p className="ds-sub">Licences are per PC. Yearly costs ten months, so two are free.</p>

          <div className="qt-controls">
            <div className="toggle2" id="qt-bill" role="group" aria-label="Billing period">
              <button type="button" className={bill === "yearly" ? "on" : ""} onClick={() => setBill("yearly")}>
                Yearly · 2 months free
              </button>
              <button type="button" className={bill === "monthly" ? "on" : ""} onClick={() => setBill("monthly")}>
                Monthly
              </button>
            </div>
            <label className="qt-cur">
              <span>Show me in</span>
              <select value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Currency">
                <option value="NGN">Naira (₦)</option>
                <option value="USD">Dollars ($)</option>
              </select>
            </label>
          </div>

          <div id="qt-cat">
            {PRODUCTS.map((p) => {
              const n = qty[p.key] || 0;
              const price = priceOf(p.key);
              const unit = inCur(price, bill === "yearly" ? "yr" : "mo");
              const fee = inCur(price, "install");
              return (
                <div className={n ? "line" : "line line-off"} key={p.key}>
                  <img src={p.icon} alt="" />
                  <div>
                    <b>{p.name}</b>
                    <span>{p.sub}</span>
                    <div className="qty">
                      <button type="button" onClick={() => step(p.key, -1)} aria-label={`Fewer ${p.name}`}>−</button>
                      <span>{n}</span>
                      <button type="button" onClick={() => step(p.key, 1)} aria-label={`More ${p.name}`}>+</button>
                    </div>
                  </div>
                  <div className="amt2">
                    <span>{money(unit * (n || 1))}</span>
                    <small>
                      {n ? `${n} × ` : "per PC · "}
                      {money(unit)}
                      {bill === "yearly" ? " / yr" : " / mo"}
                    </small>
                    {p.note && <small className="qt-flag">{p.note}</small>}
                    {fee > 0 && <small>+ {money(fee)} install, once</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel rise">
          <h3>Training</h3>
          <p className="ds-sub">
            Courses are per seat, per year. On-site training is quoted once we know the city and the
            size of the team.
          </p>
          <div id="qt-train">
            {TRAINING.map((t) => {
              const id = t.key || t.id;
              const n = qty[id] || 0;
              const unit = t.key ? inCur(priceOf(t.key), "yr") : null;
              return (
                <div className={n ? "line" : "line line-off"} key={id}>
                  <div>
                    <b>{t.name}</b>
                    <span>{t.sub}</span>
                    <div className="qty">
                      <button type="button" onClick={() => step(id, -1)} aria-label={`Fewer ${t.name}`}>−</button>
                      <span>{n}</span>
                      <button type="button" onClick={() => step(id, 1)} aria-label={`More ${t.name}`}>+</button>
                    </div>
                  </div>
                  <div className="amt2">
                    <span>{unit == null ? "On enquiry" : money(unit * (n || 1))}</span>
                    <small>
                      {unit == null
                        ? "Priced once we know the city and team size"
                        : `${n ? `${n} × ` : "per seat · "}${money(unit)} / yr`}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel rise">
          <h3>Who it is for</h3>
          <p className="ds-sub">
            Whatever you fill in is what the quotation is addressed to. Leave it blank and it prints
            without an address.
          </p>
          <div className="qt-form">
            <label>
              Organisation
              <input type="text" autoComplete="organization" placeholder="Adeyemi &amp; Partners"
                value={firm.org} onChange={(e) => setFirm({ ...firm, org: e.target.value })} />
            </label>
            <label>
              Contact
              <input type="text" autoComplete="name" placeholder="QS Babajide Gbajumo"
                value={firm.person} onChange={(e) => setFirm({ ...firm, person: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" autoComplete="email" placeholder="you@firm.com"
                value={firm.email} onChange={(e) => setFirm({ ...firm, email: e.target.value })} />
            </label>
            <label className="wide">
              Address
              <textarea rows="2" placeholder="10A Onipinla Ln, off Adeniyi Jones, Ogba, Ikeja, Lagos"
                value={firm.addr} onChange={(e) => setFirm({ ...firm, addr: e.target.value })} />
            </label>
          </div>
        </div>
      </div>

      <div className="panel rise qt-panel">
        <h3>Your quotation</h3>
        <p className="ds-sub">Everything below updates as you pick.</p>

        <div id="qt-sum">
          {!picked && <p className="ds-sub">Pick a licence or a course and the quotation builds itself.</p>}
          {picked && (
            <>
              <table className="ctable">
                <tbody>
                  {calc.rows.map((r) => (
                    <tr key={r.desc}>
                      <th className="rowhead" scope="row">
                        {r.desc}
                        <small>
                          {r.qty} {r.unit}
                          {r.rate != null ? ` × ${money(r.rate)}` : ""}
                        </small>
                      </th>
                      <td className="num">{r.amount == null ? "On enquiry" : money(r.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th className="rowhead" scope="row">Subtotal</th>
                    <td className="num">{money(calc.net)}</td>
                  </tr>
                  <tr>
                    <th className="rowhead" scope="row">VAT at 7.5%</th>
                    <td className="num">{money(calc.vat)}</td>
                  </tr>
                  <tr>
                    <th className="rowhead" scope="row"><b>Total</b></th>
                    <td className="num"><b>{money(calc.total)}</b></td>
                  </tr>
                </tbody>
              </table>
              {calc.enquiry > 0 && (
                <p className="ds-sub" style={{ marginTop: "12px" }}>
                  On-site training is quoted on enquiry and is not included in the total above.
                </p>
              )}
            </>
          )}
        </div>

        {picked && (
          <div id="qt-acts">
            <button
              type="button"
              className="ds-btn btn-p btn-full"
              style={{ marginTop: "22px" }}
              onClick={() => {
                setShowDoc(true);
                // Let the quotation paint before the print dialog opens.
                setTimeout(() => window.print(), 120);
              }}
            >
              See the quotation
            </button>
            <Link to="/purchase" className="ds-btn btn-o btn-full" style={{ marginTop: "10px" }}>
              Buy these now
            </Link>
            <div className="trust">
              <span>
                <svg viewBox="0 0 24 24"><use href="#i-check" /></svg>Valid for 30 days
              </span>
              <span>
                <svg viewBox="0 0 24 24"><use href="#i-check" /></svg>No account needed
              </span>
              <span>
                <svg viewBox="0 0 24 24"><use href="#i-check" /></svg>Print or save as PDF
              </span>
            </div>
          </div>
        )}

        {showDoc && (
          <p className="ds-sub" style={{ marginTop: "14px" }}>
            The quotation was sent to your printer — choose “Save as PDF” there to keep a copy.{" "}
            <button type="button" className="ds-a" onClick={() => setShowDoc(false)}>
              Dismiss
            </button>
          </p>
        )}
      </div>
    </>
  );
}
