// Time saved — what the Takeoff Time Log adds up to, and on what basis.
//
// WHAT THIS SCREEN IS FOR
//
// HERON and QUIV record how long each takeoff session takes (counts and
// timings only, never drawing content) and the server estimates what the same
// work would have taken by hand. This screen is where ADLM reads the total,
// and — because the total will be quoted at conferences and in sales material
// — where the basis for it is written down: which rate-table version priced
// the sessions in the window, the exact formula, and the idle rule.
//
// NOTHING HERE IS COMPUTED IN THE BROWSER
//
// Every figure comes from /admin/takeoff/summary, which sums what is stored on
// each session at the time it was received. The page formats seconds as hours
// and draws bars. If a number on this screen cannot be reproduced from the
// sessions and the baseline version they name, that is a server bug, not a
// display choice. See docs/takeoff-time-log.md.
//
// SEED DATA
//
// The seed script writes demo sessions flagged seeded:true so the page can be
// reviewed before the plugins ship. They are excluded from every total unless
// the switch below is on, and then the banner says so in plain words.
//
// His markup: .adm-pagehead/.adm-h/.adm-lede, .adm-banner, .adm-kpis/.adm-kpi,
// .adm-panel with .adm-panel-h/.adm-panel-b, .adm-cols-chart/.adm-col/.adm-col-ax,
// .adm-table, .adm-f fields, .adm-b buttons, .adm-chip.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmChip, AdmDim, AdmTwo } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";

/* ────────────────────────────── formatting ────────────────────────────── */

const hours = (sec) => {
  const h = (Number(sec) || 0) / 3600;
  return h >= 100 ? Math.round(h).toLocaleString() : h.toFixed(1);
};
const dur = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const dayLabel = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Icon = ({ id }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

const RATE_LABELS = {
  sheetSetupMinutes: "Per sheet or view: find, check scale, orient",
  areaItemMinutes: "Per area item traced (HERON)",
  linearItemMinutes: "Per linear item run (HERON)",
  countItemMinutes: "Per count item tallied (HERON)",
  mixedItemMinutes: "Per item when the kind is not reported (HERON)",
  revitElementMinutes: "Per element instance or stored result (QUIV)",
  elementTypeMinutes: "Per distinct category: description, unit, setup",
  boqLineMinutes: "Per bill line written: description, transfer, check",
};

/* ────────────────────────────── pieces ────────────────────────────── */

/** His column chart: one bar per ISO week, the peak week picked out. */
function WeekChart({ groups }) {
  const rows = groups || [];
  if (!rows.length) {
    return <p className="adm-note">No completed sessions in this window.</p>;
  }
  const max = Math.max(1, ...rows.map((g) => g.savedSeconds || 0));
  const peak = rows.reduce((b, g) => (g.savedSeconds > (b?.savedSeconds || 0) ? g : b), null);
  return (
    <>
      <div className="adm-cols-chart" role="img" aria-label="Hours saved per week">
        {rows.map((g) => (
          <div
            key={g.key}
            className={`adm-col${peak && g.key === peak.key ? " peak" : ""}`}
            title={`Week of ${dayLabel(g.key)} · ${hours(g.savedSeconds)} h saved · ${g.sessions} session${g.sessions === 1 ? "" : "s"}`}
          >
            <i style={{ height: `${Math.max(2, ((g.savedSeconds || 0) / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="adm-col-ax">
        <span>week of {dayLabel(rows[0].key)}</span>
        {peak ? (
          <span className="mid">
            peak {hours(peak.savedSeconds)} h, week of {dayLabel(peak.key)}
          </span>
        ) : null}
        <span>week of {dayLabel(rows[rows.length - 1].key)}</span>
      </div>
    </>
  );
}

/**
 * A sortable register. AdmTable is the right thing for a register you click
 * through; this one is for comparing numbers, so the headers sort and nothing
 * navigates. Same markup, so it looks like his.
 */
function SortTable({ cols, rows, sort, onSort, empty, rowKey }) {
  const arrow = (k) => (sort.key === k ? (sort.dir === "desc" ? " ↓" : " ↑") : "");
  return (
    <div className="adm-tw">
      <table className="adm-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.h}
                className={c.num ? "num" : undefined}
                style={{ cursor: c.k ? "pointer" : undefined, width: c.w }}
                onClick={c.k ? () => onSort(c.k) : undefined}
                aria-sort={c.k && sort.key === c.k ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
              >
                {c.h}
                {c.k ? arrow(c.k) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={cols.length}>
                <div className="adm-none">
                  <b>{empty[0]}</b>
                  <span>{empty[1]}</span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)}>
                {cols.map((c) => (
                  <td key={c.h} className={c.num ? "num" : undefined}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function useSort(initial) {
  const [sort, setSort] = React.useState(initial);
  const onSort = (k) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: "desc" }));
  const apply = (rows) => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "desc" ? -cmp : cmp;
    });
    return out;
  };
  return [sort, onSort, apply];
}

/* ────────────────────────────── screen ────────────────────────────── */

const DAY = 86400000;

export default function DsAdminTimeSaved() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(iso(new Date(today.getTime() - 90 * DAY)));
  const [to, setTo] = React.useState(iso(today));
  const [product, setProduct] = React.useState("");
  const [firmId, setFirmId] = React.useState("");
  const [seeded, setSeeded] = React.useState(false);

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    setFailed(false);

    const q = (extra) => {
      const p = new URLSearchParams({ from, to, ...extra });
      if (product) p.set("product", product);
      if (firmId) p.set("firmId", firmId);
      if (seeded) p.set("includeSeeded", "1");
      return p.toString();
    };
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const qAll = (extra) => {
      const p = new URLSearchParams({ from: "2020-01-01", to: iso(new Date(today.getTime() + DAY)), ...extra });
      if (product) p.set("product", product);
      if (firmId) p.set("firmId", firmId);
      if (seeded) p.set("includeSeeded", "1");
      return p.toString();
    };
    const opts = { token: accessToken };

    Promise.all([
      apiAuthed(`/admin/takeoff/summary?${q({ groupBy: "week" })}`, opts),
      apiAuthed(`/admin/takeoff/summary?${q({ groupBy: "firm" })}`, opts),
      apiAuthed(`/admin/takeoff/summary?${q({ groupBy: "user" })}`, opts),
      apiAuthed(`/admin/takeoff/summary?${qAll({ groupBy: "product" })}`, opts),
      apiAuthed(`/admin/takeoff/summary?${qAll({ from: iso(monthStart), groupBy: "product" })}`, opts),
      apiAuthed(`/admin/takeoff/firms${seeded ? "?includeSeeded=1" : ""}`, opts),
      apiAuthed(`/admin/takeoff/baselines`, opts),
    ])
      .then(([week, byFirm, byUser, allTime, month, firms, baselines]) => {
        if (!alive) return;
        setD({ week, byFirm, byUser, allTime, month, firms: firms.rows || [], baselines });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, from, to, product, firmId, seeded, reload, today]);

  const [firmSort, onFirmSort, sortFirms] = useSort({ key: "savedSeconds", dir: "desc" });
  const [userSort, onUserSort, sortUsers] = useSort({ key: "savedSeconds", dir: "desc" });

  /* ── baseline form ── */
  const [nb, setNb] = React.useState(null); // { version, notes, activate, rates }
  const [saving, setSaving] = React.useState(false);

  function startNewBaseline() {
    const active = d?.week?.activeBaseline;
    setNb({
      version: "",
      notes: "",
      activate: true,
      rates: { ...(active?.rates || {}) },
    });
  }

  async function saveBaseline() {
    if (!nb) return;
    setSaving(true);
    try {
      await apiAuthed("/admin/takeoff/baselines", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nb),
      });
      say(`Baseline ${nb.version} saved${nb.activate ? " and activated" : ""}.`);
      setNb(null);
      setReload((n) => n + 1);
    } catch (err) {
      say(err?.data?.error || err?.message || "That baseline could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function activate(version) {
    try {
      await apiAuthed(`/admin/takeoff/baselines/${encodeURIComponent(version)}/activate`, {
        token: accessToken,
        method: "POST",
      });
      say(`Baseline ${version} is now active. New sessions use it; old ones keep theirs.`);
      setReload((n) => n + 1);
    } catch (err) {
      say(err?.data?.error || err?.message || "That baseline could not be activated.");
    }
  }

  if (failed) {
    return <p className="adm-note">Time saved could not be read just now. Please refresh.</p>;
  }

  const t = d?.week?.totals;
  const tm = d?.month?.totals;
  const ta = d?.allTime?.totals;
  const active = d?.week?.activeBaseline;
  const versions = d?.week?.baselineVersions || [];
  const meth = d?.week?.methodology;

  const KPIS = d
    ? [
        {
          k: "Hours saved this month",
          ic: "hi-calendar",
          v: hours(tm?.savedSeconds),
          u: "h",
          sub: `${tm?.sessions || 0} completed session${tm?.sessions === 1 ? "" : "s"} since the 1st`,
        },
        {
          k: "Hours saved all time",
          ic: "hi-overview",
          v: hours(ta?.savedSeconds),
          u: "h",
          sub: `${ta?.sessions || 0} sessions, ${ta?.users || 0} user${ta?.users === 1 ? "" : "s"}, since the first record`,
        },
        {
          k: "Sessions this month",
          ic: "hi-check",
          v: String(tm?.sessions || 0),
          sub: `${dur(tm?.activeSeconds)} of active takeoff time`,
        },
        {
          k: "Median session, auto vs manual",
          ic: "hi-shield",
          v: dur(t?.medianActiveSeconds),
          u: `vs ${dur(t?.medianEstimatedManualSeconds)} manual`,
          sub: "in the selected period; the manual figure is an estimate, basis below",
        },
      ]
    : [];

  const firmRows = sortFirms(
    (d?.byFirm?.groups || []).map((g) => ({
      ...g,
      firmId: g.key,
      name: g.label || "Personal licences",
      share: t?.savedSeconds ? g.savedSeconds / t.savedSeconds : 0,
    })),
  );
  const userRows = sortUsers(
    (d?.byUser?.groups || []).map((g) => ({
      ...g,
      email: g.label,
      product: (g.products || []).join(", "),
    })),
  );

  const firmCols = [
    { h: "Firm", k: "name", cell: (r) => <AdmTwo top={r.name} under={r.firmId || "no organisation on the licence"} /> },
    { h: "Users", k: "users", num: true, cell: (r) => r.users },
    { h: "Sessions", k: "sessions", num: true, cell: (r) => r.sessions },
    { h: "Active", k: "activeSeconds", num: true, cell: (r) => `${hours(r.activeSeconds)} h` },
    { h: "Est. manual", k: "estimatedManualSeconds", num: true, cell: (r) => `${hours(r.estimatedManualSeconds)} h` },
    { h: "Saved", k: "savedSeconds", num: true, cell: (r) => <b>{hours(r.savedSeconds)} h</b> },
    { h: "Share", k: "share", num: true, cell: (r) => pct(r.savedSeconds, t?.savedSeconds || 0) },
    { h: "Median session", k: "medianActiveSeconds", num: true, cell: (r) => dur(r.medianActiveSeconds) },
  ];
  const userCols = [
    { h: "User", k: "email", cell: (r) => <AdmTwo top={r.email} under={r.firmName || ""} /> },
    { h: "Product", k: "product", cell: (r) => (r.product ? <AdmChip>{r.product}</AdmChip> : <AdmDim>—</AdmDim>) },
    { h: "Sessions", k: "sessions", num: true, cell: (r) => r.sessions },
    { h: "Items", k: "items", num: true, cell: (r) => r.items },
    { h: "Active", k: "activeSeconds", num: true, cell: (r) => `${hours(r.activeSeconds)} h` },
    { h: "Est. manual", k: "estimatedManualSeconds", num: true, cell: (r) => `${hours(r.estimatedManualSeconds)} h` },
    { h: "Saved", k: "savedSeconds", num: true, cell: (r) => <b>{hours(r.savedSeconds)} h</b> },
    { h: "Median session", k: "medianActiveSeconds", num: true, cell: (r) => dur(r.medianActiveSeconds) },
    { h: "Last session", k: "lastAt", cell: (r) => (r.lastAt ? dayLabel(r.lastAt) : <AdmDim>—</AdmDim>) },
  ];

  const exportFirms = () =>
    downloadCsv(
      `time-saved-by-firm-${from}-to-${to}.csv`,
      ["Firm", "Firm id", "Users", "Sessions", "Active hours", "Estimated manual hours", "Saved hours", "Median session seconds", "Baseline versions in period"],
      firmRows.map((r) => [
        r.name, r.firmId, r.users, r.sessions,
        (r.activeSeconds / 3600).toFixed(2), (r.estimatedManualSeconds / 3600).toFixed(2), (r.savedSeconds / 3600).toFixed(2),
        r.medianActiveSeconds, versions.map((v) => v.version).join(" "),
      ]),
    );
  const exportUsers = () =>
    downloadCsv(
      `time-saved-by-user-${from}-to-${to}.csv`,
      ["User", "Firm", "Product", "Sessions", "Items", "Active hours", "Estimated manual hours", "Saved hours", "Median session seconds", "Last session"],
      userRows.map((r) => [
        r.email, r.firmName || "", r.product, r.sessions, r.items,
        (r.activeSeconds / 3600).toFixed(2), (r.estimatedManualSeconds / 3600).toFixed(2), (r.savedSeconds / 3600).toFixed(2),
        r.medianActiveSeconds, r.lastAt ? iso(r.lastAt) : "",
      ]),
    );

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Time saved</h1>
          <p className="adm-lede">
            How long takeoffs take with HERON and QUIV, against what the same work is estimated to take by
            hand. Every figure is summed on the server from stored sessions and the baseline version each
            one names; the basis is written out at the bottom so a number from here can be quoted.
          </p>
        </div>
      </div>

      {seeded ? (
        <div className="adm-banner">
          <span className="ic">
            <Icon id="hi-shield" />
          </span>
          <span>
            <b>Seed data is included. Do not quote these figures.</b>
            <p>
              Demo sessions written by the seed script are counted on this view so the screen can be
              reviewed before real data arrives. Switch it off before reading a number out.
            </p>
          </span>
        </div>
      ) : null}

      <div className="adm-toolrow" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="adm-f">
            <span className="adm-f-l">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="adm-f">
            <span className="adm-f-l">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="adm-f">
            <span className="adm-f-l">Product</span>
            <select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">All products</option>
              <option value="HERON">HERON</option>
              <option value="QUIV">QUIV</option>
              <option value="RATEGEN">RateGen</option>
            </select>
          </label>
          <label className="adm-f">
            <span className="adm-f-l">Firm</span>
            <select value={firmId} onChange={(e) => setFirmId(e.target.value)}>
              <option value="">All firms</option>
              {(d?.firms || []).map((f) => (
                <option key={f.firmId} value={f.firmId}>
                  {f.firmName} ({f.sessions})
                </option>
              ))}
            </select>
          </label>
          <label className="adm-f" style={{ alignSelf: "end", whiteSpace: "nowrap" }}>
            <span className="adm-f-l">Seed data</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, minHeight: 34 }}>
              <input type="checkbox" checked={seeded} onChange={(e) => setSeeded(e.target.checked)} />
              include for review
            </span>
          </label>
        </div>
      </div>

      {!d ? (
        <p className="adm-note">Adding up the sessions…</p>
      ) : (
        <>
          <div className="adm-kpis">
            {KPIS.map((s) => (
              <div key={s.k} className="adm-kpi">
                <span className="k">
                  <Icon id={s.ic} />
                  <span>{s.k}</span>
                </span>
                <b>
                  {s.v}
                  {s.u ? <span className="u">{s.u}</span> : null}
                </b>
                <span className="ds-sub">{s.sub}</span>
              </div>
            ))}
          </div>

          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Hours saved per week</h2>
              <span className="note">
                {dayLabel(from)} to {dayLabel(to)} · {t?.sessions || 0} completed session
                {t?.sessions === 1 ? "" : "s"} · {hours(t?.savedSeconds)} h saved
                {t?.cancelledSessions ? ` · ${t.cancelledSessions} cancelled excluded` : ""}
                {!seeded && t?.seededSessions ? ` · ${t.seededSessions} seeded excluded` : ""}
              </span>
            </div>
            <div className="adm-panel-b">
              <WeekChart groups={d.week.groups} />
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>By firm</h2>
              <span className="note">
                <button type="button" className="adm-b" onClick={exportFirms} disabled={!firmRows.length}>
                  Export CSV
                </button>
              </span>
            </div>
            <div className="adm-panel-b">
              <SortTable
                cols={firmCols}
                rows={firmRows}
                sort={firmSort}
                onSort={onFirmSort}
                rowKey={(r) => r.firmId || "personal"}
                empty={["No sessions in this window", "Widen the dates, or wait for the plugins to report."]}
              />
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>By user</h2>
              <span className="note">
                <button type="button" className="adm-b" onClick={exportUsers} disabled={!userRows.length}>
                  Export CSV
                </button>
              </span>
            </div>
            <div className="adm-panel-b">
              <SortTable
                cols={userCols}
                rows={userRows}
                sort={userSort}
                onSort={onUserSort}
                rowKey={(r) => r.key}
                empty={["No sessions in this window", "Widen the dates, or wait for the plugins to report."]}
              />
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Methodology and baseline</h2>
              <span className="note">
                active version <b>{active?.version || "—"}</b>
                {active?.activatedAt ? ` since ${dayLabel(active.activatedAt)}` : ""}
              </span>
            </div>
            <div className="adm-panel-b">
              <div className="adm-sec">
                <h2>How a figure is computed</h2>
                <p>
                  <b>Active time</b> is a session's wall time minus idle gaps longer than{" "}
                  {meth?.idleGapSeconds || 120} seconds between user inputs or measurement events, measured by
                  the plugin. <b>Estimated manual time</b> is computed on the server when the session arrives,
                  from the counts the plugin sent and the rate table below (or the user's own calibration
                  answer, applied as a multiplier to that table, for that user only). <b>Time saved</b> is the
                  estimate minus active time, floored at zero. Cancelled sessions and seed data are excluded.
                  Plugins send counts only: no drawing content, file names, element names, quantities or
                  prices.
                </p>
                <p style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11.5 }}>
                  estimatedManualSeconds = 60 × scale × (sheets × sheetSetup + area × areaItem + linear × linearItem
                  + count × countItem + unsplit items × mixedItem (HERON) or revitElement (QUIV) + elementTypes ×
                  elementType + boqLines × boqLine)
                  <br />
                  savedSeconds = max(0, estimatedManualSeconds − activeSeconds)
                </p>
              </div>

              <div className="adm-sec">
                <h2>Versions used in this window</h2>
                {versions.length ? (
                  <div className="adm-facts">
                    {versions.map((v) => (
                      <div key={`${v.version}-${v.method}`} className="adm-fact">
                        <b>{v.version}</b>
                        <span>
                          {v.sessions} session{v.sessions === 1 ? "" : "s"} ·{" "}
                          {v.method === "user_calibration" ? "user calibration" : "admin rate table"} ·{" "}
                          {hours(v.savedSeconds)} h
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No sessions in this window, so no version has been applied to anything yet.</p>
                )}
              </div>

              <div className="adm-sec">
                <h2>Active rate table: {active?.version}</h2>
                <p>{active?.notes}</p>
              </div>
              <div className="adm-tw">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Unit of manual work</th>
                      <th className="num" style={{ width: 120 }}>
                        Minutes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(active?.rates || {}).map(([k, v]) => (
                      <tr key={k}>
                        <td>
                          <AdmTwo top={RATE_LABELS[k] || k} under={k} />
                        </td>
                        <td className="num">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="adm-sec">
                <h2>All versions</h2>
                <p>
                  Versions are never edited. To change an assumption, create a new version with a note saying
                  where the numbers came from, and activate it. Sessions already stored keep the version that
                  priced them.
                </p>
              </div>
              <div className="adm-tw">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Notes</th>
                      <th className="num">Sessions priced</th>
                      <th>Created</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(d.baselines?.rows || []).map((b) => (
                      <tr key={b.id}>
                        <td>
                          <b>{b.version}</b> {b.active ? <AdmChip tone="ok">active</AdmChip> : null}
                        </td>
                        <td style={{ maxWidth: 420, whiteSpace: "normal" }}>{b.notes}</td>
                        <td className="num">{b.sessions}</td>
                        <td>{dayLabel(b.createdAt)}</td>
                        <td className="num">
                          {b.active ? null : (
                            <button type="button" className="adm-b" onClick={() => activate(b.version)}>
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nb ? (
                <div className="adm-sec">
                  <h2>New version</h2>
                  <div className="adm-fields" style={{ maxWidth: 640, marginTop: 10 }}>
                    <label>
                      Version name, e.g. 2026.11-timed-12-jobs
                      <input
                        value={nb.version}
                        onChange={(e) => setNb({ ...nb, version: e.target.value })}
                        placeholder="letters, digits, . _ -"
                      />
                    </label>
                    {Object.keys(active?.rates || {}).map((k) => (
                      <label key={k}>
                        {RATE_LABELS[k] || k} ({k})
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={nb.rates[k] ?? ""}
                          onChange={(e) => setNb({ ...nb, rates: { ...nb.rates, [k]: e.target.value } })}
                        />
                      </label>
                    ))}
                    <label>
                      Where these numbers come from (required; this is what gets quoted)
                      <textarea
                        rows={3}
                        value={nb.notes}
                        onChange={(e) => setNb({ ...nb, notes: e.target.value })}
                        placeholder="e.g. Timed 12 manual takeoffs at three Lagos firms in October 2026; medians per unit."
                      />
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={nb.activate}
                        onChange={(e) => setNb({ ...nb, activate: e.target.checked })}
                      />
                      Activate for new sessions as soon as it is saved
                    </label>
                  </div>
                  <div className="adm-act" style={{ justifyContent: "flex-start", marginTop: 12 }}>
                    <button type="button" className="adm-b" disabled={saving} onClick={saveBaseline}>
                      {saving ? "Saving…" : "Save version"}
                    </button>
                    <button type="button" className="adm-b" onClick={() => setNb(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="adm-act" style={{ justifyContent: "flex-start", marginTop: 14 }}>
                  <button type="button" className="adm-b" onClick={startNewBaseline}>
                    New baseline version
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      )}
      {toast}
    </>
  );
}
