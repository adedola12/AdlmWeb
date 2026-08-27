// One project: the priced bill, and the items that are not priced yet.
//
// A new route rather than a replacement. /projects/:tool is nearly 6,000 lines
// and is where the work is done — editing, valuing, exporting, the plugin
// round-trip. This is the read: what the project comes to, what is in the
// bill, and which lines are still carrying nothing. Both are reachable and
// this one links to that one for anything that changes data.
//
// The split that makes the screen worth having is priced against unpriced. A
// project total is only as true as its emptiest line, and a bill with forty
// lines at zero looks identical to a finished one until somebody adds it up.
// The rollup already counts items; nothing has ever said which of them have a
// rate.
//
// The other thing it does that nothing else does: appliedRateKey on a bill
// line records the RateGen description that priced it, so a line can be
// followed to the build-up behind it. Measure, price, defend — this is the
// last of those three, and it was already in the data.
//
// His markup: .wk-head / .wk-panel / .wk-ph / .wk-tbl.wk-tbl-mat with .wk-hd
// and a .wk-row per line, and .dsh-stats for the figures.

import React from "react";
import { Link, useParams } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const money2 = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const qty = (n) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
};

const lineAmount = (it) => (Number(it.qty) || 0) * (Number(it.rate) || 0);

export default function DsWorkProject() {
  const { productKey, id } = useParams();
  const { accessToken } = useAuth();
  const [project, setProject] = React.useState(null);
  const [rates, setRates] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [showUnpriced, setShowUnpriced] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed(`/projects/${productKey}/${id}`, { token: accessToken })
      .then((d) => alive && setProject(d))
      .catch(() => alive && setFailed(true));

    // Only so a bill line can be followed to the rate that priced it. A
    // failure here costs the links, not the bill.
    apiAuthed("/rategen-v2/library/rates/sync", {
      token: accessToken,
      params: { limit: 500 },
    })
      .then((d) => alive && setRates(Array.isArray(d.items) ? d.items : []))
      .catch(() => alive && setRates([]));

    return () => {
      alive = false;
    };
  }, [accessToken, productKey, id]);

  // description -> rate id, so appliedRateKey can become a link.
  const rateByKey = React.useMemo(() => {
    const m = new Map();
    for (const r of rates || []) {
      const k = String(r.description || "").trim().toLowerCase();
      if (k && !m.has(k)) m.set(k, r.id);
    }
    return m;
  }, [rates]);

  const view = React.useMemo(() => {
    if (!project) return null;
    const items = Array.isArray(project.items) ? project.items : [];

    const priced = items.filter((it) => (Number(it.rate) || 0) > 0);
    const unpriced = items.filter((it) => !((Number(it.rate) || 0) > 0));

    const total = priced.reduce((n, it) => n + lineAmount(it), 0);
    const completed = priced.reduce(
      (n, it) => n + lineAmount(it) * ((Number(it.percentComplete) || 0) / 100),
      0,
    );

    // Grouped the way a bill is read: by trade, then by the order the plugin
    // sent them.
    const groups = new Map();
    for (const it of priced) {
      const g = it.trade || it.category || it.discipline || "Unclassified";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }

    return {
      items,
      priced,
      unpriced,
      total,
      completed,
      groups: [...groups.entries()].map(([name, list]) => ({
        name,
        list,
        total: list.reduce((n, it) => n + lineAmount(it), 0),
      })),
    };
  }, [project]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="wk-back">
          <Link to="/work/projects">← Projects</Link>
        </p>
        <p className="sub">
          That project could not be loaded. It may belong to another account, or the licence
          that covers it may have lapsed.
        </p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading the project…</p>
      </div>
    );
  }

  const rateLink = (it) => {
    const key = String(it.appliedRateKey || "").trim().toLowerCase();
    return key ? rateByKey.get(key) : null;
  };

  const line = (it, i) => {
    const to = rateLink(it);
    const inner = (
      <>
        <span className="wk-nm">
          <b>{it.materialName || it.description || it.code || `Line ${it.sn || i + 1}`}</b>
          <span>
            {[it.code, it.trade || it.category, it.level]
              .filter(Boolean)
              .join(" · ")}
            {to ? " · priced from the library" : ""}
          </span>
        </span>
        <span className="wk-u">
          {qty(it.qty)}
          <i>{it.unit || ""}</i>
        </span>
        <span className="wk-r">{money2(it.rate)}</span>
        <span className="wk-w">{money(lineAmount(it))}</span>
      </>
    );

    return to ? (
      <Link className="wk-row" role="row" to={`/work/rate/${to}`} key={i}>
        {inner}
      </Link>
    ) : (
      <div className="wk-row" role="row" key={i}>
        {inner}
      </div>
    );
  };

  return (
    <div className="dsh-in">
      <p className="wk-back">
        <Link to="/work/projects">← Projects</Link>
      </p>

      <div className="wk-head">
        <div>
          <h1>{project.name || "Project"}</h1>
          <p className="wk-ref">
            {[
              PRODUCT[productKey] || productKey,
              project.version ? `v${project.version}` : null,
              `${num(view.items.length)} line${view.items.length === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="wk-acts">
          <Link className="ds-btn btn-p ds-btn-sm" to={`/projects/${productKey}`}>
            Open in {PRODUCT[productKey] || productKey}
          </Link>
        </div>
      </div>

      <div className="dsh-stats">
        <div className="dsh-stat">
          <span className="k">Bill total</span>
          <b>{money(view.total)}</b>
          <span className="sub">
            {num(view.priced.length)} priced line{view.priced.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="dsh-stat">
          <span className="k">Completed to date</span>
          <b>{money(view.completed)}</b>
          <span className="sub">
            {view.total
              ? `${Math.round((view.completed / view.total) * 100)}% of the bill`
              : "nothing measured yet"}
          </span>
        </div>
        <div className="dsh-stat">
          <span className="k">Outstanding</span>
          <b>{money(view.total - view.completed)}</b>
          <span className="sub">still to do at these rates</span>
        </div>
        <div className={`dsh-stat${view.unpriced.length ? " warn" : ""}`}>
          <span className="k">Not priced</span>
          <b>{num(view.unpriced.length)}</b>
          <span className="sub">
            {view.unpriced.length
              ? "carrying nothing in the total"
              : "every line has a rate"}
          </span>
        </div>
      </div>

      {view.unpriced.length > 0 && (
        <section className="wk-panel">
          <div className="wk-ph">
            <h2>Not priced yet</h2>
            <button
              type="button"
              className="more"
              onClick={() => setShowUnpriced((v) => !v)}
              style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}
            >
              {showUnpriced ? "Hide" : `Show ${view.unpriced.length}`}
            </button>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.65 }}>
              {num(view.unpriced.length)} line{view.unpriced.length === 1 ? "" : "s"} carry no
              rate, so {view.unpriced.length === 1 ? "it contributes" : "they contribute"} nothing
              to the {money(view.total)} above. A bill of forty empty lines adds up to the same
              number as a finished one, which is the reason this is called out rather than left
              to be noticed.
            </p>
          </div>

          {showUnpriced && (
            <div className="wk-tbl wk-tbl-mat" role="table">
              <div className="wk-hd" role="row">
                <span>Item</span>
                <span>Quantity</span>
                <span>Rate</span>
                <span>Amount</span>
              </div>
              {view.unpriced.map((it, i) => (
                <div className="wk-row" role="row" key={i}>
                  <span className="wk-nm">
                    <b>{it.materialName || it.code || `Line ${it.sn || i + 1}`}</b>
                    <span>{[it.code, it.trade || it.category].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="wk-u">
                    {qty(it.qty)}
                    <i>{it.unit || ""}</i>
                  </span>
                  <span className="wk-r">
                    <em className="wk-none">no rate</em>
                  </span>
                  <span className="wk-w">—</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {view.groups.length ? (
        view.groups.map((g) => (
          <section className="wk-panel" key={g.name}>
            <div className="wk-ph">
              <h2>{g.name}</h2>
              <span className="wk-locnote">
                {num(g.list.length)} line{g.list.length === 1 ? "" : "s"} · {money(g.total)}
              </span>
            </div>
            <div className="wk-tbl wk-tbl-mat" role="table">
              <div className="wk-hd" role="row">
                <span>Item</span>
                <span>Quantity</span>
                <span>Rate</span>
                <span>Amount</span>
              </div>
              {g.list.map(line)}
            </div>
          </section>
        ))
      ) : (
        <section className="wk-panel">
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
              Nothing in this project carries a rate yet, so there is no bill to show. Price it
              in {PRODUCT[productKey] || productKey} and it appears here.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
