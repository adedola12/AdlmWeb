// src/pages/AdminAiUsage.jsx
// AI spend & allocation dashboard (admin area "aiusage").
//
// Answers three questions, in this order:
//   1. How fast is the AWS credit going, and when does it run out?
//   2. Which feature / model / user is spending it?
//   3. Who needs a cap, and what should it be?
//
// Everything is read from /admin/ai-usage, which aggregates the AiUsage event
// log written by every AI call on the platform.

import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

/* ------------------------------ formatting ------------------------------ */
const usd = (n) =>
  Number.isFinite(Number(n))
    ? `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
const usd4 = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0 && Number(n) < 0.01
    ? `$${Number(n).toFixed(4)}`
    : usd(n);
const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString() : "—");
const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
};
const dt = (d) => (d ? new Date(d).toLocaleString() : "—");
const day = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const pct = (n) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(0)}%`);

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

/* ------------------------------ primitives ------------------------------ */
const CARD =
  "rounded-2xl bg-white dark:bg-adlm-dark-raised ring-1 ring-black/5 dark:ring-adlm-dark-border";
const BTN =
  "rounded-lg px-3 py-2 text-sm ring-1 ring-black/10 dark:ring-adlm-dark-border hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50";
const BTN_PRIMARY =
  "rounded-lg px-3 py-2 text-sm bg-adlm-blue-700 text-white hover:bg-[#0050c8] disabled:opacity-50";
const INPUT =
  "rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-black/10 dark:ring-adlm-dark-border bg-white dark:bg-adlm-dark-raised w-full";
const TH = "text-left font-semibold text-slate-600 dark:text-adlm-dark-muted px-3 py-2";
const TD = "px-3 py-2 align-top";

function Kpi({ label, value, sub, tone = "" }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      {sub ? (
        <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">{sub}</div>
      ) : null}
    </div>
  );
}

// Deliberately CSS-only — a chart library isn't worth a dependency for a
// 30-bar daily series, and this renders identically in light and dark.
function DailyBars({ rows, metric }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[metric]) || 0));
  if (!rows.length)
    return <div className="text-sm text-slate-500 py-8 text-center">No usage in this window.</div>;
  return (
    <>
      <div className="flex items-end gap-[3px] h-40 overflow-x-auto pb-1">
        {rows.map((r) => {
          const v = Number(r[metric]) || 0;
          return (
            // h-full + items-end on the column is load-bearing: the bar's
            // height is a percentage, which resolves to zero against an
            // auto-height parent (and renders an empty chart).
            <div
              key={r.date}
              className="flex-1 min-w-[6px] h-full flex items-end"
              title={`${r.date} · ${r.calls} calls · ${compact(r.tokens)} tokens · ${usd4(r.costUsd)}`}
            >
              <div
                className="w-full rounded-t bg-adlm-blue-700/80 hover:bg-adlm-blue-700 transition-all"
                style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-1">
        <span>{rows[0]?.date}</span>
        <span>peak {usd4(max)}/day</span>
        <span>{rows[rows.length - 1]?.date}</span>
      </div>
    </>
  );
}

function Table({ columns, rows, empty = "Nothing yet." }) {
  if (!rows.length)
    return <div className="text-sm text-slate-500 px-3 py-6 text-center">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-max">
        <thead className="border-b border-black/5 dark:border-adlm-dark-border">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${TH} ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r._key ?? i}
              className="border-b border-black/5 dark:border-adlm-dark-border last:border-0"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${TD} ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- credit burn-down --------------------------- */
function CreditPanel({ credit, onSave, saving }) {
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({});

  React.useEffect(() => {
    setForm({
      label: credit?.label || "AWS credit",
      totalUsd: credit?.totalUsd || 0,
      openingSpendUsd: credit?.openingSpendUsd || 0,
      startAt: credit?.startAt ? String(credit.startAt).slice(0, 10) : "",
      expiresAt: credit?.expiresAt ? String(credit.expiresAt).slice(0, 10) : "",
    });
  }, [credit]);

  if (!credit) return null;

  const used = credit.percentUsed;
  // Colour is the whole point of this bar — it should read as "fine / watch /
  // act" without anyone doing arithmetic.
  const tone = used === null ? "bg-slate-400" : used >= 85 ? "bg-red-500" : used >= 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">{credit.label} burn-down</h2>
          <p className="text-xs text-slate-500 dark:text-adlm-dark-muted">
            Every AI call billed to AWS, since metering started
            {credit.openingSpendUsd ? ` (plus ${usd(credit.openingSpendUsd)} opening spend)` : ""}.
          </p>
        </div>
        <button type="button" className={BTN} onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit credit"}
        </button>
      </div>

      {!credit.totalUsd ? (
        <div className="text-sm rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 ring-1 ring-amber-500/20">
          No credit total set yet — enter the AWS grant amount to see the runway.
          Spend so far: <b>{usd(credit.spentUsd)}</b>.
        </div>
      ) : (
        <>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div className={`h-full ${tone} transition-all`} style={{ width: `${Math.min(100, used || 0)}%` }} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase text-slate-500">Spent</div>
              <div className="font-semibold tabular-nums">
                {usd(credit.spentUsd)} <span className="text-slate-500 font-normal">({pct(used)})</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Remaining</div>
              <div className="font-semibold tabular-nums">{usd(credit.remainingUsd)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Burn rate</div>
              <div className="font-semibold tabular-nums">{usd4(credit.perDayUsd)}/day</div>
            </div>
            <div>
              {/* At the current burn the credit usually expires with money left,
                  so calling that "runs out" reads as runway when it is really
                  unused credit about to be lost. Label what the figure is. */}
              <div className="text-[11px] uppercase text-slate-500">
                {credit.limitedBy === "expiry" ? "Expires unused" : "Runs out"}
              </div>
              <div className="font-semibold tabular-nums">
                {credit.daysRemaining === null
                  ? "—"
                  : `${num(credit.daysRemaining)} days · ${day(credit.exhaustsOn)}`}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">
            Month-to-date {usd(credit.monthToDateUsd)} · projected full month{" "}
            {usd(credit.projectedMonthUsd)}
            {credit.expiresAt ? ` · credit expires ${day(credit.expiresAt)}` : ""}
          </div>
        </>
      )}

      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2 border-t border-black/5 dark:border-adlm-dark-border">
          <label className="text-xs">
            Label
            <input
              className={INPUT}
              value={form.label || ""}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Credit total (USD)
            <input
              type="number"
              min="0"
              step="1"
              className={INPUT}
              value={form.totalUsd}
              onChange={(e) => setForm({ ...form, totalUsd: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Opening spend (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              className={INPUT}
              value={form.openingSpendUsd}
              onChange={(e) => setForm({ ...form, openingSpendUsd: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Granted on
            <input
              type="date"
              className={INPUT}
              value={form.startAt || ""}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Expires
            <input
              type="date"
              className={INPUT}
              value={form.expiresAt || ""}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-5">
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={saving}
              onClick={() => onSave(form).then(() => setEditing(false))}
            >
              {saving ? "Saving…" : "Save credit settings"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------- allocation editor -------------------------- */
// 0 = unlimited everywhere, which is why every field says so explicitly. An
// admin reading "0" as "blocked" would be a costly misunderstanding.
function LimitFields({ value, onChange, disabled = false }) {
  const v = value || {};
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  return (
    <div className={`grid grid-cols-3 gap-2 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <label className="text-[11px]">
        Calls
        <input type="number" min="0" className={INPUT} value={v.calls ?? 0} onChange={set("calls")} />
      </label>
      <label className="text-[11px]">
        Tokens
        <input type="number" min="0" className={INPUT} value={v.tokens ?? 0} onChange={set("tokens")} />
      </label>
      <label className="text-[11px]">
        Cost USD
        <input
          type="number"
          min="0"
          step="0.01"
          className={INPUT}
          value={v.costUsd ?? 0}
          onChange={set("costUsd")}
        />
      </label>
    </div>
  );
}

// Starting points sized off observed cost (~$0.0007 per Ada call, ~$0.002 per
// AI-service call): generous enough that no real user notices, tight enough
// that a runaway loop or a scripted abuser hits a wall the same day.
const RECOMMENDED = {
  enabled: true,
  total: { enabled: true, calls: 400, tokens: 0, costUsd: 3 },
  guestTotal: { enabled: true, calls: 600, tokens: 0, costUsd: 2 },
  features: {
    "ada-chat": { enabled: true, calls: 250, tokens: 0, costUsd: 0 },
    "ai-boq-check": { enabled: true, calls: 40, tokens: 0, costUsd: 0 },
    "ai-outliers": { enabled: true, calls: 40, tokens: 0, costUsd: 0 },
    "ai-rate-buildup": { enabled: true, calls: 60, tokens: 0, costUsd: 0 },
  },
  notes: "Recommended starting allowance",
};

function AllocationForm({ title, subtitle, features, value, onSave, onReset, saving, isDefault }) {
  const [form, setForm] = React.useState(() => normalize(value));
  // `features` is a dep because the guest checkboxes are seeded from each
  // feature's code-level policy, and the feature list can arrive after `value`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => setForm(normalize(value)), [value, features]);

  function normalize(a) {
    return {
      enabled: a?.enabled !== false,
      total: a?.total || { enabled: true, calls: 0, tokens: 0, costUsd: 0 },
      guestTotal: a?.guestTotal || { enabled: true, calls: 0, tokens: 0, costUsd: 0 },
      features: a?.features || {},
      // Seeded from each feature's code-level guest policy when the map has no
      // entry, so the checkboxes show what is actually being enforced rather
      // than defaulting everything to ticked.
      guestFeatures: Object.fromEntries(
        (features || []).map((f) => [
          f.key,
          a?.guestFeatures?.[f.key] || {
            enabled: !!f.guestAllowed,
            calls: 0,
            tokens: 0,
            costUsd: 0,
          },
        ]),
      ),
      notes: a?.notes || "",
    };
  }

  const setFeature = (key) => (limit) =>
    setForm({ ...form, features: { ...form.features, [key]: limit } });
  const featureOn = (key) => form.features[key]?.enabled !== false;
  const toggleFeature = (key) => (e) =>
    setFeature(key)({ ...(form.features[key] || { calls: 0, tokens: 0, costUsd: 0 }), enabled: e.target.checked });

  const guestFeatureOn = (key) => form.guestFeatures?.[key]?.enabled === true;
  const toggleGuestFeature = (key) => (e) =>
    setForm({
      ...form,
      guestFeatures: {
        ...form.guestFeatures,
        [key]: {
          ...(form.guestFeatures?.[key] || { calls: 0, tokens: 0, costUsd: 0 }),
          enabled: e.target.checked,
        },
      },
    });

  const off = !form.enabled;

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle ? (
            <p className="text-xs text-slate-500 dark:text-adlm-dark-muted">{subtitle}</p>
          ) : null}
        </div>
        {isDefault ? (
          <button type="button" className={BTN} onClick={() => setForm(normalize(RECOMMENDED))}>
            Use recommended
          </button>
        ) : null}
      </div>

      {/* Master switch — deliberately the loudest control on the card. */}
      <div
        className={`rounded-lg p-3 ring-1 ${
          off
            ? "bg-red-50 dark:bg-red-500/10 ring-red-500/30"
            : "bg-emerald-50 dark:bg-emerald-500/10 ring-emerald-500/20"
        }`}
      >
        <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          {isDefault
            ? off
              ? "AI is OFF for the entire platform"
              : "AI is ON for the entire platform"
            : off
              ? "AI is OFF for this account"
              : "AI is ON for this account"}
        </label>
        <p className="text-[11px] text-slate-600 dark:text-adlm-dark-muted mt-1 ml-6.5">
          {isDefault
            ? "Untick to stop every AI call instantly — guests, users, and anyone holding their own allowance. Tick to bring it all back. Nothing else needs changing."
            : "Only affects this account. The platform switch overrides it."}
        </p>
      </div>

      <div className={off ? "opacity-40 pointer-events-none" : ""}>
        <div className="text-xs font-semibold mb-1">
          Monthly allowance — all features combined{" "}
          <span className="font-normal text-slate-500">(0 = unlimited)</span>
        </div>
        <LimitFields value={form.total} onChange={(t) => setForm({ ...form, total: t })} />
      </div>

      {isDefault ? (
        <div
          className={`rounded-lg ring-1 ring-black/5 dark:ring-adlm-dark-border p-3 space-y-2.5 ${
            off ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <div className="text-xs font-semibold">
            Anonymous visitors{" "}
            <span className="font-normal text-slate-500">
              — one shared budget across all guests, not per guest
            </span>
          </div>
          <LimitFields
            value={form.guestTotal}
            onChange={(t) => setForm({ ...form, guestTotal: t })}
          />
          <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
            Which features a guest may reach at all. The paid QS tools are signed-in-only by
            default — that restriction is what turns a curious visitor into an account.
          </div>
          {features.map((f) => {
            const on = guestFeatureOn(f.key);
            return (
              <div key={f.key} className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={on} onChange={toggleGuestFeature(f.key)} />
                <span className={on ? "" : "text-slate-500"}>{f.label}</span>
                {on ? (
                  <span className="text-emerald-600">guests allowed</span>
                ) : (
                  <span className="text-slate-500">signed-in only</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={`space-y-2 ${off ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="text-xs font-semibold">
          Per-feature allowance{" "}
          <span className="font-normal text-slate-500">
            {isDefault
              ? "— switching a feature off here kills it platform-wide, even for users with their own allowance"
              : "— leave a feature untouched to inherit the platform default"}
          </span>
        </div>
        {features.map((f) => {
          const on = featureOn(f.key);
          return (
            <div
              key={f.key}
              className="rounded-lg ring-1 ring-black/5 dark:ring-adlm-dark-border p-2.5"
            >
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input type="checkbox" checked={on} onChange={toggleFeature(f.key)} />
                {f.label}
                {!on ? <span className="text-red-600 font-semibold">· OFF</span> : null}
              </label>
              <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mb-1.5 ml-6">
                {f.desc}
              </div>
              <LimitFields
                value={form.features[f.key]}
                onChange={setFeature(f.key)}
                disabled={!on}
              />
            </div>
          );
        })}
      </div>

      <label className="block text-xs">
        Notes
        <input
          className={INPUT}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Why this allowance was set"
        />
      </label>

      <div className="flex gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => onSave(form)}>
          {saving ? "Saving…" : "Save allocation"}
        </button>
        {onReset ? (
          <button type="button" className={BTN} disabled={saving} onClick={onReset}>
            Reset to platform default
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "By user" },
  { id: "allocations", label: "Allocations" },
  { id: "events", label: "Call log" },
];

export default function AdminAiUsage() {
  const { accessToken } = useAuth();

  const [tab, setTab] = React.useState("overview");
  const [range, setRange] = React.useState("30");
  const [feature, setFeature] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [overview, setOverview] = React.useState(null);
  const [userRows, setUserRows] = React.useState([]);
  const [defaultAlloc, setDefaultAlloc] = React.useState(null);
  const [userAllocs, setUserAllocs] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [errorsOnly, setErrorsOnly] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [editUser, setEditUser] = React.useState(null); // row being given limits

  const rangeParams = React.useMemo(
    () => (range === "month" ? { window: "month" } : { days: range }),
    [range],
  );
  const features = overview?.features || [];

  async function loadOverview() {
    setLoading(true);
    setMsg("");
    try {
      const data = await apiAuthed("/admin/ai-usage/overview", {
        token: accessToken,
        params: { ...rangeParams, feature: feature || undefined },
      });
      setOverview(data);
    } catch (e) {
      setMsg(e.message || "Failed to load AI usage");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setMsg("");
    try {
      // Always the calendar month — the window allocations reset on, so the
      // "% used" column can't disagree with what the quota check enforces.
      const data = await apiAuthed("/admin/ai-usage/users", {
        token: accessToken,
        params: { window: "month", feature: feature || undefined, q: q || undefined, limit: 200 },
      });
      setUserRows(data.rows || []);
      setDefaultAlloc(data.defaultAllocation || null);
    } catch (e) {
      setMsg(e.message || "Failed to load per-user usage");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllocations() {
    setLoading(true);
    setMsg("");
    try {
      const data = await apiAuthed("/admin/ai-usage/allocations", { token: accessToken });
      setDefaultAlloc(data.default || null);
      setUserAllocs(data.rows || []);
    } catch (e) {
      setMsg(e.message || "Failed to load allocations");
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    setLoading(true);
    setMsg("");
    try {
      const data = await apiAuthed("/admin/ai-usage/events", {
        token: accessToken,
        params: {
          ...rangeParams,
          feature: feature || undefined,
          ok: errorsOnly ? "false" : undefined,
          email: q || undefined,
          limit: 300,
        },
      });
      setEvents(data.events || []);
    } catch (e) {
      setMsg(e.message || "Failed to load call log");
    } finally {
      setLoading(false);
    }
  }

  function reload() {
    if (!accessToken) return;
    if (tab === "overview") loadOverview();
    else if (tab === "users") loadUsers();
    else if (tab === "allocations") loadAllocations();
    else loadEvents();
  }

  React.useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, feature, accessToken, errorsOnly]);

  // Loaded once on mount regardless of tab, so the credit burn-down and the
  // "AI is off" banner are visible from whichever tab you land on.
  React.useEffect(() => {
    if (!accessToken) return;
    if (!overview) loadOverview();
    if (!defaultAlloc) loadAllocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function saveCredit(form) {
    setSaving(true);
    setMsg("");
    try {
      const data = await apiAuthed("/admin/ai-usage/credit", {
        token: accessToken,
        method: "PUT",
        data: {
          label: form.label,
          totalUsd: Number(form.totalUsd) || 0,
          openingSpendUsd: Number(form.openingSpendUsd) || 0,
          startAt: form.startAt || null,
          expiresAt: form.expiresAt || null,
        },
      });
      setOverview((o) => (o ? { ...o, credit: data.credit } : o));
      setMsg("Credit settings saved.");
    } catch (e) {
      setMsg(e.message || "Failed to save credit settings");
    } finally {
      setSaving(false);
    }
  }

  async function saveDefaultAllocation(form) {
    setSaving(true);
    setMsg("");
    try {
      const data = await apiAuthed("/admin/ai-usage/allocations/default", {
        token: accessToken,
        method: "PUT",
        data: form,
      });
      setDefaultAlloc(data.allocation);
      setMsg("Platform default allocation saved.");
    } catch (e) {
      setMsg(e.message || "Failed to save allocation");
    } finally {
      setSaving(false);
    }
  }

  async function saveUserAllocation(userId, form) {
    setSaving(true);
    setMsg("");
    try {
      await apiAuthed(`/admin/ai-usage/allocations/user/${userId}`, {
        token: accessToken,
        method: "PUT",
        data: form,
      });
      setMsg("Allocation saved.");
      setEditUser(null);
      reload();
    } catch (e) {
      setMsg(e.message || "Failed to save allocation");
    } finally {
      setSaving(false);
    }
  }

  async function resetUserAllocation(userId) {
    setSaving(true);
    try {
      await apiAuthed(`/admin/ai-usage/allocations/user/${userId}`, {
        token: accessToken,
        method: "DELETE",
      });
      setMsg("Allocation reset to the platform default.");
      setEditUser(null);
      reload();
    } catch (e) {
      setMsg(e.message || "Failed to reset allocation");
    } finally {
      setSaving(false);
    }
  }

  const t = overview?.totals;
  const credit = overview?.credit;
  const offFeatures = React.useMemo(
    () =>
      Object.entries(defaultAlloc?.features || {})
        .filter(([, lim]) => lim?.enabled === false)
        .map(([key]) => features.find((f) => f.key === key)?.label || key),
    [defaultAlloc, features],
  );

  return (
    <div className="px-3 md:px-6 lg:px-10 py-6 space-y-4">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="h-6 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400"
            />
            AI Usage &amp; Credit
          </h1>
          <p className="text-sm text-slate-600 dark:text-adlm-dark-muted">
            Every AI call on the platform — what it cost, who spent it, and how much AWS credit is
            left.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select
            className={`${BTN} py-2`}
            value={range}
            onChange={(e) => setRange(e.target.value)}
            title="Time window"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="month">This month (quota window)</option>
          </select>
          <select
            className={`${BTN} py-2`}
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            title="Feature"
          >
            <option value="">All features</option>
            {features.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <button type="button" className={BTN} onClick={reload} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {msg ? (
        <div className={`${CARD} px-3 py-2 text-sm`}>
          {msg}{" "}
          <button type="button" className="underline text-slate-500" onClick={() => setMsg("")}>
            dismiss
          </button>
        </div>
      ) : null}

      {/* An off switch nobody can see is an outage waiting to be misdiagnosed. */}
      {defaultAlloc && defaultAlloc.enabled === false ? (
        <div className="rounded-2xl px-4 py-3 bg-red-50 dark:bg-red-500/10 ring-1 ring-red-500/30 text-sm flex items-center justify-between gap-3 flex-wrap">
          <div>
            <b className="text-red-700 dark:text-red-400">AI is switched off platform-wide.</b>{" "}
            Ada, HelpBot and the QS cost-intelligence tools are all refusing calls right now.
          </div>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={saving}
            onClick={() => saveDefaultAllocation({ ...defaultAlloc, enabled: true })}
          >
            Turn AI back on
          </button>
        </div>
      ) : null}

      {offFeatures.length ? (
        <div className="rounded-2xl px-4 py-3 bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-500/20 text-sm">
          <b className="text-amber-800 dark:text-amber-300">Switched off platform-wide:</b>{" "}
          {offFeatures.join(", ")} — these refuse calls for every user, including anyone with their
          own allowance.
        </div>
      ) : null}

      <CreditPanel credit={credit} onSave={saveCredit} saving={saving} />

      {/* KPIs — always the selected window */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Spend (window)" value={usd4(t?.costUsd)} sub={`${num(t?.calls)} model calls`} />
        <Kpi label="Tokens" value={compact(t?.tokens)} sub={`${compact(t?.inputTokens)} in · ${compact(t?.outputTokens)} out`} />
        <Kpi
          label="Avg cost / call"
          value={t?.calls ? usd4(t.costUsd / t.calls) : "—"}
          sub={`${num(t?.avgMs)} ms avg`}
        />
        <Kpi
          label="Failed calls"
          value={num(t?.errors)}
          tone={t?.errors ? "text-red-600 dark:text-red-400" : ""}
          sub={t?.calls ? `${((t.errors / t.calls) * 100).toFixed(1)}% of calls` : ""}
        />
        {/* Prompt caching only pays off when reads outweigh writes — a write
            costs 1.25x the input rate, a read 0.1x. This is the tile that
            says whether it's earning its keep. */}
        <Kpi
          label="Prompt cache"
          value={
            (t?.cacheReadTokens || 0) + (t?.cacheWriteTokens || 0) === 0
              ? "—"
              : pct(
                  (t.cacheReadTokens / (t.cacheReadTokens + t.cacheWriteTokens)) * 100,
                )
          }
          tone={
            t?.cacheReadTokens + t?.cacheWriteTokens > 0 &&
            t.cacheReadTokens < t.cacheWriteTokens
              ? "text-amber-600 dark:text-amber-400"
              : ""
          }
          sub={
            (t?.cacheReadTokens || 0) + (t?.cacheWriteTokens || 0) === 0
              ? `no cached calls · ${num(t?.estimatedCalls)} est. tokens`
              : `${compact(t.cacheReadTokens)} read (0.1x) · ${compact(t.cacheWriteTokens)} written (1.25x)`
          }
        />
      </div>

      {/* tabs */}
      <div className={`${CARD} p-2 overflow-x-auto`}>
        <div className="flex gap-2 min-w-max">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap ring-1 transition ${
                tab === x.id
                  ? "bg-adlm-blue-700 text-white ring-adlm-blue-700"
                  : "bg-white dark:bg-adlm-dark-raised text-slate-700 dark:text-adlm-dark-text ring-black/10 dark:ring-adlm-dark-border hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── overview ── */}
      {tab === "overview" && overview ? (
        <div className="space-y-4">
          <div className={`${CARD} p-4`}>
            <h2 className="font-semibold mb-2">Daily spend</h2>
            <DailyBars rows={overview.daily || []} metric="costUsd" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${CARD} p-4`}>
              <h2 className="font-semibold mb-2">By feature</h2>
              <Table
                rows={(overview.byFeature || []).map((r) => ({
                  ...r,
                  _key: r.feature,
                  label: features.find((f) => f.key === r.feature)?.label || r.feature,
                }))}
                columns={[
                  { key: "label", label: "Feature" },
                  { key: "calls", label: "Calls", align: "right", render: (r) => num(r.calls) },
                  { key: "tokens", label: "Tokens", align: "right", render: (r) => compact(r.tokens) },
                  { key: "costUsd", label: "Cost", align: "right", render: (r) => usd4(r.costUsd) },
                ]}
                empty="No AI calls in this window."
              />
            </div>

            <div className={`${CARD} p-4`}>
              <h2 className="font-semibold mb-2">By billing account</h2>
              <Table
                rows={(overview.byAccount || []).map((r) => ({
                  ...r,
                  _key: r.billedTo,
                  label:
                    (overview.accounts || []).find((a) => a.key === r.billedTo)?.label || r.billedTo,
                }))}
                columns={[
                  { key: "label", label: "Account" },
                  { key: "calls", label: "Calls", align: "right", render: (r) => num(r.calls) },
                  { key: "tokens", label: "Tokens", align: "right", render: (r) => compact(r.tokens) },
                  { key: "costUsd", label: "Cost", align: "right", render: (r) => usd4(r.costUsd) },
                ]}
                empty="No AI calls in this window."
              />
              <p className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-2">
                Only AWS-billed spend counts against the credit pool above.
              </p>
            </div>

            <div className={`${CARD} p-4`}>
              <h2 className="font-semibold mb-2">By model</h2>
              <Table
                rows={(overview.byModel || []).map((r, i) => ({ ...r, _key: `${r.model}-${i}` }))}
                columns={[
                  { key: "model", label: "Model" },
                  { key: "provider", label: "Provider" },
                  { key: "calls", label: "Calls", align: "right", render: (r) => num(r.calls) },
                  { key: "tokens", label: "Tokens", align: "right", render: (r) => compact(r.tokens) },
                  { key: "costUsd", label: "Cost", align: "right", render: (r) => usd4(r.costUsd) },
                ]}
              />
            </div>

            <div className={`${CARD} p-4`}>
              <h2 className="font-semibold mb-2">Top spenders</h2>
              <Table
                rows={(overview.topUsers || []).map((r, i) => ({ ...r, _key: r.userId || `g${i}` }))}
                columns={[
                  {
                    key: "email",
                    label: "User",
                    render: (r) => (
                      <div>
                        <div className="font-medium">{r.email || "(unknown)"}</div>
                        {r.name ? <div className="text-[11px] text-slate-500">{r.name}</div> : null}
                      </div>
                    ),
                  },
                  { key: "calls", label: "Calls", align: "right", render: (r) => num(r.calls) },
                  { key: "tokens", label: "Tokens", align: "right", render: (r) => compact(r.tokens) },
                  { key: "costUsd", label: "Cost", align: "right", render: (r) => usd4(r.costUsd) },
                ]}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── by user ── */}
      {tab === "users" ? (
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-semibold">Usage &amp; allocation per user</h2>
              <p className="text-xs text-slate-500 dark:text-adlm-dark-muted">
                Usage is for the current calendar month — the same window allocations reset on.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                className={INPUT}
                style={{ minWidth: 200 }}
                placeholder="Filter by email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadUsers()}
              />
              <button type="button" className={BTN} onClick={loadUsers}>
                Search
              </button>
              <button
                type="button"
                className={BTN}
                disabled={!userRows.length}
                onClick={() =>
                  downloadCsv(
                    "ai-usage-by-user.csv",
                    [
                      "Email",
                      "Name",
                      "Role",
                      "Calls",
                      "Tokens",
                      "Cost USD",
                      "Errors",
                      "Allocation scope",
                      "Limit calls",
                      "Limit tokens",
                      "Limit USD",
                      "Last used",
                      ...features.map((f) => `${f.label} calls`),
                    ],
                    userRows.map((r) => [
                      r.email,
                      r.name,
                      r.role,
                      r.totals.calls,
                      r.totals.tokens,
                      r.totals.costUsd,
                      r.totals.errors,
                      r.allocationScope,
                      r.allocation?.total?.calls ?? "",
                      r.allocation?.total?.tokens ?? "",
                      r.allocation?.total?.costUsd ?? "",
                      r.lastAt,
                      ...features.map((f) => r.byFeature?.[f.key]?.calls || 0),
                    ]),
                  )
                }
              >
                Export CSV
              </button>
            </div>
          </div>

          <Table
            rows={userRows.map((r) => ({ ...r, _key: r.userId || "guests" }))}
            empty="No AI usage this month."
            columns={[
              {
                key: "email",
                label: "User",
                render: (r) => (
                  <div>
                    <div className="font-medium">{r.email || "(unknown)"}</div>
                    <div className="text-[11px] text-slate-500">
                      {r.name ? `${r.name} · ` : ""}
                      {r.role} · last {dt(r.lastAt)}
                    </div>
                  </div>
                ),
              },
              ...features.map((f) => ({
                key: f.key,
                label: f.label,
                align: "right",
                render: (r) => {
                  const b = r.byFeature?.[f.key];
                  if (!b) return <span className="text-slate-400">—</span>;
                  return (
                    <div>
                      <div>{num(b.calls)}</div>
                      <div className="text-[11px] text-slate-500">{usd4(b.costUsd)}</div>
                    </div>
                  );
                },
              })),
              {
                key: "total",
                label: "Total",
                align: "right",
                render: (r) => (
                  <div>
                    <div className="font-semibold">{usd4(r.totals.costUsd)}</div>
                    <div className="text-[11px] text-slate-500">
                      {num(r.totals.calls)} calls · {compact(r.totals.tokens)} tok
                    </div>
                  </div>
                ),
              },
              {
                key: "allocation",
                label: "Allocation",
                render: (r) => {
                  if (!r.userId)
                    return <span className="text-[11px] text-slate-500">Guest pool</span>;
                  const a = r.allocation;
                  const worst = Math.max(
                    r.percentUsed?.calls || 0,
                    r.percentUsed?.tokens || 0,
                    r.percentUsed?.costUsd || 0,
                  );
                  const unlimited =
                    !a || (!a.total.calls && !a.total.tokens && !a.total.costUsd);
                  return (
                    <div className="text-[11px]">
                      <div>
                        {a?.enabled === false ? (
                          <span className="text-red-600 font-semibold">AI disabled</span>
                        ) : unlimited ? (
                          <span className="text-slate-500">Unlimited</span>
                        ) : (
                          <span
                            className={
                              worst >= 85
                                ? "text-red-600 font-semibold"
                                : worst >= 60
                                  ? "text-amber-600 font-semibold"
                                  : ""
                            }
                          >
                            {pct(worst)} used
                          </span>
                        )}
                        <span className="text-slate-400"> · {r.allocationScope}</span>
                      </div>
                      {!unlimited ? (
                        <div className="text-slate-500">
                          {a.total.calls ? `${num(a.total.calls)} calls ` : ""}
                          {a.total.tokens ? `${compact(a.total.tokens)} tok ` : ""}
                          {a.total.costUsd ? usd(a.total.costUsd) : ""}
                        </div>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: "actions",
                label: "",
                align: "right",
                render: (r) =>
                  r.userId ? (
                    <button type="button" className={BTN} onClick={() => setEditUser(r)}>
                      Set limits
                    </button>
                  ) : null,
              },
            ]}
          />
        </div>
      ) : null}

      {/* ── allocations ── */}
      {tab === "allocations" ? (
        <div className="space-y-4">
          <AllocationForm
            title="Platform default & master switch"
            subtitle="The allowance every signed-in user gets unless they have their own, the shared ceiling for anonymous visitors, and the switches that turn AI off everywhere."
            features={features}
            value={defaultAlloc}
            onSave={saveDefaultAllocation}
            saving={saving}
            isDefault
          />

          <div className={`${CARD} p-4`}>
            <h3 className="font-semibold mb-2">Per-user overrides ({userAllocs.length})</h3>
            <Table
              rows={userAllocs.map((a) => ({ ...a, _key: a._id }))}
              empty="No per-user overrides — everyone is on the platform default."
              columns={[
                { key: "email", label: "User", render: (a) => a.email || String(a.userId) },
                {
                  key: "enabled",
                  label: "AI",
                  render: (a) =>
                    a.enabled ? (
                      <span className="text-emerald-600">enabled</span>
                    ) : (
                      <span className="text-red-600 font-semibold">disabled</span>
                    ),
                },
                {
                  key: "total",
                  label: "Monthly cap",
                  render: (a) =>
                    a.total.calls || a.total.tokens || a.total.costUsd
                      ? `${a.total.calls ? `${num(a.total.calls)} calls · ` : ""}${
                          a.total.tokens ? `${compact(a.total.tokens)} tok · ` : ""
                        }${a.total.costUsd ? usd(a.total.costUsd) : ""}`.replace(/ · $/, "")
                      : "Unlimited",
                },
                {
                  key: "features",
                  label: "Per-feature",
                  render: (a) => {
                    const entries = Object.entries(a.features || {});
                    if (!entries.length) return "—";
                    return entries.map(([k, lim], i) => (
                      <span key={k}>
                        {i ? ", " : ""}
                        <span className={lim?.enabled === false ? "text-red-600 font-semibold" : ""}>
                          {features.find((f) => f.key === k)?.label || k}
                          {lim?.enabled === false ? " (off)" : ""}
                        </span>
                      </span>
                    ));
                  },
                },
                { key: "notes", label: "Notes" },
                {
                  key: "updated",
                  label: "Updated",
                  render: (a) => (
                    <div className="text-[11px] text-slate-500">
                      {day(a.updatedAt)}
                      {a.updatedByEmail ? ` · ${a.updatedByEmail}` : ""}
                    </div>
                  ),
                },
                {
                  key: "actions",
                  label: "",
                  align: "right",
                  render: (a) => (
                    <button
                      type="button"
                      className={BTN}
                      onClick={() =>
                        setEditUser({ userId: a.userId, email: a.email, allocation: a })
                      }
                    >
                      Edit
                    </button>
                  ),
                },
              ]}
            />
          </div>
        </div>
      ) : null}

      {/* ── call log ── */}
      {tab === "events" ? (
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-semibold">Call log</h2>
              <p className="text-xs text-slate-500 dark:text-adlm-dark-muted">
                Every metered call, newest first. Use this to trace a spend spike back to the exact
                requests.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={errorsOnly}
                  onChange={(e) => setErrorsOnly(e.target.checked)}
                />
                Failures only
              </label>
              <input
                className={INPUT}
                style={{ minWidth: 200 }}
                placeholder="Exact email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadEvents()}
              />
              <button type="button" className={BTN} onClick={loadEvents}>
                Search
              </button>
            </div>
          </div>

          <Table
            rows={events.map((e) => ({ ...e, _key: e._id }))}
            empty="No calls in this window."
            columns={[
              { key: "at", label: "When", render: (e) => dt(e.at) },
              {
                key: "feature",
                label: "Feature",
                render: (e) => features.find((f) => f.key === e.feature)?.label || e.feature,
              },
              { key: "email", label: "User", render: (e) => e.email || "(guest)" },
              { key: "model", label: "Model", render: (e) => e.model || "—" },
              {
                key: "tokens",
                label: "Tokens",
                align: "right",
                render: (e) => (
                  <div>
                    <div>{num(e.totalTokens)}</div>
                    <div className="text-[11px] text-slate-500">
                      {e.tokenSource === "estimated" ? "estimated" : e.tokenSource}
                    </div>
                  </div>
                ),
              },
              { key: "costUsd", label: "Cost", align: "right", render: (e) => usd4(e.costUsd) },
              { key: "ms", label: "ms", align: "right", render: (e) => num(e.ms) },
              {
                key: "ok",
                label: "Result",
                render: (e) =>
                  e.ok ? (
                    <span className="text-emerald-600">ok</span>
                  ) : (
                    <span className="text-red-600" title={e.errorCode}>
                      {e.errorCode || "failed"}
                    </span>
                  ),
              },
            ]}
          />
        </div>
      ) : null}

      {/* per-user allocation modal */}
      {editUser ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4"
          onClick={(e) => e.target === e.currentTarget && setEditUser(null)}
        >
          <div className="w-full max-w-2xl my-8">
            <AllocationForm
              title={`Allowance — ${editUser.email || editUser.userId}`}
              subtitle="Overrides the platform default for this account only. 0 means unlimited; untick 'AI enabled' to switch AI off entirely for them."
              features={features}
              value={editUser.allocation}
              saving={saving}
              onSave={(form) => saveUserAllocation(editUser.userId, form)}
              onReset={() => resetUserAllocation(editUser.userId)}
            />
            <div className="text-center mt-2">
              <button
                type="button"
                className="text-white/80 text-sm underline"
                onClick={() => setEditUser(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
