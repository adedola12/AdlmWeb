import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../../http";

// His note tones: orange for a problem, light blue for a result.
const NOTE_WARN = {
  margin: 0,
  background: "var(--pal-orange-wash)",
  color: "var(--pal-orange-key)",
  borderColor: "var(--pal-orange-line)",
};
const NOTE_GOOD = {
  margin: 0,
  background: "var(--pal-light-wash)",
  color: "var(--pal-light-key)",
  borderColor: "var(--pal-light-line)",
};

/**
 * Services pricing panel (web MEP Budget view, v1).
 *
 * One click prices every services bill line from RateGen: the server resolves
 * material + labour rates, applies the per-type Constants (standard length →
 * bundles/Nr, connectors, fittings) via the shared serviceCompute engine,
 * writes the build-up as budgetItems, and derives each bill line's rate. The
 * project total (and the linked MEP total on an architectural project) then
 * show real money — with no plugin release.
 */
export default function ServicesPricingPanel({
  productKey = "",
  projectId = "",
  accessToken = "",
  access = { canEdit: true, canSeeRates: true },
  onChange,
}) {
  const canEdit = access?.canEdit !== false;
  const canSeeRates = access?.canSeeRates !== false;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);

  async function priceAll() {
    setBusy(true);
    setError("");
    try {
      const updated = await apiAuthed(
        `/projects/${productKey}/${projectId}/services/price`,
        { method: "POST", token: accessToken, data: {} },
      );
      setResult(updated?._servicesPriced || { billLinesUpdated: 0, budgetLines: 0 });
      onChange?.(updated);
    } catch (e) {
      setError(e?.message || "Could not price services");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wk-panel" style={{ marginBottom: 0 }}>
      <div className="wk-ph" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2>Price services from RateGen</h2>
          <div className="wk-locnote" style={{ marginTop: 4 }}>
            Builds material + labour rates for every services line from your
            RateGen prices, applying your Constants (standard lengths, connectors
            &amp; fittings), then updates the bill.
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            className="ds-btn ds-btn-sm btn-p"
            style={{ flex: "none" }}
            onClick={priceAll}
            // Pricing re-derives every rate on the bill from the CALLER's
            // RateGen library, so the server refuses it outright for someone
            // who may not see the prices (RATES_MASKED). Say so here rather
            // than offering a button that can only fail.
            disabled={busy || !canSeeRates}
            title={
              canSeeRates
                ? undefined
                : "Rates are hidden on this shared project, so you cannot price it."
            }
          >
            {busy ? "Pricing…" : "Price services"}
          </button>
        )}
      </div>

      <div style={{ padding: "14px 20px 18px", display: "grid", gap: 12 }}>
        <Link
          to="/rategen/services-constants"
          className="wk-locnote"
          style={{ color: "var(--action)" }}
        >
          Edit services constants →
        </Link>

        {error && (
          <p className="mk-note" role="alert" style={NOTE_WARN}>
            {error}
          </p>
        )}
        {result && !error && (
          <p className="mk-note" style={NOTE_GOOD}>
            {/* No "(rates hidden)" branch: a pricing run only ever happens for
                someone who can see rates, because the server refuses every
                other caller and the button above is disabled for them. */}
            Priced {result.billLinesUpdated} bill line
            {result.billLinesUpdated === 1 ? "" : "s"} from {result.budgetLines}{" "}
            build-up line{result.budgetLines === 1 ? "" : "s"}. Open the Bill tab to
            review.
          </p>
        )}
      </div>
    </section>
  );
}
