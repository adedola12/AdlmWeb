import React from "react";
import { FaThLarge, FaSearch, FaCheckCircle } from "react-icons/fa";

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
function cellColor(pct, ratified) {
  if (ratified) {
    return {
      bg: "#005be3", // adlm-blue-700
      text: "#ffffff",
      label: "Ratified",
    };
  }
  const p = Math.max(0, Math.min(100, safeNum(pct)));
  if (p === 0) {
    return { bg: "#f1f5f9", text: "#94a3b8", label: "Not started" };
  }
  if (p <= 25) {
    return { bg: "#fecaca", text: "#991b1b", label: "Just started" };
  }
  if (p <= 50) {
    return { bg: "#fde68a", text: "#92400e", label: "In progress" };
  }
  if (p <= 75) {
    return { bg: "#a7f3d0", text: "#065f46", label: "Well underway" };
  }
  if (p < 100) {
    return { bg: "#34d399", text: "#064e3b", label: "Almost done" };
  }
  // 100% but not ratified
  return { bg: "#10b981", text: "#ffffff", label: "Done (awaiting sign-off)" };
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
      className="relative flex h-9 w-9 items-center justify-center rounded text-[10px] font-semibold transition hover:scale-110 hover:z-10 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-adlm-blue-700"
      style={{ backgroundColor: bg, color: text }}
      aria-label={`${item.description || `Item ${item.sn}`}: ${ratified ? "ratified" : `${pct}% complete`}`}
    >
      {ratified ? (
        <FaCheckCircle className="text-[11px]" />
      ) : (
        <span className="leading-none">{Math.round(pct)}</span>
      )}
    </button>
  );
}

function Legend() {
  const stops = [
    { color: "#f1f5f9", label: "0%" },
    { color: "#fecaca", label: "1-25%" },
    { color: "#fde68a", label: "26-50%" },
    { color: "#a7f3d0", label: "51-75%" },
    { color: "#34d399", label: "76-99%" },
    { color: "#10b981", label: "100%" },
    { color: "#005be3", label: "Ratified" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
      {stops.map((stop) => (
        <span key={stop.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded"
            style={{ backgroundColor: stop.color }}
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
      className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <div className="text-xs font-semibold text-slate-900 leading-tight break-words">
        {item.description || `Item ${item.sn}`}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
        <span>#{item.sn}</span>
        {item.category ? <span className="rounded bg-slate-100 px-1.5 py-0.5">{item.category}</span> : null}
        {item.trade ? <span className="rounded bg-slate-100 px-1.5 py-0.5">{item.trade}</span> : null}
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
        <div className="text-right font-semibold" style={{ color: ratified ? "#005be3" : pct > 0 ? "#059669" : "#94a3b8" }}>
          {ratified ? (statusLabel || "Ratified") : `${pct.toFixed(0)}%`}
        </div>
        <div className="text-slate-500">Valued</div>
        <div className="text-right text-emerald-700 font-semibold">₦{fmtMoney(valued)}</div>
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
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
        <FaThLarge className="mx-auto text-3xl text-slate-300" />
        <div className="mt-3 text-sm font-semibold text-slate-700">
          No BoQ items to map
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Upload a takeoff in the Bill of Quantity tab first — the heatmap will populate automatically.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            BoQ Progress Heatmap
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Every BoQ line as a cell — colour shows current progress, hover for detail.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <FaSearch className="absolute left-2.5 top-2 text-slate-400 text-[10px]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter items…"
              className="rounded-lg border border-slate-200 pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700"
            />
          </div>
          {/* Group toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
            {GROUP_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setGroupMode(mode.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  groupMode === mode.id
                    ? "bg-adlm-blue-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Distribution band */}
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 text-[10px]">
        <StatChip color="#005be3" textColor="#fff" label="Ratified" count={stats.ratified} total={stats.total} />
        <StatChip color="#10b981" textColor="#fff" label="100%" count={stats.full} total={stats.total} />
        <StatChip color="#34d399" textColor="#064e3b" label="76-99%" count={stats.almost} total={stats.total} />
        <StatChip color="#a7f3d0" textColor="#065f46" label="51-75%" count={stats.threeQuarter} total={stats.total} />
        <StatChip color="#fde68a" textColor="#92400e" label="26-50%" count={stats.half} total={stats.total} />
        <StatChip color="#fecaca" textColor="#991b1b" label="1-25%" count={stats.started} total={stats.total} />
        <StatChip color="#f1f5f9" textColor="#475569" label="Not started" count={stats.notStarted} total={stats.total} />
      </div>

      {/* Grid */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            {groupMode !== "none" ? (
              <div className="mb-1.5 flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </div>
                <div className="h-px flex-1 bg-slate-100" />
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
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
            No items match "{query}".
          </div>
        ) : null}
      </div>

      {/* Legend */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <Legend />
      </div>

      {/* Floating tooltip */}
      <CellTooltip
        item={hovered?.item}
        anchor={hovered?.anchor}
        statusLabel={statusLabel}
      />
    </div>
  );
}

function StatChip({ color, textColor, label, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div
      className="rounded-md px-2 py-1.5 flex items-center justify-between"
      style={{ backgroundColor: color, color: textColor }}
    >
      <span className="font-semibold truncate">{label}</span>
      <span className="ml-1 tabular-nums font-bold">
        {count}
        <span className="opacity-70 font-normal ml-1">({pct.toFixed(0)}%)</span>
      </span>
    </div>
  );
}
