// src/pages/Admin.jsx
import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.js";
import { apiAuthed } from "../http.js";

const MONTH_CHOICES = [
  { label: "1 month", value: 1 },
  { label: "6 months", value: 6 },
  { label: "1 year", value: 12 },
];

export default function Admin() {
  const { accessToken } = useAuth();
  const [tab, setTab] = React.useState("pending");
  const [users, setUsers] = React.useState([]);
  const [purchases, setPurchases] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const [uRes, pRes] = await Promise.all([
        apiAuthed(`/admin/users${qs}`, { token: accessToken }),
        apiAuthed(`/admin/purchases?status=pending`, { token: accessToken }),
      ]);
      setUsers(uRes);
      setPurchases(pRes);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []); // initial
  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function updateEntitlement(email, productKey, months = 0, status) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/entitlement`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey, months, status }),
      });
      await load();
      setMsg("Entitlement updated");
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function setDisabled(email, disabled) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/disable`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, disabled }),
      });
      await load();
      setMsg("User status updated");
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function approvePurchase(id, months) {
    setMsg("");
    try {
      await apiAuthed(`/admin/purchases/${id}/approve`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });
      await load();
      setMsg("Purchase approved & entitlement applied");
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function rejectPurchase(id) {
    setMsg("");
    try {
      await apiAuthed(`/admin/purchases/${id}/reject`, {
        token: accessToken,
        method: "POST",
      });
      await load();
      setMsg("Purchase rejected");
    } catch (e) {
      setMsg(e.message);
    }
  }

  // derived: active entitlements (flattened)
  const activeRows = React.useMemo(() => {
    const rows = [];
    users.forEach((u) => {
      (u.entitlements || []).forEach((e) => {
        if (e.status === "active") {
          rows.push({
            email: u.email,
            username: u.username,
            productKey: e.productKey,
            expiresAt: e.expiresAt,
            status: e.status,
          });
        }
      });
    });
    // local client filter too (in addition to server q)
    const rx = q ? new RegExp(q, "i") : null;
    return rx
      ? rows.filter(
          (r) =>
            rx.test(r.email || "") ||
            rx.test(r.username || "") ||
            rx.test(r.productKey || "")
        )
      : rows;
  }, [users, q]);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Admin</h1>
          <div className="flex items-center gap-2">
            <input
              className="input"
              placeholder="Search email / username / product…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn btn-sm" onClick={load}>
              Refresh
            </button>
          </div>
        </div>
        {msg && <div className="text-sm mt-2">{msg}</div>}

        {/* Tabs */}
        <div className="mt-4 border-b">
          <nav className="flex gap-6">
            <button
              onClick={() => setTab("pending")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "pending"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Pending ({purchases.length})
            </button>
            <button
              onClick={() => setTab("active")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "active"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Active subscriptions ({activeRows.length})
            </button>
          </nav>
        </div>
      </div>

      {/* === TAB: Pending Purchases === */}
      {tab === "pending" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Pending Purchases</h2>
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="text-sm text-slate-600">No pending purchases.</div>
          ) : (
            <div className="space-y-2">
              {purchases.map((p) => (
                <div
                  key={p._id}
                  className="border rounded p-3 flex items-center justify-between"
                >
                  <div className="text-sm">
                    <div>
                      <b>{p.email}</b> requested <b>{p.productKey}</b>
                    </div>
                    <div>
                      Requested: {p.requestedMonths} mo ·{" "}
                      {dayjs(p.createdAt).format("YYYY-MM-DD HH:mm")}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      id={`m-${p._id}`}
                      defaultValue={p.requestedMonths}
                      className="input max-w-[140px]"
                    >
                      {MONTH_CHOICES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn"
                      onClick={() =>
                        approvePurchase(
                          p._id,
                          Number(document.getElementById(`m-${p._id}`).value)
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="btn"
                      onClick={() => rejectPurchase(p._id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === TAB: Active Subscriptions === */}
      {tab === "active" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Active Subscriptions</h2>
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : activeRows.length === 0 ? (
            <div className="text-sm text-slate-600">
              No active subscriptions.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((u, idx) => {
                const act = (u.entitlements || []).filter(
                  (e) => e.status === "active"
                );
                if (act.length === 0) return null;
                return (
                  <div key={idx} className="border rounded p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{u.email}</div>
                        <div className="text-sm text-slate-600">
                          {u.username ? `@${u.username} · ` : ""}
                          Role: {u.role} · Disabled: {String(u.disabled)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-sm"
                          onClick={() => setDisabled(u.email, !u.disabled)}
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {act.map((e, i) => {
                        const selId = `renew-${idx}-${i}`;
                        return (
                          <div
                            key={i}
                            className="border rounded p-2 flex items-center justify-between"
                          >
                            <div className="text-sm">
                              <div className="font-medium">{e.productKey}</div>
                              <div className="text-slate-600">
                                Expires:{" "}
                                {e.expiresAt
                                  ? dayjs(e.expiresAt).format("YYYY-MM-DD")
                                  : "-"}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                id={selId}
                                className="input max-w-[140px]"
                              >
                                {MONTH_CHOICES.map((m) => (
                                  <option key={m.value} value={m.value}>
                                    {m.label}
                                  </option>
                                ))}
                              </select>

                              <button
                                className="btn btn-sm"
                                title="Renew selected period"
                                onClick={() =>
                                  updateEntitlement(
                                    u.email,
                                    e.productKey,
                                    Number(
                                      document.getElementById(selId).value
                                    ),
                                    "active"
                                  )
                                }
                              >
                                Renew
                              </button>

                              <button
                                className="btn btn-sm"
                                title="Disable this entitlement"
                                onClick={() =>
                                  updateEntitlement(
                                    u.email,
                                    e.productKey,
                                    0,
                                    "disabled"
                                  )
                                }
                              >
                                Disable
                              </button>

                              <button
                                className="btn btn-sm"
                                title="Reset device binding"
                                onClick={async () => {
                                  setMsg("");
                                  const res = await apiAuthed(
                                    `/admin/users/reset-device`,
                                    {
                                      token: accessToken,
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        email: u.email,
                                        productKey: e.productKey,
                                      }),
                                    }
                                  );

                                  if (!res.ok)
                                    return setMsg("Failed to reset device");
                                  await load();
                                  setMsg(
                                    `Device lock reset for ${e.productKey}`
                                  );
                                }}
                              >
                                Reset Device
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
