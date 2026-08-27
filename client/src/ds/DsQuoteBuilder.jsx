// The quotation builder — his page, priced from the live catalogue.
//
// Ported from his assets/js/quote.js. The markup is his, unchanged: .qt-build /
// .panel / .toggle2 / .line / .qty / .amt2 / .qt-form / .qt-panel / .trust.
// The behaviour is the same too — pick quantities, switch billing period, watch
// the summary update, then open the quotation as a real document (adlmDoc.js).
//
// WHAT CHANGED, AND WHY IT MATTERED
// His catalogue was a literal in the script, and it had already drifted from
// what we charge: install was 0 for Revit MEP and CIVIQ, where the catalogue
// says ₦20,000 and ₦40,000. A marketing page being stale is untidy; a
// QUOTATION being stale is a disputed invoice, because the customer has a
// document with our number on it. So every figure here comes from
// GET /products, and the fallbacks are the catalogue's values rather than his.
//
// His one gap is now closed. He leaves on-site training "on enquiry" because a
// static build cannot know the price — but we already hold it: every training
// location is a city and a participant band with a real fee behind it, which
// is exactly the "city and size of the team" his note asks for. It is priced
// here the same way routes/purchase.js prices it, so the quotation cannot
// promise a figure checkout then disagrees with. Same reason VAT is read from
// the setting rather than hardcoded at 7.5%.

import React from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config.js";
import { QRCodeSVG } from "qrcode.react";
import { readCartItems, writeCartItems, readCartMeta, writeCartMeta } from "../lib/cart.js";
import { renderToStaticMarkup } from "react-dom/server";
const DsQuoteDoc = React.lazy(() => import("./DsQuoteDoc.jsx"));

// VAT, as his document renderer applies it.
const VAT = 0.075;

// Quotations kept on this machine.
//
// Ported from the SAVE_KEY half of his quote.js. His copy explains the browser
// storage by saying there is no account yet; on our site there IS an account,
// so the reason is different and the wording says the true one: we have no
// endpoint that stores a draft quotation. /quote/send emails one and the cart
// carries a selection, but nothing persists the working document, so a draft
// belongs to the browser that made it. If a store is ever added, this is the
// only part of the file that changes.
const DRAFT_KEY = "adlm-quotes";
const DRAFT_MAX = 12;

function readDrafts() {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(DRAFT_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    // Corrupt or unavailable storage (private mode, quota, a half-written
    // value) is not worth an error state on a pricing page.
    return [];
  }
}

function writeDrafts(all) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(all.slice(0, DRAFT_MAX)));
  } catch {
    /* nothing to do — the quotation itself still works */
  }
}

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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FMT = {
  NGN: new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
};

// The selection, as URL parameters.
//
// Deliberately NOT the customer's details. The QR on the quotation is a link
// anyone holding the paper can scan, so what it carries has to be safe to hand
// around: the products, the billing period, the currency and the training
// class. The organisation, contact, email, mobile and address stay on the
// device that typed them — a printed quotation with somebody's phone number
// encoded into a scannable square is a leak, not a convenience.
function readSelection(search) {
  const p = new URLSearchParams(search);
  const qty = {};
  (p.get("q") || "").split(",").forEach((pair) => {
    const [k, n] = pair.split(":");
    const v = Number(n);
    if (k && Number.isFinite(v) && v > 0) qty[k] = Math.min(v, 999);
  });
  return {
    qty,
    bill: p.get("b") === "monthly" ? "monthly" : "yearly",
    cur: p.get("c") === "USD" ? "USD" : "NGN",
    siteId: /^[a-f0-9]{24}$/i.test(p.get("t") || "") ? p.get("t") : "",
    bimInstall: p.get("bim") === "1",
  };
}

function selectionQuery({ qty, bill, cur, siteId, bimInstall }) {
  const p = new URLSearchParams();
  const items = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
  if (items) p.set("q", items);
  p.set("b", bill);
  p.set("c", cur);
  if (siteId) p.set("t", siteId);
  if (bimInstall) p.set("bim", "1");
  return p.toString();
}

export default function DsQuoteBuilder() {
  // Read once, at first render, so a scanned link opens on the same selection.
  const initial = React.useMemo(
    () => readSelection(typeof window === "undefined" ? "" : window.location.search),
    [],
  );
  const [prices, setPrices] = React.useState(null);
  const [qty, setQty] = React.useState(initial.qty);
  const [bill, setBill] = React.useState(initial.bill);
  const [cur, setCur] = React.useState(initial.cur);
  const [firm, setFirm] = React.useState({ org: "", person: "", email: "", phone: "", addr: "" });
  const [showDoc, setShowDoc] = React.useState(false);
  const navigate = useNavigate();

  // On-site training. His build leaves this "On enquiry" — the note says it is
  // quoted once we know the city and the size of the team, which is exactly
  // what the training-location table already records: every row is a city and
  // a participant band with a real price behind it. So it can be quoted here.
  const [sites, setSites] = React.useState([]);
  const [siteId, setSiteId] = React.useState(initial.siteId);
  const [bimInstall, setBimInstall] = React.useState(initial.bimInstall);

  // VAT is a setting, not a constant. Checkout reads it from the same place
  // before it charges, so the quotation has to as well or the two disagree.
  const [vatRate, setVatRate] = React.useState(VAT);

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

  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/training-locations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && Array.isArray(d?.locations) && setSites(d.locations))
      .catch(() => {});
    fetch(`${API_BASE}/settings/vat`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!alive || !v) return;
        // applyToQuotes can be off on its own, in which case a quotation shows
        // no VAT line even though purchases carry one.
        setVatRate(v.enabled && v.applyToQuotes ? Number(v.percent || 0) / 100 : 0);
      })
      .catch(() => {});
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
        desc: `${p.name} licence, ${p.sub} (${bill === "yearly" ? "yearly" : "monthly"})`,
        qty: n, unit: "PC", rate: unit, amount: unit * n,
      });
      const fee = inCur(price, "install");
      if (fee) {
        install += fee * n;
        rows.push({
          desc: `${p.name} installation: one-time setup in your CAD environment`,
          qty: n, unit: "PC", rate: fee, amount: fee * n,
        });
      }
    }

    for (const t of TRAINING) {
      const id = t.key || t.id;
      const n = qty[id] || 0;
      if (!n) continue;
      // On-site training has no catalogue row; it is priced off the chosen
      // location below, so the tile itself contributes nothing here.
      if (!t.key) continue;
      const unit = inCur(priceOf(t.key), "yr");
      licences += unit * n;
      rows.push({ desc: `${t.name}, ${t.sub}`, qty: n, unit: "seat", rate: unit, amount: unit * n });
    }

    // On-site training, priced exactly the way routes/purchase.js prices it:
    // a flat fee for the chosen location — the participant band is part of the
    // location row, which is how "number of users" is already modelled — plus
    // the optional BIM install. Quoting it any other way would put a number on
    // the quotation that checkout then disagrees with.
    const site = sites.find((l) => String(l._id) === siteId) || null;
    let onsite = 0;
    if (site) {
      const fee =
        cur === "USD" ? Number(site.trainingCostUSD || 0) : Number(site.trainingCostNGN || 0);
      const bim = bimInstall
        ? cur === "USD"
          ? Number(site.bimInstallCostUSD || 0)
          : Number(site.bimInstallCostNGN || 0)
        : 0;
      onsite = fee + bim;
      const days = site.durationDays || 1;
      if (fee > 0) {
        rows.push({
          desc: `On-site training, ${site.name} · ${days} day${days === 1 ? "" : "s"}`,
          qty: 1,
          unit: "class",
          rate: fee,
          amount: fee,
        });
      } else {
        // A location with no price in this currency is not a free class — the
        // USD columns are mostly unset, so it goes on enquiry rather than nil.
        enquiry += 1;
        rows.push({
          desc: `On-site training, ${site.name} · ${days} day${days === 1 ? "" : "s"}`,
          qty: 1,
          unit: "class",
          rate: null,
          amount: null,
        });
      }
      if (bim > 0) {
        rows.push({
          desc: "BIM install. Set-up of the CAD environment on site",
          qty: 1,
          unit: "visit",
          rate: bim,
          amount: bim,
        });
      }
    }

    const net = licences + install + onsite;
    // Naira is quoted whole; dollars are not. Rounding both to whole units
    // made $128.76 carry $10.00 of VAT instead of $9.66 — and routes/purchase.js
    // uses round2 for USD, so the cart would have disagreed with the paper.
    const round = (x) =>
      cur === "USD" ? Math.round((x + Number.EPSILON) * 100) / 100 : Math.round(x);
    const vat = round(net * vatRate);
    return { rows, licences, install, net, vat, total: round(net + vat), enquiry };
  }, [qty, bill, priceOf, inCur, sites, siteId, bimInstall, cur, vatRate]);

  const picked = calc.rows.length > 0;

  // Kept quotations. His feature, his shape: the selection, the firm, the
  // currency and enough of the total to show a row without recomputing it.
  const [drafts, setDrafts] = React.useState(() => readDrafts());

  const keepDraft = React.useCallback(() => {
    if (!picked) return;
    const stamp = new Date();
    const rec = {
      // His number, which is the date plus the last four of the total — enough
      // to tell two quotations made the same day apart.
      number: `ADLM-${stamp.toISOString().slice(0, 10).replace(/-/g, "")}-${String(
        Math.round(calc.total),
      ).slice(-4)}`,
      made: stamp.toISOString(),
      bill,
      cur,
      qty: { ...qty },
      siteId,
      bimInstall,
      firm: { ...firm },
      total: calc.total,
      count: calc.rows.length,
    };
    setDrafts((prev) => {
      const all = [rec, ...prev.filter((r) => r.number !== rec.number)];
      writeDrafts(all);
      return all.slice(0, DRAFT_MAX);
    });
  }, [picked, calc, bill, cur, qty, siteId, bimInstall, firm]);

  const dropDraft = React.useCallback((number) => {
    setDrafts((prev) => {
      const all = prev.filter((r) => r.number !== number);
      writeDrafts(all);
      return all;
    });
  }, []);

  const openDraft = React.useCallback((rec) => {
    setQty({ ...rec.qty });
    setBill(rec.bill);
    setCur(rec.cur || "NGN");
    setSiteId(rec.siteId ?? "");
    setBimInstall(!!rec.bimInstall);
    setFirm({ org: "", person: "", email: "", phone: "", addr: "", ...(rec.firm || {}) });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // "Buy these now" has to carry the selection across.
  //
  // It was a plain link to /purchase, which is why the cart looked empty on
  // the other side: picking six products in the builder wrote nothing
  // anywhere, so checkout read an untouched cart and said so. The quotation
  // and the cart were two separate ideas of what the customer wanted.
  //
  // The shape is the cart's own — { productKey, qty, seats, firstTime } —
  // because Purchase.jsx reads `periods ?? qty` for the billing periods and
  // `seats` for the PCs. In this builder the stepper counts PCs, so it is
  // seats that carries it and the period count stays one.
  const buyThese = React.useCallback(() => {
    const picks = Object.entries(qty).filter(([, n]) => n > 0);
    if (!picks.length) return;

    // Yearly is TWELVE periods, not one.
    //
    // Every product in the catalogue is billingInterval "monthly", and both
    // the server and the purchase page price a monthly product in tiers:
    // periods < 6 is monthly x n, periods === 12 uses the yearly figure. So a
    // yearly quotation written as periods 1 would be charged as a single
    // month — QUIV at ₦50,000 against a quotation that says ₦500,000, and a
    // licence lasting a month instead of a year.
    const periods = bill === "yearly" ? 12 : 1;

    // Merge rather than overwrite: a cart filled from /products should not be
    // silently discarded because someone also priced something here.
    const existing = readCartItems();
    const byKey = new Map(existing.map((it) => [String(it.productKey), it]));
    for (const [key, seats] of picks) {
      byKey.set(key, {
        ...(byKey.get(key) || {}),
        productKey: key,
        qty: periods,
        periods,
        seats,
        // The quotation charges the installation fee on every product that
        // has one, so the cart has to agree or the totals diverge.
        firstTime: true,
      });
    }
    writeCartItems([...byKey.values()]);

    // Everything else the quotation decided, so the payment page does not ask
    // again. cartMeta already carries licenseType and org for the purchase
    // page; currency and the on-site training class are added alongside.
    writeCartMeta({
      ...readCartMeta(),
      currency: cur,
      billing: bill,
      licenseType: firm.org ? "organization" : "personal",
      org: firm.org
        ? { name: firm.org, email: firm.email || "", phone: firm.phone || "" }
        : { name: "", email: "", phone: "" },
      training: siteId ? { locationId: siteId, bimInstall } : null,
    });

    // Straight to payment. The selection IS the cart step — asking someone to
    // pick the same six products again on the way to paying for them is the
    // thing this button exists to avoid.
    //
    // Resolved from where the builder is running rather than hardcoded, for
    // the same reason as the QR: while the redesign is staged its checkout
    // lives at /preview/checkout, and /checkout is not a route yet. On the
    // real site the working payment page is /purchase.
    const staged = window.location.pathname.startsWith("/preview/");
    navigate(staged ? "/preview/checkout" : "/purchase");
  }, [qty, bill, cur, siteId, bimInstall, firm, navigate]);

  // The QR that goes on the signature line. It points at /quote carrying the
  // same selection, so scanning the printed page reopens the quotation with
  // every line already picked — which is what makes the paper actionable
  // rather than a dead end.
  //
  // Rendered to a string because the document engine builds HTML, not React,
  // and pagination re-creates the foot row from markup — a portal into it
  // would not survive that.
  const quoteUrl = React.useMemo(() => {
    const query = selectionQuery({ qty, bill, cur, siteId, bimInstall });
    if (typeof window === "undefined") return "https://adlmstudio.net/quote";
    // The builder's own path, not a hardcoded /quote. Today /quote still serves
    // the previous quotation page, which knows nothing about these parameters,
    // so a QR pointing there would scan to a page that ignores the selection.
    // Using the current path means the code works while this is staged under
    // /preview and keeps working, without an edit, the day it is promoted onto
    // /quote for real.
    const path = window.location.pathname.replace(/\/+$/, "") || "/quote";
    return `${window.location.origin}${path}${query ? `?${query}` : ""}`;
  }, [qty, bill, cur, siteId, bimInstall]);

  const qrSvg = React.useMemo(
    () =>
      renderToStaticMarkup(
        <QRCodeSVG value={quoteUrl} size={128} level="M" marginSize={0} bgColor="#ffffff" fgColor="#091E39" />,
      ),
    [quoteUrl],
  );

  // His spec(), reproduced. The document is the deliverable — a procurement
  // file needs the full description, the unit, the rate and the amount, which
  // is why the summary panel truncates at the em-dash and this does not.
  const docSpec = React.useMemo(() => {
    const today = new Date();
    const until = new Date(today.getTime() + 30 * 864e5);
    const longDate = (d) =>
      `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const isoDate = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // QUO- is not in his engine's prefix table and he built the number in the
    // page rather than the engine, noting it as an ask. Same here.
    const number = `QUO-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    const to = [];
    if (firm.org) to.push(`${firm.org},`);
    if (firm.person) to.push(`${firm.person},`);
    if (firm.addr) {
      firm.addr.split(/\n|,\s*/).forEach((l) => {
        if (l.trim()) to.push(l.trim());
      });
    }
    if (firm.email) to.push(firm.email);
    if (firm.phone) to.push(firm.phone);
    const addressee = to.length ? to : ["To be confirmed"];

    const rows = calc.rows.map((r, i) => ({
      cells: [
        `${i + 1}.`,
        r.desc,
        r.qty,
        r.unit,
        r.rate == null ? "On enquiry" : money(r.rate),
        r.amount == null ? "On enquiry" : money(r.amount),
      ],
      unpriced: r.amount == null,
    }));

    const totalRows = [
      ["Subtotal", money(calc.net), "quiet"],
      ...(vatRate > 0
        ? [[`VAT · ${(vatRate * 100).toFixed(1).replace(/\.0$/, "")}%`, money(calc.vat), "quiet"]]
        : []),
      ["Total", money(calc.total)],
    ];
    if (calc.enquiry) {
      totalRows.push([
        "Items on enquiry",
        `${calc.enquiry} line${calc.enquiry > 1 ? "s" : ""}`,
        "quiet",
      ]);
    }

    const terms = [
      "Valid for 30 days from the date above.",
      bill === "yearly"
        ? "Yearly licences are billed once and run for twelve months from activation."
        : "Monthly licences are billed on the same day each month and can be cancelled at any time.",
      "Licences are per PC and are assigned from your ADLM account.",
      "Installation fees are charged once, per PC, at first setup.",
    ];
    if (calc.enquiry) {
      terms.push("Lines marked on enquiry are quoted separately and are not in the total.");
    }

    return {
      template: "invoice",
      title: "Quotation",
      number,
      date: isoDate(today),
      to: addressee,
      toLabel: "QUOTATION FOR:",
      meta: [
        `Valid until ${longDate(until)}`,
        bill === "yearly" ? "Billed yearly" : "Billed monthly",
        `Priced in ${cur}`,
      ],
      metaLabel: "TERMS:",
      blocks: [
        {
          type: "table",
          columns: [
            { label: "S/N", align: "right", width: "7%" },
            { label: "DESCRIPTION", align: "left", width: "46%" },
            { label: "QTY.", align: "right", width: "9%" },
            { label: "UNIT", width: "9%" },
            { label: "RATE", align: "right", width: "14.5%" },
            { label: "AMOUNT", align: "right", width: "14.5%" },
          ],
          rows,
        },
        { type: "totals", rows: totalRows },
        { type: "heading", level: 2, text: "Terms" },
        { type: "bullets", items: terms },
        { type: "payment" },
        {
          type: "signature",
          label: "For ADLM Studio",
          qr: qrSvg,
          qrCaption: "Scan to open this quotation",
        },
      ],
    };
  }, [calc, firm, bill, cur, money, vatRate, qrSvg]);

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
                <option value="NGN">NGN · Nigerian naira</option>
                <option value="USD">USD · US dollar</option>
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
            Courses are per seat, per year. On-site training is priced by city and team size, and
            the class runs for the number of days shown.
          </p>
          <div id="qt-train">
            {TRAINING.map((t) => {
              const id = t.key || t.id;

              // On-site training is not a counter — it is a city and a team
              // size, which together name a row in the training-location
              // table. His tile shape is kept; what sits inside it is a pair
              // of selects instead of the +/- stepper.
              if (!t.key) {
                const site = sites.find((l) => String(l._id) === siteId) || null;
                const fee = site
                  ? cur === "USD"
                    ? Number(site.trainingCostUSD || 0)
                    : Number(site.trainingCostNGN || 0)
                  : 0;
                const bim = site
                  ? cur === "USD"
                    ? Number(site.bimInstallCostUSD || 0)
                    : Number(site.bimInstallCostNGN || 0)
                  : 0;
                return (
                  <div className={site ? "line" : "line line-off"} key={id}>
                    {/* His .line is a three-column grid: 60px, 1fr, auto: 
                        and .qt-dot is what occupies the first column on a
                        training row, where a product row has its icon. Leaving
                        it out did not just lose the glyph: the text block moved
                        into the 60px column and every label wrapped one word
                        per line. */}
                    <span className="qt-dot">
                      <svg viewBox="0 0 24 24"><use href="#i-play" /></svg>
                    </span>
                    <div>
                      <b>{t.name}</b>
                      <span>An ADLM instructor at your office</span>
                      <div className="qt-site">
                        <select
                          value={siteId}
                          onChange={(e) => setSiteId(e.target.value)}
                          aria-label="Where, and how many people"
                        >
                          <option value="">Choose a city and team size</option>
                          {sites.map((l) => (
                            <option key={l._id} value={l._id}>
                              {l.name}
                              {l.durationDays ? ` · ${l.durationDays} days` : ""}
                            </option>
                          ))}
                        </select>
                        {site && bim > 0 && (
                          <label className="qt-bim">
                            <input
                              type="checkbox"
                              checked={bimInstall}
                              onChange={(e) => setBimInstall(e.target.checked)}
                            />
                            Set up the CAD environment on site (+{money(bim)})
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="amt2">
                      <span>
                        {!site ? "On enquiry" : fee > 0 ? money(fee + (bimInstall ? bim : 0)) : "On enquiry"}
                      </span>
                      <small>
                        {!site
                          ? "Pick the city and the size of the team"
                          : fee > 0
                            ? `${site.city} · ${site.durationDays || 1} days, one class`
                            : "Not priced in this currency yet"}
                      </small>
                    </div>
                  </div>
                );
              }

              const n = qty[id] || 0;
              const unit = inCur(priceOf(t.key), "yr");
              return (
                <div className={n ? "line" : "line line-off"} key={id}>
                  <span className="qt-dot">
                    <svg viewBox="0 0 24 24"><use href="#i-play" /></svg>
                  </span>
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
              <input type="text" autoComplete="organization" placeholder="Your firm’s name"
                value={firm.org} onChange={(e) => setFirm({ ...firm, org: e.target.value })} />
            </label>
            <label>
              Contact
              <input type="text" autoComplete="name" placeholder="Name of the person to address it to"
                value={firm.person} onChange={(e) => setFirm({ ...firm, person: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" autoComplete="email" placeholder="you@firm.com"
                value={firm.email} onChange={(e) => setFirm({ ...firm, email: e.target.value })} />
            </label>
            <label>
              Mobile
              <input type="tel" autoComplete="tel" inputMode="tel" placeholder="0801 234 5678"
                value={firm.phone} onChange={(e) => setFirm({ ...firm, phone: e.target.value })} />
            </label>
            <label className="wide">
              Address
              <textarea rows="2" placeholder="Street, area, city"
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
              {/* His markup exactly: one .sumrow per line, the quantity
                  inline in <i class="qt-q">, and the description truncated at
                  the em-dash. That truncation is the whole point, the row
                  description carries the full "QUIV licence, 3D takeoff ·
                  Autodesk Revit (yearly)" for the printed quotation, but the
                  summary panel shows only "QUIV licence × 1". Rendering the
                  long form here, in a two-column table meant for the compare
                  grid, wrapped every line into a five-line block. */}
              {calc.rows.map((r) => (
                <div className="sumrow" key={r.desc}>
                  <span>
                    {r.desc.split(" — ")[0]}
                    <i className="qt-q"> × {r.qty}</i>
                  </span>
                  <b>
                    {r.amount == null ? (
                      <em className="qt-none">On enquiry</em>
                    ) : (
                      money(r.amount)
                    )}
                  </b>
                </div>
              ))}
              <div className="qt-hr" />
              <div className="sumrow">
                <span>Subtotal</span>
                <b>{money(calc.net)}</b>
              </div>
              <div className="sumrow">
                <span>VAT · 7.5%</span>
                <b>{money(calc.vat)}</b>
              </div>
              <div className="sumrow qt-big">
                <span>Total</span>
                <b>{money(calc.total)}</b>
              </div>
              {calc.enquiry > 0 && (
                <p className="qt-note">
                  On-site training is quoted once we know the city and the size of the team, so it
                  is listed on the quotation without an amount.
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
              onClick={() => setShowDoc(true)}
            >
              See the quotation
            </button>
            <button
              type="button"
              className="ds-btn btn-o btn-full"
              style={{ marginTop: "10px" }}
              onClick={buyThese}
            >
              Buy these now
            </button>
            <button
              type="button"
              className="ds-btn btn-o btn-full"
              style={{ marginTop: "10px" }}
              onClick={keepDraft}
            >
              Keep this quotation
            </button>
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

        {drafts.length > 0 && (
          <div id="qt-saved" className="qt-saved">
            <h3>Kept on this machine</h3>
            <p className="sub">
              Quotations you saved here. They live in this browser only: nothing that stores a
              draft against your account exists yet, so clearing your browser data removes them.
              Buying, or emailing yourself the document, is what makes one permanent.
            </p>
            {drafts.map((r) => (
              <div className="qt-saved-row" key={r.number}>
                <div>
                  <b>{r.number}</b>
                  <span>
                    {new Date(r.made).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    {r.count} line{r.count === 1 ? "" : "s"}
                    {r.firm?.org ? ` · ${r.firm.org}` : ""}
                  </span>
                </div>
                <div className="qt-saved-amt">
                  {new Intl.NumberFormat(r.cur === "USD" ? "en-US" : "en-NG", {
                    style: "currency",
                    currency: r.cur || "NGN",
                    maximumFractionDigits: r.cur === "USD" ? 2 : 0,
                  }).format(Number(r.total) || 0)}
                </div>
                <div className="qt-saved-act">
                  <button
                    type="button"
                    className="ds-btn btn-o ds-btn-sm"
                    onClick={() => openDraft(r)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="qt-x"
                    aria-label={`Remove ${r.number}`}
                    onClick={() => dropDraft(r.number)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showDoc && (
          <React.Suspense fallback={null}>
            <DsQuoteDoc spec={docSpec} onClose={() => setShowDoc(false)} />
          </React.Suspense>
        )}
      </div>
    </>
  );
}
