// client/src/pages/AdminSupportTickets.jsx
// Admin view to triage support tickets — filter by status, open a ticket to see
// the AnyDesk address + full detail, change status, schedule a fix date, add
// internal notes, or delete. Gated by the "support" permission area.
import React from "react";
import { FiLifeBuoy } from "react-icons/fi";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

const STATUSES = ["open", "scheduled", "in-progress", "resolved", "closed"];

const statusTone = {
  open: "bg-red-100 text-red-700",
  scheduled: "bg-amber-100 text-amber-700",
  "in-progress": "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-slate-200 text-slate-600",
};

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

// Format a Date for <input type="datetime-local"> in the admin's local time.
function toLocalInputValue(d) {
  const dt = new Date(d);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
}

// Calendar helpers for the scheduled fix — 1-hour slot from the scheduled time.
function calendarEvent(t) {
  const start = new Date(t.scheduledForFixingAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const title = `ADLM support: ${t.title}`;
  const details = [
    `Support session for ${t.userFullName || t.userEmail}`,
    t.userEmail ? `Email: ${t.userEmail}` : "",
    t.whatsapp ? `WhatsApp: ${t.whatsapp}` : "",
    t.anyDeskAddress ? `AnyDesk: ${t.anyDeskAddress}` : "",
    `Ticket: ${t._id}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { start, end, title, details };
}

function googleCalendarUrl(t) {
  const { start, end, title, details } = calendarEvent(t);
  const fmt = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(t) {
  const { start, end, title, details } = calendarEvent(t);
  const fmt = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADLM Studio//Support//EN",
    "BEGIN:VEVENT",
    `UID:adlm-support-${t._id}@adlmstudio.net`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `adlm-support-${t._id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSupportTickets() {
  const { accessToken } = useAuth();

  const [tickets, setTickets] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [search, setSearch] = React.useState("");

  const [sel, setSel] = React.useState(null); // selected ticket (detail)
  const [edit, setEdit] = React.useState({ status: "", scheduledForFixingAt: "", adminNotes: "" });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await apiAuthed("/admin/support-tickets", {
        token: accessToken,
        params: { status: statusFilter || undefined, search: search || undefined },
      });
      setTickets(Array.isArray(res?.tickets) ? res.tickets : []);
    } catch (e) {
      setMsg(e?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [accessToken, statusFilter, search]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function openTicket(t) {
    setSel(t);
    setEdit({
      status: t.status,
      scheduledForFixingAt: t.scheduledForFixingAt
        ? toLocalInputValue(t.scheduledForFixingAt)
        : "",
      adminNotes: t.adminNotes || "",
    });
    setMsg("");
  }

  async function save() {
    if (!sel) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await apiAuthed(`/admin/support-tickets/${sel._id}`, {
        token: accessToken,
        method: "PATCH",
        body: {
          status: edit.status,
          scheduledForFixingAt: edit.scheduledForFixingAt
            ? new Date(edit.scheduledForFixingAt).toISOString()
            : null,
          adminNotes: edit.adminNotes,
        },
      });
      setSel(res?.ticket || null);
      setMsg("Saved.");
      load();
    } catch (e) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!sel) return;
    if (!window.confirm("Delete this ticket permanently?")) return;
    try {
      await apiAuthed(`/admin/support-tickets/${sel._id}`, {
        token: accessToken,
        method: "DELETE",
      });
      setSel(null);
      load();
    } catch (e) {
      setMsg(e?.message || "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={FiLifeBuoy}
        title="Support Tickets"
        subtitle="Triage user-raised issues, schedule fixes & connect via AnyDesk."
      />

      {sel ? (
        <div className="card space-y-4">
          <button
            className="text-sm text-adlm-blue-700 hover:underline"
            onClick={() => setSel(null)}
          >
            ← Back to all tickets
          </button>

          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{sel.title}</h2>
              <div className="text-xs text-slate-500">
                {sel.userFullName} · {sel.userEmail}
                {sel.whatsapp ? ` · ${sel.whatsapp}` : ""} · {fmtDate(sel.createdAt)}
              </div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${statusTone[sel.status] || "bg-slate-100"}`}>
              {sel.status}
            </span>
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Description</div>
            <p className="text-sm whitespace-pre-wrap">{sel.description}</p>
          </div>

          {Array.isArray(sel.images) && sel.images.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
                Screenshots ({sel.images.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {sel.images.map((im, i) => (
                  <a key={im.url} href={im.url} target="_blank" rel="noreferrer" title="Open full size">
                    <img
                      src={im.url}
                      alt={`Screenshot ${i + 1}`}
                      className="h-24 w-24 object-cover rounded-lg border border-slate-200 hover:opacity-80"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">AnyDesk</div>
              <div className="text-sm font-mono">{sel.anyDeskAddress || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Category</div>
              <div className="text-sm capitalize">{sel.category}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Product</div>
              <div className="text-sm">{sel.productKey || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Raised from</div>
              <div className="text-sm">
                {sel.source || "web"}{sel.appVersion ? ` v${sel.appVersion}` : ""}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Status</label>
              <select
                className="input"
                value={edit.status}
                onChange={(e) => setEdit((s) => ({ ...s, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Scheduled for fixing</label>
              <input
                type="datetime-local"
                className="input"
                value={edit.scheduledForFixingAt}
                onChange={(e) => setEdit((s) => ({ ...s, scheduledForFixingAt: e.target.value }))}
              />
              {sel.scheduledForFixingAt && (
                <div className="flex items-center gap-3 mt-1.5">
                  <a
                    className="text-xs text-adlm-blue-700 hover:underline"
                    href={googleCalendarUrl(sel)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ➕ Google Calendar
                  </a>
                  <button
                    type="button"
                    className="text-xs text-adlm-blue-700 hover:underline"
                    onClick={() => downloadIcs(sel)}
                  >
                    ⬇ Download .ics
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Internal notes</label>
            <textarea
              className="input min-h-[90px]"
              value={edit.adminNotes}
              onChange={(e) => setEdit((s) => ({ ...s, adminNotes: e.target.value }))}
              placeholder="Notes visible to the team only…"
            />
          </div>

          {msg && <div className="text-sm text-slate-600">{msg}</div>}

          <div className="flex items-center gap-2">
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button className="btn btn-sm bg-red-600 hover:bg-red-700 text-white" onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              className="input w-full sm:w-64"
              placeholder="Search title / email / AnyDesk…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={load}>Refresh</button>
          </div>

          {msg && <div className="text-sm text-red-600 mb-2">{msg}</div>}

          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-slate-500">No tickets found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">From</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Scheduled</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t._id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium">
                        {t.title}
                        {Array.isArray(t.images) && t.images.length > 0 && (
                          <span className="ml-1 text-xs text-slate-400" title={`${t.images.length} screenshot(s)`}>
                            📎{t.images.length}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{t.userEmail}</td>
                      <td className="py-2 pr-3 text-slate-600">{t.productKey || t.source || "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${statusTone[t.status] || "bg-slate-100"}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{fmtDate(t.scheduledForFixingAt)}</td>
                      <td className="py-2 pr-3">{fmtDate(t.createdAt)}</td>
                      <td className="py-2">
                        <button className="text-adlm-blue-700 hover:underline" onClick={() => openTicket(t)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
