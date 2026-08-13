// client/src/pages/AdminWhatsApp.jsx
// The WhatsApp queue board — the nine working queues from the chat management
// instructions, each a backlog worked oldest-first. Open a chat to read the
// transcript, take ownership, clear an ops flag, or move its stage.
// Gated by the "whatsapp" permission area.
import React from "react";
import { FiUsers } from "../components/icons.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

const PRIORITY_TONE = {
  P1: "bg-red-100 text-red-700 ring-red-200",
  P2: "bg-amber-100 text-amber-700 ring-amber-200",
  P3: "bg-blue-100 text-blue-700 ring-blue-200",
  P4: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STAGES = [
  "01-New", "02-Enquiry", "03-Hot", "04-Customer",
  "05-Waitlist", "06-Dormant", "07-Lost",
];

const OPS_LABEL = {
  "x-NeedsHuman": "Needs human",
  "x-PaymentIssue": "Payment issue",
  "x-Unhappy": "Unhappy",
};

/** How long a chat has been sitting. The number the queues exist to shrink. */
function waitingFor(d) {
  if (!d) return "—";
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function fmt(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

function Pill({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${className}`}>
      {children}
    </span>
  );
}

/* ------------------------------ detail drawer ------------------------------ */
function ChatDrawer({ phone, onClose, onChanged }) {
  const { user } = useAuth();
  // Whoever takes a chat has to be identifiable on the board — "me" is only
  // meaningful to the person who clicked it.
  const meName = user?.firstName || user?.email || "staff";
  const [chat, setChat] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setChat(await apiAuthed(`/admin/whatsapp/chats/${encodeURIComponent(phone)}`));
    } catch (e) {
      setErr(e?.message || "Could not load this chat");
    }
  }, [phone]);

  React.useEffect(() => { load(); }, [load]);

  async function patch(body) {
    setBusy(true);
    setErr("");
    try {
      await apiAuthed(`/admin/whatsapp/chats/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        data: body,
      });
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full overflow-y-auto bg-white dark:bg-adlm-dark-panel p-5 shadow-depth-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-lg truncate">{chat?.name || phone}</div>
            <div className="text-sm text-slate-500">
              {chat?.firm ? `${chat.firm} · ` : ""}{phone}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
        {!chat ? (
          <div className="mt-6 text-slate-500">Loading…</div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Pill className={PRIORITY_TONE[chat.priority] || PRIORITY_TONE.P4}>{chat.priority}</Pill>
              <Pill className="bg-slate-100 text-slate-700 ring-slate-200">{chat.stage}</Pill>
              {chat.intent ? <Pill className="bg-indigo-100 text-indigo-700 ring-indigo-200">{chat.intent}</Pill> : null}
              {(chat.products || []).map((p) => (
                <Pill key={p} className="bg-emerald-50 text-emerald-700 ring-emerald-200">{p}</Pill>
              ))}
              {(chat.ops || []).map((o) => (
                <Pill key={o} className="bg-red-50 text-red-700 ring-red-200">{OPS_LABEL[o] || o}</Pill>
              ))}
            </div>

            {chat.next_action ? (
              <div className="mt-4 rounded-lg bg-blue-50 ring-1 ring-blue-200 p-3">
                <div className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">Next action</div>
                <div className="text-sm text-slate-800 mt-1">{chat.next_action}</div>
              </div>
            ) : null}

            {chat.notes ? (
              <div className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{chat.notes}</div>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-slate-500">Language</dt><dd>{chat.language || "—"}</dd></div>
              <div><dt className="text-slate-500">Region</dt><dd>{chat.region || "—"}</dd></div>
              <div><dt className="text-slate-500">Owner</dt><dd>{chat.owner || "bot"}</dd></div>
              <div><dt className="text-slate-500">Follow-up</dt><dd>{chat.follow_up_on ? fmt(chat.follow_up_on) : "—"}</dd></div>
              <div><dt className="text-slate-500">First seen</dt><dd>{fmt(chat.first_seen)}</dd></div>
              <div><dt className="text-slate-500">Last message</dt><dd>{fmt(chat.last_message)}</dd></div>
            </dl>

            {/* Sync and tagging health. Shown because a chat that silently failed
                to tag or reach the CRM looks identical to a healthy one. */}
            {(chat.crmError || chat.tagError || chat.tagRejections?.length) ? (
              <div className="mt-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3 text-xs text-amber-800">
                {chat.crmError ? <div>CRM: {chat.crmError}</div> : null}
                {chat.tagError ? <div>Tagging: {chat.tagError}</div> : null}
                {chat.tagRejections?.length ? <div>Dropped tags: {chat.tagRejections.join(", ")}</div> : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {chat.owner && chat.owner !== "bot" ? (
                <button
                  disabled={busy}
                  onClick={() => patch({ owner: "bot" })}
                  className="px-3 py-1.5 rounded-lg ring-1 ring-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Release ({chat.owner})
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => patch({ owner: meName })}
                  className="px-3 py-1.5 rounded-lg bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] disabled:opacity-50"
                >
                  Take ownership
                </button>
              )}
              {(chat.ops || []).map((o) => (
                <button
                  key={o}
                  disabled={busy}
                  onClick={() => patch({ clearOps: [o] })}
                  className="px-3 py-1.5 rounded-lg ring-1 ring-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Resolve “{OPS_LABEL[o] || o}”
                </button>
              ))}
              <select
                disabled={busy}
                value={chat.stage || ""}
                onChange={(e) => patch({ stage: e.target.value })}
                className="px-2 py-1.5 rounded-lg ring-1 ring-slate-300 text-sm bg-white"
              >
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <a
                href={`https://wa.me/${String(phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              >
                Open in WhatsApp
              </a>
            </div>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                Transcript{chat.transcriptPurgedAt ? " (purged — older than retention)" : ""}
              </div>
              <div className="space-y-2">
                {(chat.transcript || []).map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-slate-100 text-slate-800"
                        : "bg-blue-50 text-slate-800 ml-6"
                    }`}
                  >
                    <div className="text-[10px] uppercase text-slate-500 mb-0.5">
                      {m.role === "user" ? "Customer" : "Bot"} · {fmt(m.at)}
                    </div>
                    {m.text}
                  </div>
                ))}
                {!(chat.transcript || []).length ? (
                  <div className="text-sm text-slate-500">No transcript.</div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */
export default function AdminWhatsApp() {
  const [queues, setQueues] = React.useState([]);
  const [active, setActive] = React.useState("Hot Leads");
  const [rows, setRows] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const loadQueues = React.useCallback(async () => {
    try {
      const [q, s] = await Promise.all([
        apiAuthed("/admin/whatsapp/queues"),
        apiAuthed("/admin/whatsapp/summary"),
      ]);
      setQueues(q.queues || []);
      setSummary(s);
    } catch (e) {
      setErr(e?.message || "Could not load queues");
    }
  }, []);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ list: active, limit: "50" });
      if (search.trim()) params.set("q", search.trim());
      const data = await apiAuthed(`/admin/whatsapp/chats?${params}`);
      setRows(data.items || []);
      setTotal(data.total || 0);
      setErr("");
    } catch (e) {
      setErr(e?.message || "Could not load chats");
    } finally {
      setLoading(false);
    }
  }, [active, search]);

  React.useEffect(() => { loadQueues(); }, [loadQueues]);
  React.useEffect(() => { loadRows(); }, [loadRows]);

  const refresh = () => { loadQueues(); loadRows(); };
  const a = summary?.attention;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <AdminPageHeader
        title="WhatsApp Queues"
        subtitle="Conversations from the WhatsApp assistant, worked oldest first"
        icon={FiUsers}
        actions={
          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded-lg bg-white/10 ring-1 ring-white/30 text-sm hover:bg-white/15"
          >
            Refresh
          </button>
        }
      />

      {/* The numbers that should be zero or small. Reported as they are. */}
      {a ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            ["Open P1", a.openP1, a.openP1 > 0 ? "text-red-600" : "text-emerald-600"],
            ["Awaiting human", a.awaitingHuman, a.awaitingHuman > 0 ? "text-amber-600" : "text-emerald-600"],
            ["Follow-ups due", a.followUpsDue, a.followUpsDue > 0 ? "text-amber-600" : "text-slate-700"],
            ["Tagging failures", a.tagFailures, a.tagFailures > 0 ? "text-red-600" : "text-emerald-600"],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl bg-white dark:bg-adlm-dark-panel ring-1 ring-slate-200 dark:ring-adlm-dark-border p-4 shadow-depth">
              <div className={`text-2xl font-bold ${tone}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-4">
        {queues.map((q) => (
          <button
            key={q.name}
            onClick={() => setActive(q.name)}
            className={`px-3 py-1.5 rounded-lg text-sm ring-1 transition ${
              active === q.name
                ? "bg-adlm-blue-700 text-white ring-adlm-blue-700"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {q.name}
            <span className={`ml-1.5 text-xs ${active === q.name ? "text-blue-100" : "text-slate-400"}`}>
              {q.count}
            </span>
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search phone, name, firm or notes…"
        className="w-full md:w-80 mb-4 px-3 py-2 rounded-lg ring-1 ring-slate-300 text-sm"
      />

      {err ? <div className="mb-3 text-sm text-red-600">{err}</div> : null}

      <div className="rounded-xl bg-white dark:bg-adlm-dark-panel ring-1 ring-slate-200 dark:ring-adlm-dark-border shadow-depth overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-adlm-dark-bg text-left">
            <tr className="text-slate-600">
              <th className="p-3 font-medium">Contact</th>
              <th className="p-3 font-medium">Tags</th>
              <th className="p-3 font-medium">Next action</th>
              <th className="p-3 font-medium">Waiting</th>
              <th className="p-3 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">Loading…</td></tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  Nothing in <b>{active}</b>. That is the good state for this queue.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.phone}
                  onClick={() => setOpen(r.phone)}
                  className="border-t border-slate-100 dark:border-adlm-dark-border hover:bg-slate-50 dark:hover:bg-adlm-dark-bg cursor-pointer"
                >
                  <td className="p-3">
                    <div className="font-medium">{r.name || r.phone}</div>
                    <div className="text-xs text-slate-500">
                      {r.firm ? `${r.firm} · ` : ""}{r.phone}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Pill className={PRIORITY_TONE[r.priority] || PRIORITY_TONE.P4}>{r.priority}</Pill>
                      <Pill className="bg-slate-100 text-slate-700 ring-slate-200">{r.stage}</Pill>
                      {(r.products || []).slice(0, 2).map((p) => (
                        <Pill key={p} className="bg-emerald-50 text-emerald-700 ring-emerald-200">{p}</Pill>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-slate-600 max-w-xs truncate">{r.next_action || "—"}</td>
                  <td className="p-3 whitespace-nowrap">{waitingFor(r.last_message)}</td>
                  <td className="p-3 text-slate-600">{r.owner === "bot" ? "—" : r.owner}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > rows.length ? (
        <div className="mt-2 text-xs text-slate-500">
          Showing {rows.length} of {total}.
        </div>
      ) : null}

      {open ? (
        <ChatDrawer phone={open} onClose={() => setOpen(null)} onChanged={refresh} />
      ) : null}
    </div>
  );
}
