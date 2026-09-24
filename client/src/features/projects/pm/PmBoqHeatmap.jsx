import React from "react";
import { FaCheckCircle, FaThLarge } from "../../../components/icons.jsx";

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(value) {
  return safeNum(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Map a percentComplete (0-100) plus the ratified flag to a CSS background
// + text color. Ratified items get the brand colour so they read as
// "signed off" — distinct from a regular 100% that's just sitting at full
// progress without the binary tick.
// The ramp, in his tokens: his ground at 0%, deepening into his action blue
// as work progresses, and his accent (the colour of his full meter) once
// ratified.
const mix = (p) => `color-mix(in srgb, var(--action) ${p}%, var(--bg-alt))`;
const RAMP = {
  ratified: { bg: "var(--accent)", text: "#ffffff", label: "Ratified" },
  none: { bg: "var(--bg-alt)", text: "var(--ink-3)", label: "Not started" },
  started: { bg: mix(18), text: "var(--ink)", label: "Just started" },
  half: { bg: mix(38), text: "var(--ink)", label: "In progress" },
  threeQuarter: { bg: mix(58), text: "var(--action-ink)", label: "Well underway" },
  almost: { bg: mix(78), text: "var(--action-ink)", label: "Almost done" },
  full: { bg: "var(--action)", text: "var(--action-ink)", label: "Done (awaiting sign-off)" },
};

function cellColor(pct, ratified) {
  if (ratified) return RAMP.ratified;
  const p = Math.max(0, Math.min(100, safeNum(pct)));
  if (p === 0) return RAMP.none;
  if (p <= 25) return RAMP.started;
  if (p <= 50) return RAMP.half;
  if (p <= 75) return RAMP.threeQuarter;
  if (p < 100) return RAMP.almost;
  // 100% but not ratified
  return RAMP.full;
}

const GROUP_MODES = [
  { id: "category", label: "By category" },
  { id: "trade", label: "By trade" },
  { id: "none", label: "Linear" },
];

function HeatmapCell({ item, onHover, onLeave }) {
  const ratified = Boolean(item?.completed || item?.purchased);
  const pct = safeNum(item?.percentComplete);
  const { bg, text } = cellColor(pct, ratified);
  return (
    <button
      type="button"
      onMouseEnter={(e) => onHover?.(item, e.currentTarget)}
      onMouseLeave={onLeave}
      onFocus={(e) => onHover?.(item, e.currentTarget)}
      onBlur={onLeave}
      className="relative flex h-9 w-9 items-center justify-center text-[10px] font-semibold transition hover:scale-110 hover:z-10"
      style={{ backgroundColor: bg, color: text, border: "1px solid var(--line)", borderRadius: 8 }}
      aria-label={`${item.description || `Item ${item.sn}`}: ${ratified ? "ratified" : `${pct}% complete`}`}
    >
      {ratified ? (
        <FaCheckCircle size={14} />
      ) : (
        <span className="leading-none">{Math.round(pct)}</span>
      )}
    </button>
  );
}

function Legend() {
  const stops = [
    { color: RAMP.none.bg, label: "0%" },
    { color: RAMP.started.bg, label: "1-25%" },
    { color: RAMP.half.bg, label: "26-50%" },
    { color: RAMP.threeQuarter.bg, label: "51-75%" },
    { color: RAMP.almost.bg, label: "76-99%" },
    { color: RAMP.full.bg, label: "100%" },
    { color: RAMP.ratified.bg, label: "Ratified" },
  ];
  return (
    <div className="wk-locnote flex flex-wrap items-center gap-3">
      {stops.map((stop) => (
        <span key={stop.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3"
            style={{ backgroundColor: stop.color, border: "1px solid var(--line)", borderRadius: 3 }}
          />
          {stop.label}
        </span>
      ))}
    </div>
  );
}

// Floating tooltip: positioned just below the hovered cell, kept inside the
// viewport. The parent passes the anchor element via onHover.
function CellTooltip({ item, anchor, statusLabel }) {
  const [pos, setPos] = React.useState(null);

  React.useEffect(() => {
    if (!anchor || !item) {
      setPos(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = 240;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    const margin = 8;
    if (left < margin) left = margin;
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - tooltipWidth;
    }
    setPos({
      top: rect.bottom + 6,
      left,
      width: tooltipWidth,
    });
  }, [anchor, item]);

  if (!item || !pos) return null;
  const ratified = Boolean(item?.completed || item?.purchased);
  const pct = safeNum(item?.percentComplete);
  const valued = safeNum(item?.amount) * (ratified ? 1 : pct / 100);

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
        padding: 12,
        borderRadius: 14,
        border: "1px solid var(--line)",
        background: "var(--bg)",
        color: "var(--ink)",
        boxShadow: "0 3px 10px rgba(var(--shadow-c),.08), 0 20px 46px rgba(var(--shadow-c),.20)",
      }}
    >
      <div className="text-xs font-semibold text-slate-900 leading-tight break-words">
        {item.description || `Item ${item.sn}`}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
        <span>#{item.sn}</span>
        {item.category ? <span className="wk-src sm">{item.category}</span> : null}
        {item.trade ? <span className="wk-src sm">{item.trade}</span> : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
        <div className="text-slate-500">Qty</div>
        <div className="text-right text-slate-900 font-medium">
          {fmtMoney(item.qty)} {item.unit}
        </div>
        <div className="text-slate-500">Rate</div>
        <div className="text-right text-slate-900 font-medium">₦{fmtMoney(item.rate)}</div>
        <div className="text-slate-500">Line total</div>
        <div className="text-right text-slate-900 font-medium">₦{fmtMoney(item.amount)}</div>
        <div className="text-slate-500">Progress</div>
        <div className="text-right font-semibold" style={{ color: ratified ? "var(--accent)" : pct > 0 ? "var(--action)" : "var(--ink-3)" }}>
          {ratified ? (statusLabel || "Ratified") : `${pct.toFixed(0)}%`}
        </div>
        <div className="text-slate-500">Valued</div>
        <div className="text-right font-semibold" style={{ color: "var(--action)" }}>₦{fmtMoney(valued)}</div>
      </div>
    </div>
  );
}

export default function PmBoqHeatmap({ boqItems = [], statusLabel = "Ratified" }) {
  const [groupMode, setGroupMode] = React.useState("category");
  const [query, setQuery] = React.useState("");
  const [hovered, setHovered] = React.useState(null);

  // Distribution stats — count per band so the user gets a quick
  // numerical companion to the visual grid.
  const stats = React.useMemo(() => {
    const out = { notStarted: 0, started: 0, half: 0, threeQuarter: 0, almost: 0, full: 0, ratified: 0, total: 0 };
    for (const item of boqItems) {
      out.total += 1;
      const ratified = Boolean(item.completed || item.purchased);
      const pct = safeNum(item.percentComplete);
      if (ratified) {
        out.ratified += 1;
        continue;
      }
      if (pct === 0) out.notStarted += 1;
      else if (pct <= 25) out.started += 1;
      else if (pct <= 50) out.half += 1;
      else if (pct <= 75) out.threeQuarter += 1;
      else if (pct < 100) out.almost += 1;
      else out.full += 1;
    }
    return out;
  }, [boqItems]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return boqItems;
    const q = query.toLowerCase();
    return boqItems.filter((item) => {
      const hay = [item.description, item.category, item.trade, item.unit, String(item.sn)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [boqItems, query]);

  const groups = React.useMemo(() => {
    if (groupMode === "none") {
      return [{ key: "all", label: `All items (${filtered.length})`, items: filtered }];
    }
    const field = groupMode === "trade" ? "trade" : "category";
    const map = new Map();
    for (const item of filtered) {
      const key = String(item[field] || "").trim() || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    // Stable ordering: "Uncategorized" last, otherwise alphabetical.
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === "Uncategorized") return 1;
        if (b === "Uncategorized") return -1;
        return a.localeCompare(b);
      })
      .map(([key, items]) => ({ key, label: `${key} (${items.length})`, items }));
  }, [filtered, groupMode]);

  if (!boqItems.length) {
    return (
      <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
        <FaThLarge size={28} style={{ display: "block", margin: "0 auto", color: "var(--ink-3)" }} />
        <b style={{ display: "block", marginTop: 12, fontWeight: 500, color: "var(--ink)" }}>
          No BoQ items to map
        </b>
        <div style={{ marginTop: 4, fontSize: 13 }}>
          Upload a takeoff in the Bill of Quantity tab first. The heatmap will populate automatically.
        </div>
      </div>
    );
  }

  return (
    <section className="wk-panel" style={{ marginBottom: 0 }}>
      {/* Header */}
      <div className="wk-ph" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <h2>BoQ Progress Heatmap</h2>
          <div className="wk-locnote" style={{ marginTop: 4 }}>
            Every BoQ line as a cell: colour shows current progress, hover for detail.
          </div>
        </div>
        <div className="wk-acts" style={{ alignItems: "center" }}>
          <label className="wk-find" style={{ flex: "0 1 220px" }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-search" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter items…"
              aria-label="Filter BoQ items"
              autoComplete="off"
            />
          </label>
          {/* Group toggle */}
          <div className="wk-loc-sw" role="tablist" aria-label="Group heatmap">
            {GROUP_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={groupMode === mode.id}
                onClick={() => setGroupMode(mode.id)}
                className={groupMode === mode.id ? "on" : ""}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 20px 20px" }}>
      {/* Distribution band */}
      <div className="mb-4 grid gap-1.5 text-[11px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))" }}>
        <StatChip tone={RAMP.ratified} label="Ratified" count={stats.ratified} total={stats.total} />
        <StatChip tone={RAMP.full} label="100%" count={stats.full} total={stats.total} />
        <StatChip tone={RAMP.almost} label="76-99%" count={stats.almost} total={stats.total} />
        <StatChip tone={RAMP.threeQuarter} label="51-75%" count={stats.threeQuarter} total={stats.total} />
        <StatChip tone={RAMP.half} label="26-50%" count={stats.half} total={stats.total} />
        <StatChip tone={RAMP.started} label="1-25%" count={stats.started} total={stats.total} />
        <StatChip tone={RAMP.none} label="Not started" count={stats.notStarted} total={stats.total} />
      </div>

      {/* Grid */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            {groupMode !== "none" ? (
              <div className="mb-1.5 flex items-center gap-2">
                <p className="wk-grp" style={{ padding: 0, margin: 0 }}>
                  {group.label}
                </p>
                <div className="h-px flex-1" style={{ background: "var(--line)" }} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {group.items.map((item) => (
                <HeatmapCell
                  key={item.identity || `${item.sn}-${item.description}`}
                  item={item}
                  onHover={(it, el) => setHovered({ item: it, anchor: el })}
                  onLeave={() => setHovered(null)}
                />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 || groups.every((g) => g.items.length === 0) ? (
          <div className="wk-empty">
            No items match “{query}”.
          </div>
        ) : null}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
        <Legend />
      </div>
      </div>

      {/* Floating tooltip */}
      <CellTooltip
        item={hovered?.item}
        anchor={hovered?.anchor}
        statusLabel={statusLabel}
      />
    </section>
  );
}

function StatChip({ tone, label, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div
      className="px-2 py-1.5 flex items-center justify-between"
      style={{ backgroundColor: tone.bg, color: tone.text, border: "1px solid var(--line)", borderRadius: 9 }}
    >
      <span className="font-semibold truncate">{label}</span>
      <span className="ml-1 tabular-nums font-bold">
        {count}
        <span className="opacity-70 font-normal ml-1">({pct.toFixed(0)}%)</span>
      </span>
    </div>
  );
}
