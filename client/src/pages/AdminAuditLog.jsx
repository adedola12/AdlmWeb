// client/src/pages/AdminAuditLog.jsx
// Super-admin view: the audit trail (focused on the break-glass God account)
// plus management of who holds God status. Gated by the admin-exclusive "audit"
// permission area, so only super-admins can reach it.
import React from "react";
import { FiActivity } from "react-icons/fi";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function fmt(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

export default function AdminAuditLog() {
  const { accessToken } = useAuth();

  const [logs, setLogs] = React.useState([]);
  const [godOnly, setGodOnly] = React.useState(true);
  const [actionFilter, setActionFilter] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [accounts, setAccounts] = React.useState([]);
  const [envConfigured, setEnvConfigured] = React.useState(true);
  const [grantEmail, setGrantEmail] = React.useState("");
  const [grantMsg, setGrantMsg] = React.useState("");

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await apiAuthed("/admin/audit-log", {
        token: accessToken,
        params: { godOnly: godOnly ? "true" : undefined, action: actionFilter || undefined, limit: 300 },
      });
      setLogs(Array.isArray(res?.logs) ? res.logs : []);
    } catch (e) {
      setMsg(e?.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [accessToken, godOnly, actionFilter]);

  const loadAccounts = React.useCallback(async () => {
    try {
      const res = await apiAuthed("/admin/audit-log/god-accounts", { token: accessToken });
      setAccounts(Array.isArray(res?.accounts) ? res.accounts : []);
      setEnvConfigured(!!res?.envConfigured);
    } catch {
      /* non-fatal */
    }
  }, [accessToken]);

  React.useEffect(() => {
    const t = setTimeout(loadLogs, 250);
    return () => clearTimeout(t);
  }, [loadLogs]);

  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function grant(revoke = false) {
    const email = grantEmail.trim().toLowerCase();
    if (!email) return;
    setGrantMsg("");
    try {
      const res = await apiAuthed(
        `/admin/audit-log/god-accounts/${revoke ? "revoke" : "grant"}`,
        { token: accessToken, method: "POST", body: { email } },
      );
      setGrantMsg(res?.note || "Done.");
      setGrantEmail("");
      loadAccounts();
    } catch (e) {
      setGrantMsg(e?.message || "Action failed");
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={FiActivity}
        title="Audit Log & Break-glass"
        subtitle="Review privileged (God) account activity and manage who holds it."
      />

      {/* God account management */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Break-glass (God) accounts</h2>
        {!envConfigured && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 p-3 text-sm">
            No emails are listed in <code>GOD_ACCOUNT_EMAILS</code>. God accounts
            stay inactive until an email is added to that env var and the server
            is redeployed — granting the flag here alone is not enough.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-full sm:w-72"
            placeholder="user@example.com"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
          />
          <button className="btn btn-sm" onClick={() => grant(false)}>Grant God</button>
          <button className="btn btn-sm bg-red-600 hover:bg-red-700 text-white" onClick={() => grant(true)}>
            Revoke
          </button>
        </div>
        {grantMsg && <div className="text-sm text-slate-600">{grantMsg}</div>}

        {accounts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Env allow-listed</th>
                  <th className="py-2 pr-3">Active</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a._id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium">{a.email}</td>
                    <td className="py-2 pr-3">{a.role}</td>
                    <td className="py-2 pr-3">{a.envAllowlisted ? "yes" : "no"}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${a.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                        {a.active ? "active" : "inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No God accounts flagged.</div>
        )}
      </div>

      {/* Audit log */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-semibold mr-auto">Activity</h2>
          <label className="text-sm flex items-center gap-1.5">
            <input type="checkbox" checked={godOnly} onChange={(e) => setGodOnly(e.target.checked)} />
            God only
          </label>
          <input
            className="input w-full sm:w-56"
            placeholder="Filter action (e.g. login)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <button className="btn btn-sm" onClick={loadLogs}>Refresh</button>
        </div>

        {msg && <div className="text-sm text-red-600 mb-2">{msg}</div>}

        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-slate-500">No activity recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Request</th>
                  <th className="py-2 pr-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmt(l.createdAt)}</td>
                    <td className="py-2 pr-3">
                      {l.actorEmail || "—"}
                      {l.isGod ? <span className="ml-1 text-[10px] px-1 rounded bg-purple-100 text-purple-700">GOD</span> : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{l.action}</td>
                    <td className="py-2 pr-3 text-slate-600 text-xs">
                      {l.method ? `${l.method} ${l.path || ""}` : "—"}
                      {l.targetEmail ? ` → ${l.targetEmail}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-xs">{l.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
