import React from "react";
import { apiAuthed } from "../../http";

/**
 * "Price with my RateGen rates" (GET /projects/:productKey/:id/price-preview).
 *
 * Shows a bill re-priced with the viewer's own RateGen rates for their state,
 * line by line, beside the bill's own rates. Nothing is saved: it was built for
 * the read-only sample projects, so a user can see what RateGen pricing does to a
 * real bill before using it on their own. Lines no rate fits are listed as not
 * priced rather than guessed; a rate found by the work a line measures says what
 * it assumed.
 */
const naira = (n) => (n == null ? "–" : `₦${Math.round(Number(n) || 0).toLocaleString()}`);
const SOURCE = {
  same: "Same item",
  work: "By the work",
  services: "Services pricing",
  none: "Not priced",
};

export default function PricePreviewPanel({ productKey = "", projectId = "", accessToken = "" }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState(null);
  const [showAll, setShowAll] = React.useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      setData(await apiAuthed(`/projects/${productKey}/${projectId}/price-preview`, { token: accessToken }));
    } catch (e) {
      setError(e?.message || "Could not price this bill with your RateGen rates");
    } finally {
      setBusy(false);
    }
  }

  const t = data?.totals;
  const change = t && t.currentOfPriced > 0 ? (t.preview - t.currentOfPriced) / t.currentOfPriced : null;
  const lines = data?.lines || [];
  const shown = showAll ? lines : lines.slice(0, 25);

  return (
    <section className="wk-panel" style={{ marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <b>Price with my RateGen rates</b>
          <p className="wk-fx" style={{ margin: "4px 0 0" }}>
            See this bill priced with your own RateGen rates{data?.state ? ` for ${data.state}` : ""}. Nothing here is saved.
          </p>
        </div>
        <button type="button" className="ds-btn ds-btn-sm" onClick={run} disabled={busy || !projectId}>
          {busy ? "Pricing…" : data ? "Price again" : "Price with my rates"}
        </button>
      </div>

      {error ? <p className="pj-note warn" style={{ margin: "10px 0 0" }}>{error}</p> : null}
      {data?.unsupported ? <p className="pj-note warn" style={{ margin: "10px 0 0" }}>{data.unsupported}</p> : null}

      {t && !data.unsupported ? (
        <>
          <div className="pj-grid" style={{ marginTop: 12 }}>
            <div className="pj-card" style={{ cursor: "default" }}>
              <span className="cl">Bill as priced (lines your rates cover)</span>
              <b className="nm">{naira(t.currentOfPriced)}</b>
            </div>
            <div className="pj-card" style={{ cursor: "default" }}>
              <span className="cl">With your RateGen rates</span>
              <b className="nm">{naira(t.preview)}</b>
              {change != null ? <span className="cl">{`${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`}</span> : null}
            </div>
            <div className="pj-card" style={{ cursor: "default" }}>
              <span className="cl">Lines priced</span>
              <b className="nm">{`${t.pricedLines} of ${t.lines}`}</b>
              <span className="cl">{`${Math.round(t.pricedShare * 100)}% of the bill's cost`}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="w-full text-sm" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Bill rate</th>
                  <th>Your rate</th>
                  <th style={{ textAlign: "left" }}>From</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.key}>
                    <td style={{ textAlign: "left" }}>{l.description}</td>
                    <td>{Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td>{l.unit}</td>
                    <td>{naira(l.currentRate)}</td>
                    <td>{l.newRate == null ? "–" : naira(l.newRate)}</td>
                    <td style={{ textAlign: "left" }} title={[l.from, l.assumed].filter(Boolean).join(" · ")}>
                      {SOURCE[l.source] || l.source}
                      {l.assumed ? " · assumed" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines.length > 25 ? (
            <button type="button" className="ds-btn btn-o ds-btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer lines" : `Show all ${lines.length} lines`}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
