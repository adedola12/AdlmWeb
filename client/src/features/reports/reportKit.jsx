// features/reports/reportKit.jsx
// Shared building blocks for the exportable report documents (Project / PM /
// Management). Follows the ProposalPreview convention: a scoped CSS string
// under `.adlm-report`, A4 `.page` blocks that downloadReportPdf() captures
// with html2canvas, and print-safe SVG/CSS-only charts (no chart library —
// same house style as PmDashboardView / PortfolioDashboard).
import React from "react";
import dayjs from "dayjs";

/* ── Palette (mirrors the proposal template + PM status colors) ── */
export const RPT = {
  navy: "#0D2240",
  blue: "#1E6BCC",
  orange: "#F07020",
  sky: "#40B0E0",
  green: "#1A9E55",
  red: "#D64545",
  amber: "#D97706",
  slate: "#94A3B8",
  muted: "#5B6B80",
  line: "#E3E8EF",
  wash: "#F6F8FB",
};

export const STATUS_COLORS = {
  completed: RPT.green,
  inProgress: RPT.blue,
  notStarted: RPT.slate,
  blocked: RPT.red,
};

/* ── Formatting helpers ── */
export const NAIRA = "₦";

export function fmtMoney(v, { compact = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${NAIRA}${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${NAIRA}${(n / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${NAIRA}${(n / 1e3).toFixed(0)}K`;
    return `${NAIRA}${n.toFixed(0)}`;
  }
  return `${NAIRA}${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function fmtPct(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtDate(v) {
  if (!v) return "—";
  const d = dayjs(v);
  return d.isValid() ? d.format("DD MMM YYYY") : "—";
}

// Split table rows across pages: `first` rows on the section's opening page,
// `rest` rows per continuation page.
export function paginateRows(rows, first, rest) {
  const chunks = [];
  if (!rows?.length) return chunks;
  chunks.push(rows.slice(0, first));
  for (let i = first; i < rows.length; i += rest) {
    chunks.push(rows.slice(i, i + rest));
  }
  return chunks;
}

/* ── Scoped report CSS ── */
export const REPORT_CSS = `
.adlm-report{
  --navy:${RPT.navy}; --blue:${RPT.blue}; --orange:${RPT.orange}; --sky:${RPT.sky};
  --green:${RPT.green}; --red:${RPT.red};
  --ink:${RPT.navy}; --muted:${RPT.muted}; --line:${RPT.line}; --paper:#ffffff; --wash:${RPT.wash};
  font-family:'Lexend',sans-serif;color:var(--ink);line-height:1.55;font-weight:400;
  background:#eef1f5;padding:1px 0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.adlm-report *{box-sizing:border-box;margin:0;padding:0}
.adlm-report .page{width:210mm;height:297mm;margin:18px auto;background:var(--paper);
  box-shadow:0 10px 40px rgba(13,34,64,.14);position:relative;overflow:hidden;
  display:flex;flex-direction:column}
.adlm-report .pad{padding:16mm 16mm 12mm;flex:1;display:flex;flex-direction:column;min-height:0}

.adlm-report .mark{display:flex;align-items:center;gap:12px}
.adlm-report .glyph{width:40px;height:40px;border-radius:10px;background:var(--navy);position:relative;flex:0 0 auto}
.adlm-report .glyph::before{content:"";position:absolute;left:8px;bottom:8px;width:12px;height:18px;background:var(--sky)}
.adlm-report .glyph::after{content:"";position:absolute;right:7px;bottom:8px;width:7px;height:24px;
  background:#fff;clip-path:polygon(0 35%,55% 35%,55% 0,100% 0,100% 100%,0 100%)}
.adlm-report .word{font-weight:800;font-size:22px;letter-spacing:-.5px;line-height:1}
.adlm-report .word .a{color:var(--navy)} .adlm-report .word .s{color:var(--orange)}
.adlm-report .word small{display:block;font-weight:500;font-size:8.5px;letter-spacing:2.6px;color:var(--muted);margin-top:3px}

/* Cover */
.adlm-report .cover{background:var(--navy);color:#fff;padding:16mm 16mm 12mm;flex:1;display:flex;flex-direction:column}
.adlm-report .cover .word .a{color:#fff}
.adlm-report .cover .glyph{background:#fff}
.adlm-report .cover .glyph::before{background:var(--sky)}
.adlm-report .cover .glyph::after{background:var(--navy)}
.adlm-report .kicker{display:inline-block;margin-top:26mm;font-size:11px;font-weight:600;letter-spacing:3.5px;
  color:var(--sky);text-transform:uppercase}
.adlm-report h1{font-size:37px;font-weight:800;line-height:1.12;letter-spacing:-1px;margin:12px 0 8px;color:#fff}
.adlm-report h1 .accent{color:var(--orange)}
.adlm-report .cover .lede{color:#aebfd6;font-size:14.5px;max-width:135mm;margin-top:4px}
.adlm-report .meta-card{margin-top:auto;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 24px}
.adlm-report .meta-card .lbl{font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:var(--sky);font-weight:600}
.adlm-report .meta-card .val{font-size:14px;font-weight:600;margin-top:3px;color:#fff}
.adlm-report .cover-foot{margin-top:22px;display:flex;justify-content:space-between;font-size:11px;color:#8fa4c4;
  border-top:1px solid rgba(255,255,255,.13);padding-top:12px}

/* Page header / footer */
.adlm-report .page-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;
  padding-bottom:12px;border-bottom:2px solid var(--navy)}
.adlm-report .page-head .doc{font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--muted);text-align:right}
.adlm-report .page-head .doc b{display:block;color:var(--navy);font-size:12px;letter-spacing:.3px;text-transform:none}
.adlm-report .page-foot{margin-top:auto;padding-top:10px;border-top:1px solid var(--line);
  display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted)}
.adlm-report .page-foot .s{color:var(--orange);font-weight:700}

/* Sections */
.adlm-report h2{font-size:18px;font-weight:700;letter-spacing:-.3px;margin:0 0 2px;color:var(--navy);
  display:flex;align-items:center;gap:10px}
.adlm-report h2::before{content:"";width:6px;height:20px;background:var(--orange);border-radius:2px;flex:0 0 auto}
.adlm-report .sec-k{font-size:9.5px;font-weight:600;letter-spacing:2.6px;text-transform:uppercase;color:var(--blue);margin-bottom:14px}
.adlm-report section{margin-bottom:22px}
.adlm-report p{font-size:12px;color:#33445c}

/* KPI tiles */
.adlm-report .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:10px}
.adlm-report .kpi{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--wash)}
.adlm-report .kpi .k{font-size:9px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted)}
.adlm-report .kpi .v{font-size:19px;font-weight:800;color:var(--navy);margin-top:4px;letter-spacing:-.4px}
.adlm-report .kpi .sub{font-size:10px;color:var(--muted);margin-top:2px}
.adlm-report .kpi.good .v{color:var(--green)}
.adlm-report .kpi.bad .v{color:var(--red)}
.adlm-report .kpi.accent .v{color:var(--orange)}

/* Tables */
.adlm-report table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:4px}
.adlm-report th{background:var(--navy);color:#fff;text-align:left;padding:8px 10px;font-weight:600;font-size:9.5px;letter-spacing:.4px}
.adlm-report td{padding:7px 10px;border-bottom:1px solid var(--line);color:#33445c;vertical-align:top}
.adlm-report tr:nth-child(even) td{background:#fafbfd}
.adlm-report td strong,.adlm-report td b{color:var(--navy)}
.adlm-report .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.adlm-report th.num{text-align:right}
.adlm-report .totals-row td{background:var(--navy) !important;color:#fff;font-weight:700}

/* Pills */
.adlm-report .pill{display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;
  padding:2px 8px;border-radius:20px;background:var(--wash);color:var(--muted);border:1px solid var(--line)}
.adlm-report .pill.green{background:#e8f7ef;color:var(--green);border-color:#bfe8d1}
.adlm-report .pill.blue{background:#eaf2fd;color:var(--blue);border-color:#c5dcf7}
.adlm-report .pill.red{background:#fdeaea;color:var(--red);border-color:#f3c3c3}
.adlm-report .pill.amber{background:#fdf3e3;color:${RPT.amber};border-color:#f3ddb3}

/* Chart frames */
.adlm-report .chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.adlm-report .chart-card{border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff}
.adlm-report .chart-card .t{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--navy);margin-bottom:10px}
.adlm-report .legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:10px}
.adlm-report .legend .li{display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--muted)}
.adlm-report .legend .dot{width:8px;height:8px;border-radius:2px;flex:0 0 auto}

/* Horizontal bars */
.adlm-report .hbars .row{margin-bottom:9px}
.adlm-report .hbars .lab{display:flex;justify-content:space-between;font-size:9.5px;color:#33445c;margin-bottom:3px}
.adlm-report .hbars .lab b{color:var(--navy);font-weight:600;max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adlm-report .hbars .track{height:9px;border-radius:5px;background:#edf1f6;position:relative;overflow:hidden}
.adlm-report .hbars .fill{position:absolute;inset:0 auto 0 0;border-radius:5px}
.adlm-report .hbars .fill2{position:absolute;inset:0 auto 0 0;border-radius:5px;opacity:.95}
`;

/* ── Brand mark (same glyph as ProposalPreview) ── */
export function ADLMMark() {
  return (
    <div className="mark">
      <div className="glyph" />
      <div className="word">
        <span className="a">ADLM</span> <span className="s">Studio</span>
        <small>DIGITAL CONSTRUCTION</small>
      </div>
    </div>
  );
}

/* ── Shell + page chrome ── */
export function ReportShell({ children, previewRef }) {
  return (
    <div className="adlm-report" ref={previewRef}>
      <style>{REPORT_CSS}</style>
      {children}
    </div>
  );
}

export function ReportPage({ docTitle, docSub, pageNo, pageCount, children }) {
  return (
    <div className="page">
      <div className="pad">
        <div className="page-head">
          <ADLMMark />
          <div className="doc">
            {docSub}
            <b>{docTitle}</b>
          </div>
        </div>
        {children}
        <div className="page-foot">
          <span>
            <b>ADLM</b> <span className="s">Studio</span> — adlmstudio.net
          </span>
          <span>{dayjs().format("DD MMM YYYY")}</span>
          <span>
            Page {pageNo}
            {pageCount ? ` of ${pageCount}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CoverPage({ kicker, title, accent, lede, metaPairs = [], footLeft, footRight }) {
  return (
    <div className="page">
      <div className="cover">
        <ADLMMark />
        <span className="kicker">{kicker}</span>
        <h1>
          {title} {accent ? <span className="accent">{accent}</span> : null}
        </h1>
        {lede ? <div className="lede">{lede}</div> : null}
        <div className="meta-card">
          {metaPairs.map((m) => (
            <div key={m.label}>
              <div className="lbl">{m.label}</div>
              <div className="val">{m.value || "—"}</div>
            </div>
          ))}
        </div>
        <div className="cover-foot">
          <span>{footLeft}</span>
          <span>{footRight}</span>
        </div>
      </div>
    </div>
  );
}

export function Section({ k, title, children }) {
  return (
    <section>
      <h2>{title}</h2>
      {k ? <div className="sec-k">{k}</div> : null}
      {children}
    </section>
  );
}

export function KpiRow({ items }) {
  return (
    <div className="kpis" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it) => (
        <div key={it.label} className={`kpi ${it.tone || ""}`}>
          <div className="k">{it.label}</div>
          <div className="v">{it.value}</div>
          {it.sub ? <div className="sub">{it.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="li">
          <span className="dot" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ── Charts (pure SVG — capture-safe) ── */

// Donut with segments [{label, value, color}] and a center label.
export function Donut({ segments, size = 150, stroke = 22, centerLabel, centerSub }) {
  const total = segments.reduce((a, s) => a + Math.max(0, Number(s.value) || 0), 0);
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#edf1f6" strokeWidth={stroke} />
      {total > 0 &&
        segments.map((s, i) => {
          const frac = Math.max(0, Number(s.value) || 0) / total;
          if (frac <= 0) return null;
          const dash = frac * circ;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          offset += dash;
          return el;
        })}
      {centerLabel != null && (
        <text
          x={c}
          y={centerSub ? c - 2 : c + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.16}
          fontWeight="800"
          fill={RPT.navy}
        >
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text
          x={c}
          y={c + size * 0.12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.062}
          fontWeight="600"
          fill={RPT.muted}
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}

// Horizontal planned-vs-earned bars. rows: [{label, value, value2, percent, right}]
// value = full track reference (planned), value2 = filled portion (earned).
export function HBars({ rows, color = RPT.blue, color2 = RPT.green }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const w = ((Number(r.value) || 0) / max) * 100;
        const w2 = ((Number(r.value2) || 0) / max) * 100;
        return (
          <div className="row" key={r.label}>
            <div className="lab">
              <b>{r.label}</b>
              <span>{r.right}</span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${w}%`, background: `${color}33` }} />
              <div className="fill2" style={{ width: `${w2}%`, background: color2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Line chart for burndown / trends. series: [{name, color, dash, points:[num]}],
// labels: x labels (sparse-rendered). Pure SVG polylines.
export function LineChart({ series, labels = [], width = 640, height = 190 }) {
  const padL = 46;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const allVals = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
  const maxV = Math.max(1, ...allVals);
  const n = Math.max(2, ...series.map((s) => s.points.length));
  const x = (i) => padL + (i / (n - 1)) * innerW;
  const y = (v) => padT + innerH - (Math.max(0, v) / maxV) * innerH;
  const gridLines = 4;
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const gy = padT + (i / gridLines) * innerH;
        const val = maxV * (1 - i / gridLines);
        return (
          <g key={i}>
            <line x1={padL} y1={gy} x2={width - padR} y2={gy} stroke={RPT.line} strokeWidth="1" />
            <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize="8.5" fill={RPT.muted}>
              {fmtMoney(val, { compact: true })}
            </text>
          </g>
        );
      })}
      {labels.map((lb, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="8" fill={RPT.muted}>
            {lb}
          </text>
        ) : null,
      )}
      {series.map((s) => (
        <polyline
          key={s.name}
          fill="none"
          stroke={s.color}
          strokeWidth="2.2"
          strokeDasharray={s.dash ? "5 4" : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        />
      ))}
    </svg>
  );
}

// Single horizontal stacked distribution bar. parts: [{label, value, color}]
export function StackedBar({ parts, height = 16 }) {
  const total = parts.reduce((a, p) => a + Math.max(0, Number(p.value) || 0), 0);
  return (
    <div>
      <div style={{ display: "flex", height, borderRadius: 8, overflow: "hidden", background: "#edf1f6" }}>
        {total > 0 &&
          parts.map((p) =>
            p.value > 0 ? (
              <div
                key={p.label}
                style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
                title={p.label}
              />
            ) : null,
          )}
      </div>
      <Legend items={parts.map((p) => ({ label: `${p.label} (${p.value})`, color: p.color }))} />
    </div>
  );
}

/* ── Table ── */
// cols: [{key, label, num, render}] ; rows: array of objects
export function Table({ cols, rows, totalsRow }) {
  return (
    <table>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.key} className={c.num ? "num" : undefined} style={c.width ? { width: c.width } : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c.key} className={c.num ? "num" : undefined}>
                {c.render ? c.render(r) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
        {totalsRow ? (
          <tr className="totals-row">
            {cols.map((c) => (
              <td key={c.key} className={c.num ? "num" : undefined}>
                {totalsRow[c.key] ?? ""}
              </td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function StatusPill({ value }) {
  const v = String(value || "").toLowerCase();
  let cls = "";
  if (["completed", "paid", "approved", "closed", "resolved", "on-track", "ontrack"].includes(v)) cls = "green";
  else if (["in-progress", "inprogress", "mitigating", "sent", "at-risk", "atrisk"].includes(v)) cls = "blue";
  else if (["blocked", "overdue", "behind", "critical", "high"].includes(v)) cls = "red";
  else if (["open", "draft", "medium", "not-started"].includes(v)) cls = "amber";
  return <span className={`pill ${cls}`}>{String(value || "—").replace(/-/g, " ")}</span>;
}
