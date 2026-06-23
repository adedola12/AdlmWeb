import React from "react";
import { useNavigate } from "react-router-dom";

function barColor(pct) {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80) return "bg-amber-400";
  return "bg-gradient-to-r from-adlm-blue-700 to-adlm-blue-500";
}

function textColor(pct) {
  if (pct >= 100) return "text-rose-600 dark:text-rose-400";
  if (pct >= 80) return "text-amber-600 dark:text-amber-400";
  return "text-slate-600 dark:text-adlm-dark-muted";
}

/**
 * StorageBar — shows X of Y projects used for a product.
 *
 * Props:
 *   used       {number}  projects used
 *   limit      {number}  project cap for this product
 *   productKey {string}  e.g. "revit"
 *   compact    {boolean} smaller layout for dashboard cards
 *   className  {string}
 */
export default function StorageBar({
  used = 0,
  limit = 30,
  productKey = "",
  compact = false,
  className = "",
}) {
  const navigate = useNavigate();
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = used >= limit;

  const barCls = barColor(pct);
  const txtCls = textColor(pct);

  if (compact) {
    return (
      <div className={`space-y-1 ${className}`}>
        <div className="flex items-center justify-between text-[11px]">
          <span className={`font-medium ${txtCls}`}>
            {used}/{limit} projects
          </span>
          {atLimit ? (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/purchase?addon=storage-slots&for=${productKey}&return=/projects/${productKey}`,
                )
              }
              className="text-[10px] font-semibold text-adlm-blue-700 hover:underline dark:text-adlm-blue-300"
            >
              Buy more
            </button>
          ) : (
            <span className="text-slate-400 dark:text-adlm-dark-dim text-[10px]">
              {pct}%
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${barCls}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-white dark:bg-adlm-dark-panel border-slate-200 dark:border-adlm-dark-border p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-semibold text-slate-800 dark:text-white">
            Cloud Storage
          </span>
          <span className={`ml-2 text-sm ${txtCls}`}>
            {used} of {limit} projects
          </span>
        </div>
        {atLimit ? (
          <button
            type="button"
            onClick={() =>
              navigate(
                `/purchase?addon=storage-slots&for=${productKey}&return=/projects/${productKey}`,
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adlm-blue-700 text-white text-xs font-semibold hover:bg-[#0050c8] transition"
          >
            Buy more storage
          </button>
        ) : pct >= 80 ? (
          <button
            type="button"
            onClick={() =>
              navigate(
                `/purchase?addon=storage-slots&for=${productKey}&return=/projects/${productKey}`,
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition"
          >
            Upgrade storage
          </button>
        ) : null}
      </div>

      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${barCls}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {atLimit ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          Limit reached. Delete a project or purchase additional storage slots to create new projects.
        </p>
      ) : pct >= 80 ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          You&rsquo;re using {pct}% of your storage. Consider upgrading before reaching the limit.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400 dark:text-adlm-dark-dim">
          {limit - used} project slot{limit - used === 1 ? "" : "s"} remaining
        </p>
      )}
    </div>
  );
}
