import React from "react";
import { FaCheckSquare, FaRegSquare, FaTimes } from "../../../components/icons.jsx";

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
function palChip(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}

function kindBadgeFor(kind) {
  switch (kind) {
    case "preliminary":
      return { label: "Prelim", style: palChip("deep") };
    case "provisional":
      return { label: "PC sum", style: palChip("grad") };
    case "variation":
      return { label: "Variation", style: palChip("orange") };
    default:
      return null; // measured items get their category chip downstream
  }
}

// His .wk-dd-m surface for the suggestions list.
const POP = {
  borderRadius: 14,
  border: "1px solid var(--line)",
  background: "var(--bg)",
  boxShadow: "0 3px 10px rgba(var(--shadow-c),.08), 0 20px 46px rgba(var(--shadow-c),.20)",
};

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
                className="wk-src sm"
                style={palChip("light")}
              >
                <span className="max-w-[180px] truncate" title={item.description}>
                  {item.description || `Item ${item.sn}`}
                </span>
                {/* Weight input, defaults to 100%. Use this to split a
                    single BoQ line across multiple tasks (e.g. 70% first
                    fix, 30% final fix). Live updates the chip's
                    contribution and the parent's baselineCost. */}
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
                  style={{ border: "1px solid var(--pal-light-line)", background: "var(--bg)" }}
                  title="Weight (%). Share of this BoQ line allocated to the current task. Lower this when other tasks also link to the same line."
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={weight}
                    onChange={(e) => setWeight(item.identity, e.target.value)}
                    className="w-10 bg-transparent text-[10px] font-semibold text-right outline-none p-0"
                    style={{ border: 0, color: "inherit" }}
                  />
                  <span className="text-[10px] opacity-80">%</span>
                </span>
                <span className="text-[10px] opacity-80">
                  ₦{fmtMoney(contribution)}
                  {weight !== 100 ? (
                    <span className="ml-1" style={{ color: "var(--ink-3)" }}>
                      (of ₦{fmtMoney(item.amount)})
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => toggleItem(item.identity)}
                  className="rounded-full p-0.5"
                  style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }}
                  title="Unlink"
                >
                  <FaTimes size={11} />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={clearAll}
            className="wk-locnote self-center"
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Search input */}
      <label className="wk-find" style={{ display: "block" }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use href="#hi-search" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          aria-label="Search BoQ items"
          autoComplete="off"
        />
      </label>

      {/* Suggestions dropdown */}
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto" style={POP}>
          {items.length === 0 ? (
            <div className="wk-empty" style={{ padding: 18 }}>{emptyHint}</div>
          ) : filtered.length === 0 ? (
            <div className="wk-empty" style={{ padding: 18 }}>No matches.</div>
          ) : (
            <>
              {showSelectAll ? (
                <div
                  className="wk-locnote sticky top-0 z-10 flex items-center justify-between px-3 py-2"
                  style={{ background: "var(--bg)", borderBottom: "1px solid var(--line)" }}
                >
                  <span>
                    {filtered.length} item{filtered.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--action)", fontFamily: "inherit" }}
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
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs"
                    style={{
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      cursor: "pointer",
                      color: "var(--ink-2)",
                      background: checked ? "var(--pal-light-wash)" : "transparent",
                    }}
                  >
                    <span className="mt-0.5" style={{ color: checked ? "var(--action)" : "var(--ink-3)" }}>
                      {checked ? <FaCheckSquare size={15} /> : <FaRegSquare size={15} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {kindBadge ? (
                          <span className="wk-src sm" style={kindBadge.style}>
                            {kindBadge.label}
                          </span>
                        ) : null}
                        <span className="truncate" style={{ fontWeight: 500, color: "var(--ink)" }}>
                          {item.description || `Item ${item.sn}`}
                        </span>
                        {item.category && item.kind === "measured" ? (
                          <span className="wk-src sm">
                            {item.category}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
                        <span>#{item.sn}</span>
                        <span>
                          {fmtMoney(item.qty)} {item.unit}
                        </span>
                        <span>@ ₦{fmtMoney(item.rate)}</span>
                        <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>
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

      {/* Live sum hint, weighted across all links. Mentions the
          weights when any are < 100% so the user understands why the
          baseline isn't simply the sum of selected items. */}
      {selectedItems.length > 0 ? (
        (() => {
          const anyDownweighted = selectedItems.some(
            (it) => (weightByIdentity.get(it.identity) ?? 100) !== 100,
          );
          return (
            <div
              className="mk-note"
              style={{ marginTop: 10, background: "var(--pal-light-wash)", color: "var(--pal-light-key)", borderColor: "var(--pal-light-line)" }}
            >
              <b>Linked baseline{anyDownweighted ? " (weighted)" : ""}:</b>{" "}
              ₦{fmtMoney(derivedAmount)} from {selectedItems.length} BoQ item
              {selectedItems.length === 1 ? "" : "s"}
              {anyDownweighted ? (
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
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
