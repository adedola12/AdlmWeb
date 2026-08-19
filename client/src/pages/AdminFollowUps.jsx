// client/src/pages/AdminFollowUps.jsx
//
// The renewal call desk. Everyone whose subscription has expired, or whose
// purchase is still sitting unapproved, in one worklist — with the phone
// number, what lapsed, how long ago, and somewhere to write down what was said.
//
// The row expands into a call form rather than opening a modal on purpose:
// whoever is working this list is on the phone, and losing the surrounding
// context (which product, how overdue, what they said last time) mid-call is
// exactly what makes people stop using a tool like this.
//
// Gated by the "followups" permission area.
import React from "react";
import {
  IconPhone,
  FaWhatsapp,
  FiRotateCcw,
  FiClock,
  IconAlertCircle,
} from "../components/icons.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config.js";

const OUTCOME_LABELS = {
  reached: "Spoke to them",
  renewed: "Renewing / paid",
  callback: "Call me back",
  not_interested: "Not interested",
  no_answer: "No answer",
  voicemail: "Left voicemail",
  wrong_number: "Wrong number",
  unreachable: "Unreachable",
};

const STATUS_LABELS = {
  to_call: "To call",
  in_progress: "In progress",
  snoozed: "Snoozed",
  done: "Done",
};

const statusTone = {
  to_call: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  snoozed: "bg-violet-100 text-violet-700",
  done: "bg-green-100 text-green-700",
};

const reasonTone = {
  expired: "bg-rose-100 text-rose-700",
  pending: "bg-sky-100 text-sky-700",
};

const REASON_LABELS = { expired: "Expired", pending: "Unpaid order" };

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}
function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString() : "—";
}
function money(amount, currency) {
  const n = Number(amount || 0);
  if (!n) return "";
  return `${currency === "USD" ? "$" : "₦"}${n.toLocaleString()}`;
}
// yyyy-mm-dd in LOCAL time — toISOString() would shift the date backwards for
// anyone west of UTC and schedule the callback a day early.
function toDateInput(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// tel:/wa.me links need the digits only; wa.me additionally wants the country
// code, and Nigerian numbers are habitually written with a trunk 0.
function telHref(phone) {
  const d = String(phone || "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : "";
}
function waHref(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = `234${d.slice(1)}`;
  return `https://wa.me/${d}`;
}

/* ───────────────────────── call form ───────────────────────── */

function CallForm({ item, outcomes, onLog, busy }) {
  const [outcome, setOutcome] = React.useState("reached");
  const [channel, setChannel] = React.useState("phone");
  const [note, setNote] = React.useState("");
  const [next, setNext] = React.useState("");

  // "Call me back" is meaningless without a date, so seed one a week out the
  // moment it is picked rather than letting the call be logged with an empty
  // callback and quietly disappearing off the due list.
  //
  // Keyed on `outcome` alone, deliberately: depending on `next` too would
  // refill the box the instant the caller cleared it, and they would have no
  // way to log a callback without a date.
  React.useEffect(() => {
    if (outcome !== "callback") return;
    setNext((cur) => {
      if (cur) return cur;
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return toDateInput(d);
    });
  }, [outcome]);

  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]"
      onSubmit={(e) => {
        e.preventDefault();
        onLog({
          outcome,
          channel,
          note,
          // Sent as local noon so the date the caller picked is the date that
          // is stored, whatever the server's timezone does to midnight.
          nextFollowUpAt: next ? new Date(`${next}T12:00:00`).toISOString() : null,
        });
        setNote("");
      }}
    >
      <div>
        <label
          className="block text-xs font-medium mb-1"
          htmlFor={`note-${item._id}`}
        >
          What was said
        </label>
        <textarea
          id={`note-${item._id}`}
          className="w-full border rounded p-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          rows={4}
          placeholder="e.g. Wants to renew 2 seats next month, waiting on the client's payment."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div>
          <label
            className="block text-xs font-medium mb-1"
            htmlFor={`outcome-${item._id}`}
          >
            Outcome
          </label>
          <select
            id={`outcome-${item._id}`}
            className="w-full border rounded px-2 py-1.5 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            {(outcomes || []).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o] || o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-xs font-medium mb-1"
            htmlFor={`channel-${item._id}`}
          >
            How
          </label>
          <select
            id={`channel-${item._id}`}
            className="w-full border rounded px-2 py-1.5 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div>
          <label
            className="block text-xs font-medium mb-1"
            htmlFor={`next-${item._id}`}
          >
            Call again on
          </label>
          <input
            id={`next-${item._id}`}
            type="date"
            className="w-full border rounded px-2 py-1.5 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full px-3 py-2 rounded bg-adlm-blue-700 text-white text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Saving…" : "Log this call"}
        </button>
      </div>
    </form>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function AdminFollowUps() {
  const { accessToken } = useAuth();

  const [state, setState] = React.useState({ status: "loading", items: [] });
  const [meta, setMeta] = React.useState({
    counts: { reasons: {}, statuses: {}, due: 0, uncalled: 0 },
    outcomes: [],
    notionEnabled: false,
    lastRebuiltAt: null,
    total: 0,
  });
  const [filters, setFilters] = React.useState({
    reason: "",
    status: "",
    q: "",
    due: false,
    uncalled: false,
    sort: "overdue",
  });
  const [openId, setOpenId] = React.useState("");
  const [busyId, setBusyId] = React.useState("");
  const [banner, setBanner] = React.useState(null);
  const [working, setWorking] = React.useState("");

  const query = React.useMemo(() => {
    const p = new URLSearchParams();
    if (filters.reason) p.set("reason", filters.reason);
    if (filters.status) p.set("status", filters.status);
    if (filters.q) p.set("q", filters.q);
    if (filters.due) p.set("due", "1");
    if (filters.uncalled) p.set("uncalled", "1");
    p.set("sort", filters.sort);
    p.set("limit", "200");
    return p.toString();
  }, [filters]);

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const out = await apiAuthed(`/admin/followups?${query}`, {
        token: accessToken,
      });
      setState({ status: "ready", items: out.items || [] });
      setMeta({
        counts: out.counts || { reasons: {}, statuses: {}, due: 0, uncalled: 0 },
        outcomes: out.outcomes || [],
        notionEnabled: !!out.notionEnabled,
        lastRebuiltAt: out.lastRebuiltAt || null,
        total: out.total || 0,
      });
    } catch (err) {
      setState({
        status: "error",
        items: [],
        error: String(err.message || err),
      });
    }
  }, [accessToken, query]);

  React.useEffect(() => {
    const t = setTimeout(load, filters.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  async function rebuild() {
    setWorking("rebuild");
    setBanner(null);
    try {
      const out = await apiAuthed(`/admin/followups/rebuild`, {
        method: "POST",
        token: accessToken,
        body: {},
      });
      setBanner({
        tone: "ok",
        text: `Refreshed: ${out.total} people to call (${out.created} new, ${out.updated} updated, ${out.retired} no longer due).`,
      });
      await load();
    } catch (err) {
      setBanner({ tone: "err", text: `Could not refresh: ${err.message || err}` });
    } finally {
      setWorking("");
    }
  }

  async function pushAllToCrm() {
    setWorking("notion");
    setBanner(null);
    try {
      const out = await apiAuthed(`/admin/followups/notion/sync-all`, {
        method: "POST",
        token: accessToken,
        body: { onlyMissing: true },
      });
      setBanner({
        tone: out.failed ? "warn" : "ok",
        text:
          `Pushed ${out.synced} contact${out.synced === 1 ? "" : "s"} to the Notion CRM` +
          (out.failed ? `, ${out.failed} failed.` : ".") +
          (out.capped ? " More remain — run it again." : ""),
      });
      await load();
    } catch (err) {
      setBanner({
        tone: "err",
        text: `Could not push to Notion: ${err.message || err}`,
      });
    } finally {
      setWorking("");
    }
  }

  async function logCall(id, body) {
    setBusyId(id);
    try {
      const out = await apiAuthed(`/admin/followups/${id}/calls`, {
        method: "POST",
        token: accessToken,
        body,
      });
      setState((s) => ({
        ...s,
        items: s.items.map((it) => (it._id === id ? out.item : it)),
      }));
    } catch (err) {
      alert(`Could not log the call: ${err.message || err}`);
    } finally {
      setBusyId("");
    }
  }

  async function patch(id, body) {
    setBusyId(id);
    try {
      const out = await apiAuthed(`/admin/followups/${id}`, {
        method: "PATCH",
        token: accessToken,
        body,
      });
      setState((s) => ({
        ...s,
        items: s.items.map((it) => (it._id === id ? out.item : it)),
      }));
    } catch (err) {
      alert(`Could not update: ${err.message || err}`);
    } finally {
      setBusyId("");
    }
  }

  const [exporting, setExporting] = React.useState(false);
  async function exportCsv() {
    setExporting(true);
    let url = "";
    try {
      // Fetched rather than linked: a plain <a href> cannot carry the
      // Authorization header, and putting the token in the query string would
      // leak it into browser history and server logs.
      const res = await fetch(
        `${API_BASE}/admin/followups/export.csv?${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "follow-up-calls.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(`Could not export: ${err.message || err}`);
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExporting(false);
    }
  }

  const { status, items } = state;
  const c = meta.counts;

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        icon={IconPhone}
        title="Follow-up calls"
        subtitle="Everyone with an expired subscription or an unapproved order, and the log of every call made to them."
        actions={
          <>
            <button
              type="button"
              className="px-3 py-2 rounded bg-white/10 ring-1 ring-white/25 text-white text-sm disabled:opacity-60"
              disabled={working === "rebuild"}
              onClick={rebuild}
            >
              {working === "rebuild" ? "Refreshing…" : "Refresh list"}
            </button>
            {meta.notionEnabled ? (
              <button
                type="button"
                className="px-3 py-2 rounded bg-white/10 ring-1 ring-white/25 text-white text-sm disabled:opacity-60"
                disabled={working === "notion"}
                onClick={pushAllToCrm}
              >
                {working === "notion" ? "Pushing…" : "Push new to Notion CRM"}
              </button>
            ) : null}
            <button
              type="button"
              className="px-3 py-2 rounded bg-adlm-orange text-white text-sm disabled:opacity-60"
              disabled={exporting}
              onClick={exportCsv}
            >
              {exporting ? "Preparing…" : "Export CSV"}
            </button>
          </>
        }
      />

      {banner ? (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            banner.tone === "err"
              ? "bg-red-50 text-red-700 ring-1 ring-red-200"
              : banner.tone === "warn"
                ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                : "bg-green-50 text-green-700 ring-1 ring-green-200"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {!meta.notionEnabled ? (
        <p className="mb-4 text-xs text-slate-500 dark:text-adlm-dark-muted flex items-center gap-1.5">
          <IconAlertCircle className="w-3.5 h-3.5" />
          Notion CRM sync is off — set NOTION_API_KEY on the API to push these
          contacts and call logs into the CRM. Everything else works without it.
        </p>
      ) : null}

      {/* ── quick counters ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Expired subscriptions", value: c.reasons?.expired || 0, key: "expired" },
          { label: "Unapproved orders", value: c.reasons?.pending || 0, key: "pending" },
          { label: "Never called", value: c.uncalled || 0, key: "uncalled" },
          { label: "Callbacks due", value: c.due || 0, key: "due" },
        ].map((box) => (
          <button
            key={box.key}
            type="button"
            className="text-left rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-raised p-3 shadow-depth hover:shadow-depth-lg transition"
            onClick={() =>
              setFilters((f) => ({
                ...f,
                reason: box.key === "expired" || box.key === "pending" ? box.key : "",
                uncalled: box.key === "uncalled",
                due: box.key === "due",
              }))
            }
          >
            <div className="text-2xl font-bold">{box.value}</div>
            <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
              {box.label}
            </div>
          </button>
        ))}
      </div>

      {/* ── filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          className="border rounded px-3 py-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          value={filters.reason}
          onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))}
        >
          <option value="">All reasons</option>
          <option value="expired">Expired subscription</option>
          <option value="pending">Unapproved order</option>
        </select>

        <select
          className="border rounded px-3 py-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
              {c.statuses?.[k] ? ` (${c.statuses[k]})` : ""}
            </option>
          ))}
        </select>

        <select
          className="border rounded px-3 py-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
        >
          <option value="overdue">Longest lapsed first</option>
          <option value="due">Callback due first</option>
          <option value="recent">Recently updated</option>
          <option value="name">Name</option>
        </select>

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.due}
            onChange={(e) => setFilters((f) => ({ ...f, due: e.target.checked }))}
          />
          Callbacks due
        </label>

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.uncalled}
            onChange={(e) =>
              setFilters((f) => ({ ...f, uncalled: e.target.checked }))
            }
          />
          Never called
        </label>

        <input
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px] dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          placeholder="Search name, email, phone or company"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-adlm-dark-muted mb-3">
        {meta.total} in this view · list last refreshed{" "}
        {meta.lastRebuiltAt ? fmtDateTime(meta.lastRebuiltAt) : "never"}
      </p>

      {status === "loading" && <p className="text-slate-500">Loading…</p>}
      {status === "error" && (
        <p className="text-red-600">Could not load the list: {state.error}</p>
      )}

      {status === "ready" && items.length === 0 && (
        <p className="text-slate-500">
          Nobody to call in this view. Hit “Refresh list” to rebuild it from the
          current subscriptions and orders.
        </p>
      )}

      {status === "ready" && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-adlm-dark-border">
                <th className="py-2 pr-3">Who</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Why</th>
                <th className="py-2 pr-3">Outstanding</th>
                <th className="py-2 pr-3">Last call</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const name =
                  [it.firstName, it.lastName].filter(Boolean).join(" ") ||
                  "(no name on file)";
                const open = openId === it._id;

                return (
                  <React.Fragment key={it._id}>
                    <tr className="border-b dark:border-adlm-dark-border align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{name}</div>
                        {it.firmName ? (
                          <div className="text-xs text-slate-500">{it.firmName}</div>
                        ) : null}
                        {it.hasActiveOther ? (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            still active on another product
                          </span>
                        ) : null}
                        {it.accountDisabled ? (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            account disabled
                          </span>
                        ) : null}
                      </td>

                      <td className="py-2 pr-3">
                        <a
                          className="text-adlm-blue-700 hover:underline break-all"
                          href={`mailto:${it.email}`}
                        >
                          {it.email}
                        </a>
                        <div className="mt-1 flex items-center gap-2">
                          {it.phone ? (
                            <>
                              <a
                                className="inline-flex items-center gap-1 text-xs text-adlm-blue-700 hover:underline"
                                href={telHref(it.phone)}
                              >
                                <IconPhone className="w-3.5 h-3.5" />
                                {it.phone}
                              </a>
                              <a
                                className="inline-flex items-center text-green-600"
                                title="Open in WhatsApp"
                                href={waHref(it.phone)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FaWhatsapp className="w-4 h-4" />
                              </a>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">
                              no phone number
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {(it.reasons || []).map((r) => (
                            <span
                              key={r}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${reasonTone[r] || ""}`}
                            >
                              {REASON_LABELS[r] || r}
                            </span>
                          ))}
                        </div>
                        {it.maxDaysOverdue ? (
                          <div className="text-xs text-slate-500 mt-1">
                            {it.maxDaysOverdue} days lapsed
                          </div>
                        ) : null}
                      </td>

                      <td className="py-2 pr-3">
                        {(it.products || []).map((p) => (
                          <div key={p.productKey} className="text-xs">
                            <span className="font-medium">{p.productName}</span>{" "}
                            <span className="text-slate-500">
                              expired {fmtDate(p.expiresAt)}
                              {p.seats > 1 ? ` · ${p.seats} seats` : ""}
                            </span>
                          </div>
                        ))}
                        {(it.purchases || []).map((q) => (
                          <div key={String(q.purchaseId)} className="text-xs">
                            <span className="font-medium">{q.items}</span>{" "}
                            <span className="text-slate-500">
                              {money(q.total, q.currency)} · {q.ageDays}d old
                              {q.hasReceipt ? " · receipt uploaded" : ""}
                            </span>
                          </div>
                        ))}
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        {it.callCount ? (
                          <>
                            <div className="text-xs">
                              {OUTCOME_LABELS[it.lastOutcome] || it.lastOutcome}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {fmtDate(it.lastCalledAt)} · {it.callCount} call
                              {it.callCount === 1 ? "" : "s"}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">not called</span>
                        )}
                        {it.nextFollowUpAt ? (
                          <div className="text-[11px] mt-0.5 inline-flex items-center gap-1 text-violet-700">
                            <FiClock className="w-3 h-3" />
                            {fmtDate(it.nextFollowUpAt)}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-2 pr-3">
                        <select
                          className={`text-xs rounded px-2 py-1 ${statusTone[it.status] || ""}`}
                          value={it.status}
                          disabled={busyId === it._id}
                          onChange={(e) => patch(it._id, { status: e.target.value })}
                        >
                          {Object.entries(STATUS_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {it.assignedToName ? (
                          <div className="text-[11px] text-slate-500 mt-1">
                            {it.assignedToName}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => setOpenId(open ? "" : it._id)}
                        >
                          {open ? "Close" : "Log a call"}
                        </button>
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-b dark:border-adlm-dark-border bg-slate-50/60 dark:bg-adlm-dark-panel/40">
                        <td colSpan={7} className="py-3 px-3">
                          <CallForm
                            item={it}
                            outcomes={meta.outcomes}
                            busy={busyId === it._id}
                            onLog={(body) => logCall(it._id, body)}
                          />

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold mb-1.5">
                                Call history
                              </div>
                              {(it.calls || []).length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  No calls logged yet.
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {[...(it.calls || [])]
                                    .reverse()
                                    .map((call, i) => (
                                      <li
                                        key={call._id || i}
                                        className="text-xs border-l-2 border-adlm-blue-700/40 pl-2"
                                      >
                                        <div className="font-medium">
                                          {OUTCOME_LABELS[call.outcome] ||
                                            call.outcome}
                                          <span className="font-normal text-slate-500">
                                            {" "}
                                            · {call.channel} ·{" "}
                                            {fmtDateTime(call.at)}
                                            {call.byName ? ` · ${call.byName}` : ""}
                                          </span>
                                        </div>
                                        {call.note ? (
                                          <div className="text-slate-600 dark:text-adlm-dark-muted whitespace-pre-wrap">
                                            {call.note}
                                          </div>
                                        ) : null}
                                        {call.nextFollowUpAt ? (
                                          <div className="text-violet-700">
                                            Call again {fmtDate(call.nextFollowUpAt)}
                                          </div>
                                        ) : null}
                                      </li>
                                    ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <label
                                className="block text-xs font-semibold mb-1.5"
                                htmlFor={`standing-${it._id}`}
                              >
                                Standing note about this account
                              </label>
                              <textarea
                                id={`standing-${it._id}`}
                                className="w-full border rounded p-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
                                rows={3}
                                defaultValue={it.note || ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (it.note || "")) {
                                    patch(it._id, { note: e.target.value });
                                  }
                                }}
                              />
                              <p className="text-[11px] text-slate-500 mt-1">
                                Saved when you click away.
                              </p>

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="text-xs px-2 py-1 rounded border dark:border-adlm-dark-border"
                                  disabled={busyId === it._id}
                                  onClick={() =>
                                    patch(
                                      it._id,
                                      it.assignedToName
                                        ? { unassign: true }
                                        : { assignToMe: true },
                                    )
                                  }
                                >
                                  {it.assignedToName ? "Unassign" : "Assign to me"}
                                </button>

                                {meta.notionEnabled ? (
                                  <button
                                    type="button"
                                    className="text-xs px-2 py-1 rounded border dark:border-adlm-dark-border inline-flex items-center gap-1"
                                    disabled={busyId === it._id}
                                    onClick={async () => {
                                      setBusyId(it._id);
                                      try {
                                        const out = await apiAuthed(
                                          `/admin/followups/${it._id}/notion`,
                                          { method: "POST", token: accessToken },
                                        );
                                        setState((s) => ({
                                          ...s,
                                          items: s.items.map((x) =>
                                            x._id === it._id ? out.item : x,
                                          ),
                                        }));
                                      } catch (err) {
                                        alert(
                                          `Notion push failed: ${err.message || err}`,
                                        );
                                      } finally {
                                        setBusyId("");
                                      }
                                    }}
                                  >
                                    <FiRotateCcw className="w-3 h-3" />
                                    {it.notion?.contactPageId
                                      ? "Re-sync to CRM"
                                      : "Add to CRM"}
                                  </button>
                                ) : null}

                                {it.notion?.contactPageId ? (
                                  <a
                                    className="text-xs text-adlm-blue-700 underline"
                                    href={`https://www.notion.so/${String(
                                      it.notion.contactPageId,
                                    ).replace(/-/g, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open in Notion
                                  </a>
                                ) : null}
                              </div>

                              {it.notion?.lastError ? (
                                <p className="text-[11px] text-red-600 mt-1">
                                  Last CRM sync failed: {it.notion.lastError}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
