// client/src/pages/AdminWaitlist.jsx
// Admin view for the marketing-form captures — the CIVIQ waitlist and the
// solutions enquiries. Filter by form and status, search, work each lead
// through new → contacted → converted, leave a note, export to CSV.
// Gated by the "waitlist" permission area.
import React from "react";
import { FiUsers } from "../components/icons.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config.js";

const STATUSES = ["new", "contacted", "converted", "archived"];

const statusTone = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-blue-100 text-blue-700",
  converted: "bg-green-100 text-green-700",
  archived: "bg-slate-200 text-slate-600",
};

function fmtDate(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

export default function AdminWaitlist() {
  const { accessToken } = useAuth();
  const [state, setState] = React.useState({ status: "loading", items: [] });
  const [topics, setTopics] = React.useState([]);
  const [counts, setCounts] = React.useState({});
  const [filters, setFilters] = React.useState({ topic: "", status: "", q: "" });
  const [busyId, setBusyId] = React.useState("");
  const [openId, setOpenId] = React.useState("");

  const query = React.useMemo(() => {
    const p = new URLSearchParams();
    if (filters.topic) p.set("topic", filters.topic);
    if (filters.status) p.set("status", filters.status);
    if (filters.q) p.set("q", filters.q);
    p.set("limit", "200");
    return p.toString();
  }, [filters]);

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const out = await apiAuthed(`/admin/waitlist?${query}`, { token: accessToken });
      setState({ status: "ready", items: out.items || [] });
      setTopics(out.topics || []);
      setCounts(out.counts || {});
    } catch (err) {
      setState({ status: "error", items: [], error: String(err.message || err) });
    }
  }, [accessToken, query]);

  React.useEffect(() => {
    // Debounced so typing in the search box does not fire a request per key.
    const t = setTimeout(load, filters.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  const [exporting, setExporting] = React.useState(false);

  async function exportCsv() {
    setExporting(true);
    let url = "";
    try {
      const res = await fetch(`${API_BASE}/admin/waitlist/export.csv?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "waitlist.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(`Could not export: ${err.message || err}`);
    } finally {
      // Revoking immediately can cancel the download in some browsers.
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExporting(false);
    }
  }

  async function patch(id, body) {
    setBusyId(id);
    try {
      const out = await apiAuthed(`/admin/waitlist/${id}`, {
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

  async function remove(id, email) {
    if (!window.confirm(`Delete the entry for ${email}? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await apiAuthed(`/admin/waitlist/${id}`, { method: "DELETE", token: accessToken });
      setState((s) => ({ ...s, items: s.items.filter((it) => it._id !== id) }));
    } catch (err) {
      alert(`Could not delete: ${err.message || err}`);
    } finally {
      setBusyId("");
    }
  }

  const { status, items } = state;

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        icon={FiUsers}
        title="Waitlist & enquiries"
        subtitle="Submissions from the CIVIQ waitlist and the solutions enquiry forms."
      />

      {/* ── filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          className="border rounded px-3 py-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          value={filters.topic}
          onChange={(e) => setFilters((f) => ({ ...f, topic: e.target.value }))}
        >
          <option value="">All forms</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          className="border rounded px-3 py-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}{counts[s] ? ` (${counts[s]})` : ""}
            </option>
          ))}
        </select>

        <input
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px] dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
          placeholder="Search name, email, organisation or message"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />

        {/* Fetched rather than linked. A plain <a href> cannot carry the
            Authorization header, so it would 401, and putting the token in
            the query string instead would leak it into browser history and
            server logs. Fetch it with the header, then hand the browser a
            blob to save. */}
        <button
          type="button"
          className="px-3 py-2 rounded bg-adlm-orange text-white text-sm disabled:opacity-60"
          disabled={exporting}
          onClick={exportCsv}
        >
          {exporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>

      {status === "loading" && <p className="text-slate-500">Loading…</p>}
      {status === "error" && (
        <p className="text-red-600">Could not load the list: {state.error}</p>
      )}

      {status === "ready" && items.length === 0 && (
        <p className="text-slate-500">
          No entries yet. Submissions from the CIVIQ waitlist and the solutions forms appear here.
        </p>
      )}

      {status === "ready" && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-adlm-dark-border">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Form</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Organisation</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <React.Fragment key={it._id}>
                  <tr className="border-b dark:border-adlm-dark-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(it.createdAt)}</td>
                    <td className="py-2 pr-3">{it.topic}</td>
                    <td className="py-2 pr-3">{it.name}</td>
                    <td className="py-2 pr-3">
                      <a className="text-adlm-blue-700 hover:underline" href={`mailto:${it.email}`}>
                        {it.email}
                      </a>
                      {it.submissions > 1 && (
                        <span className="ml-2 text-xs text-slate-500">×{it.submissions}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{it.org || "—"}</td>
                    <td className="py-2 pr-3">
                      <select
                        className={`text-xs rounded px-2 py-1 ${statusTone[it.status] || ""}`}
                        value={it.status}
                        disabled={busyId === it._id}
                        onChange={(e) => patch(it._id, { status: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-xs underline mr-3"
                        onClick={() => setOpenId(openId === it._id ? "" : it._id)}
                      >
                        {openId === it._id ? "Hide" : "Details"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-600 underline"
                        disabled={busyId === it._id}
                        onClick={() => remove(it._id, it.email)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>

                  {openId === it._id && (
                    <tr className="border-b dark:border-adlm-dark-border">
                      <td colSpan={7} className="py-3 pr-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            {it.civil3d && (
                              <p className="mb-2">
                                <strong>Civil 3D:</strong> {it.civil3d}
                              </p>
                            )}
                            <p className="mb-2">
                              <strong>What they measure:</strong>
                              <br />
                              {it.message || "—"}
                            </p>
                            <p className="text-xs text-slate-500">
                              Submitted from {it.sourcePath || "—"}
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs mb-1" htmlFor={`note-${it._id}`}>
                              Internal note
                            </label>
                            <textarea
                              id={`note-${it._id}`}
                              className="w-full border rounded p-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
                              rows={4}
                              defaultValue={it.note || ""}
                              onBlur={(e) => {
                                if (e.target.value !== (it.note || "")) {
                                  patch(it._id, { note: e.target.value });
                                }
                              }}
                            />
                            <p className="text-xs text-slate-500 mt-1">Saved when you click away.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
