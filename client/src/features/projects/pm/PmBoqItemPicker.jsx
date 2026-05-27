import React from "react";
import { FaSearch, FaCheckSquare, FaRegSquare, FaTimes } from "react-icons/fa";

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(value) {
  return safeNum(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Visual label + colour for the picker suggestion badge so users see at a
// glance which BoQ stream they're linking to. Measured items use the
// row's category chip instead (their nature is obvious), so they return
// null here.
function kindBadgeFor(kind) {
  switch (kind) {
    case "preliminary":
      return { label: "Prelim", cls: "bg-purple-100 text-purple-700" };
    case "provisional":
      return { label: "PC sum", cls: "bg-amber-100 text-amber-800" };
    case "variation":
      return { label: "Variation", cls: "bg-rose-100 text-rose-700" };
    default:
      return null; // measured items get their category chip downstream
  }
}

// Searchable multi-select picker for BoQ items.
//
// Behaviour:
//   • User types in the search box → list of items filters live by
//     description / takeoffLine / code / category / trade.
//   • Each suggestion is rendered with a checkbox so the user can select
//     more than one. Clicking the row or the checkbox both toggle.
//   • Selected items show as chips above the search box with a quick × to
//     unselect. The live sum (sum of qty × rate over selections) is shown
//     at the bottom so the user can see the implied baseline cost in
//     real-time.
//
// items prop comes from dashboard.boqItems — each item has
// { identity, sn, description, unit, qty, rate, amount, category, trade, completed }.
//
// value is an array of selected identity strings.
// weights is a parallel array of 0-100 numbers (defaults to 100 each).
//   Lets a single BoQ line be split across multiple tasks: e.g. Task A
//   links to "Windows & Doors" at 70 (first fix), Task B at 30 (final
//   fix). Per-task baseline = Σ item.amount × weight/100.
//
// onChange(nextIdentities, derivedAmount, nextWeights) fires whenever
// the selection OR a weight changes. derivedAmount is the weighted sum
// — i.e. what the parent task's baselineCost should become.
export default function PmBoqItemPicker({
  items = [],
  value = [],
  weights = [],
  onChange,
  placeholder = "Search BoQ items by name, code, category…",
  showSelectAll = true,
  emptyHint = "No BoQ items found. Upload a takeoff in the Bill of Quantity tab first.",
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  const selectedSet = React.useMemo(() => new Set(value || []), [value]);

  // Per-identity weight lookup. Falls back to 100 (full item) when a
  // link has no explicit weight — covers both legacy data and newly
  // added links before the user touches the slider.
  const weightByIdentity = React.useMemo(() => {
    const map = new Map();
    (value || []).forEach((identity, i) => {
      const raw = Number((weights || [])[i]);
      map.set(identity, Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 100);
    });
    return map;
  }, [value, weights]);

  // Picker shows *all* BoQ-side scope: measured items, preliminaries,
  // provisional sums and variations. Linking a task to a prelim or PC
  // sum is the natural way to say "this task is the execution of that
  // allowance" — when the task hits 100%, the server propagates the
  // done flag back to that source row (see updatePm). No double-counting
  // because BAC is computed independently from the BoQ side.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 100); // cap to keep render cheap
    return items
      .filter((item) => {
        const hay = [
          item.description,
          item.takeoffLine,
          item.code,
          item.category,
          item.trade,
          item.unit,
          item.kind,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 100);
  }, [items, query]);

  // Stale identities (e.g. a BoQ row that was deleted after the task was
  // linked) silently drop out — the filter below ignores them. That keeps
  // legacy data from rendering broken chips.
  const selectedItems = React.useMemo(
    () => items.filter((item) => selectedSet.has(item.identity)),
    [items, selectedSet],
  );

  // Weighted derived amount — each selected item contributes
  // amount × weight/100. This is what the task's baselineCost should
  // become so over/under allocation isn't accidentally hidden.
  const derivedAmount = React.useMemo(
    () =>
      selectedItems.reduce(
        (acc, item) =>
          acc + safeNum(item.amount) * (weightByIdentity.get(item.identity) ?? 100) / 100,
        0,
      ),
    [selectedItems, weightByIdentity],
  );

  // Close the suggestion dropdown when the user clicks outside.
  React.useEffect(() => {
    function onClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Compute the weighted derivedAmount and the parallel weights array
  // for any change. Encapsulates the recomputation so toggle / weight
  // edit / clear all share a single source of truth.
  function emit(nextIdentities, nextWeightsByIdentity) {
    const nextWeights = nextIdentities.map((id) => {
      const w = nextWeightsByIdentity.get(id);
      return Number.isFinite(w) ? w : 100;
    });
    const nextAmount = nextIdentities.reduce((acc, id) => {
      const item = items.find((it) => it.identity === id);
      if (!item) return acc;
      const w = nextWeightsByIdentity.get(id);
      const weight = (Number.isFinite(w) ? w : 100) / 100;
      return acc + safeNum(item.amount) * weight;
    }, 0);
    onChange?.(nextIdentities, nextAmount, nextWeights);
  }

  function toggleItem(identity) {
    const next = new Set(selectedSet);
    if (next.has(identity)) next.delete(identity);
    else next.add(identity);
    const nextArr = Array.from(next);
    // Preserve existing weights; new selections default to 100.
    const nextWeights = new Map(weightByIdentity);
    if (!nextWeights.has(identity) && next.has(identity)) {
      nextWeights.set(identity, 100);
    }
    emit(nextArr, nextWeights);
  }

  function setWeight(identity, value) {
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));
    const nextWeights = new Map(weightByIdentity);
    nextWeights.set(identity, clamped);
    emit(Array.from(selectedSet), nextWeights);
  }

  function clearAll() {
    onChange?.([], 0, []);
  }

  function selectAllVisible() {
    const next = new Set(selectedSet);
    for (const item of filtered) next.add(item.identity);
    const nextArr = Array.from(next);
    const nextWeights = new Map(weightByIdentity);
    for (const item of filtered) {
      if (!nextWeights.has(item.identity)) nextWeights.set(item.identity, 100);
    }
    emit(nextArr, nextWeights);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips */}
      {selectedItems.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedItems.map((item) => {
            const weight = weightByIdentity.get(item.identity) ?? 100;
            const contribution = safeNum(item.amount) * weight / 100;
            return (
              <span
                key={item.identity}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-adlm-blue-700 border border-blue-200"
              >
                <span className="max-w-[180px] truncate" title={item.description}>
                  {item.description || `Item ${item.sn}`}
                </span>
                {/* Weight input — defaults to 100%. Use this to split a
                    single BoQ line across multiple tasks (e.g. 70% first
                    fix, 30% final fix). Live updates the chip's
                    contribution and the parent's baselineCost. */}
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5 border border-blue-200/60"
                  title="Weight (%) — share of this BoQ line allocated to the current task. Lower this when other tasks also link to the same line."
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={weight}
                    onChange={(e) => setWeight(item.identity, e.target.value)}
                    className="w-10 bg-transparent text-[10px] font-semibold text-adlm-blue-700 text-right outline-none p-0"
                  />
                  <span className="text-[10px] opacity-80">%</span>
                </span>
                <span className="text-[10px] opacity-80">
                  ₦{fmtMoney(contribution)}
                  {weight !== 100 ? (
                    <span className="ml-1 text-slate-500">
                      (of ₦{fmtMoney(item.amount)})
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => toggleItem(item.identity)}
                  className="rounded-full hover:bg-blue-100 p-0.5"
                  title="Unlink"
                >
                  <FaTimes className="text-[9px]" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-slate-500 hover:text-rose-600 underline self-center"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Search input */}
      <div className="relative">
        <FaSearch className="absolute left-3 top-2.5 text-slate-400 text-xs" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/40 focus:border-adlm-blue-700"
        />
      </div>

      {/* Suggestions dropdown */}
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">{emptyHint}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">No matches.</div>
          ) : (
            <>
              {showSelectAll ? (
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px]">
                  <span className="text-slate-500">
                    {filtered.length} item{filtered.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="font-medium text-adlm-blue-700 hover:underline"
                  >
                    Select all visible
                  </button>
                </div>
              ) : null}
              {filtered.map((item) => {
                const checked = selectedSet.has(item.identity);
                const kindBadge = kindBadgeFor(item.kind);
                return (
                  <button
                    key={item.identity}
                    type="button"
                    onClick={() => toggleItem(item.identity)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition ${
                      checked ? "bg-blue-50/60" : ""
                    }`}
                  >
                    <span className="mt-0.5 text-adlm-blue-700">
                      {checked ? <FaCheckSquare /> : <FaRegSquare className="text-slate-300" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {kindBadge ? (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold ${kindBadge.cls}`}>
                            {kindBadge.label}
                          </span>
                        ) : null}
                        <span className="font-medium text-slate-900 truncate">
                          {item.description || `Item ${item.sn}`}
                        </span>
                        {item.category && item.kind === "measured" ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                            {item.category}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
                        <span>#{item.sn}</span>
                        <span>
                          {fmtMoney(item.qty)} {item.unit}
                        </span>
                        <span>@ ₦{fmtMoney(item.rate)}</span>
                        <span className="font-semibold text-slate-700">
                          = ₦{fmtMoney(item.amount)}
                        </span>
                      </div>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      ) : null}

      {/* Live sum hint — weighted across all links. Mentions the
          weights when any are < 100% so the user understands why the
          baseline isn't simply the sum of selected items. */}
      {selectedItems.length > 0 ? (
        (() => {
          const anyDownweighted = selectedItems.some(
            (it) => (weightByIdentity.get(it.identity) ?? 100) !== 100,
          );
          return (
            <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] text-emerald-800">
              <b>Linked baseline{anyDownweighted ? " (weighted)" : ""}:</b>{" "}
              ₦{fmtMoney(derivedAmount)} from {selectedItems.length} BoQ item
              {selectedItems.length === 1 ? "" : "s"}
              {anyDownweighted ? (
                <div className="mt-0.5 text-[10px] text-emerald-700/80">
                  Tip: when several tasks share a BoQ line, set each task's
                  weight so the totals across all tasks sum to 100%.
                </div>
              ) : null}
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
