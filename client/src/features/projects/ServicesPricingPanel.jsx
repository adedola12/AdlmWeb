import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../../http";

function money(v) {
  const n = Number(v) || 0;
  return "₦" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

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
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-adlm-dark-text">
            Price services from RateGen
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Builds material + labour rates for every services line from your
            RateGen prices, applying your Constants (standard lengths, connectors
            &amp; fittings), then updates the bill.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn shrink-0"
            onClick={priceAll}
            disabled={busy}
          >
            {busy ? "Pricing…" : "Price services"}
          </button>
        )}
      </div>

      <div className="mt-2">
        <Link
          to="/rategen/services-constants"
          className="text-xs underline text-slate-500 dark:text-slate-400"
        >
          Edit services constants →
        </Link>
      </div>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      {result && !error && (
        <div className="mt-2 text-xs text-green-700 dark:text-green-400">
          Priced {result.billLinesUpdated} bill line
          {result.billLinesUpdated === 1 ? "" : "s"}
          {canSeeRates ? "" : " (rates hidden)"} from {result.budgetLines}{" "}
          build-up line{result.budgetLines === 1 ? "" : "s"}. Open the Bill tab to
          review.
        </div>
      )}
    </div>
  );
}
