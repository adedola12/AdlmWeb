// src/pages/Admin.jsx
import React from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

const MONTH_CHOICES = [
  { label: "1 month", value: 1 },
  { label: "6 months", value: 6 },
  { label: "1 year", value: 12 },
];

export default function Admin() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = React.useState("pending");
  const [users, setUsers] = React.useState([]);
  const [purchases, setPurchases] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [installations, setInstallations] = React.useState([]);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const [uRes, pRes, iRes] = await Promise.all([
        apiAuthed(`/admin/users${qs}`, { token: accessToken }),
        apiAuthed(`/admin/purchases?status=pending`, { token: accessToken }),
        apiAuthed(`/admin/installations`, { token: accessToken }),
      ]);

      setUsers(uRes);
      setInstallations(iRes || []);

      setPurchases(pRes);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntitlement(email, productKey) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/entitlement/delete`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey }),
      });
      await load();
      setMsg(`Entitlement deleted for ${productKey}`);
    } catch (e) {
      setMsg(e.message || "Failed to delete entitlement");
    }
  }


  React.useEffect(() => {
    load();
  }, []);

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
    const res = await apiAuthed(`/admin/purchases/${id}/approve`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months }),
    });
    await load();
    setMsg(res?.message || "Purchase approved");
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

  function ActiveSubscriptionsByProduct({
    productKeys,
    productMap,
    users,
    setDisabled,
    updateEntitlement,
    accessToken,
    apiAuthed,
    load,
    setMsg,
    deleteEntitlement,
  }) {
    const [activeProduct, setActiveProduct] = React.useState(
      productKeys[0] || ""
    );

    React.useEffect(() => {
      // if tabs changed (search etc), keep active tab valid
      if (!productKeys.includes(activeProduct)) {
        setActiveProduct(productKeys[0] || "");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productKeys.join("|")]);

    const rows = productMap.get(activeProduct) || [];

    // Sort users by expiry asc, then email
    const sortedRows = [...rows].sort((a, b) => {
      const ax = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
      const bx = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
      if (ax !== bx) return ax - bx;
      return String(a.email || "").localeCompare(String(b.email || ""));
    });

    // quick lookup for user details (role/disabled/username)
    const userByEmail = React.useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) =>
        m.set(String(u.email || "").toLowerCase(), u)
      );
      return m;
    }, [users]);

    return (
      <div className="space-y-4">
        {/* Sub-tabs per software */}
        <div className="border-b">
          <nav className="flex gap-3 flex-wrap">
            {productKeys.map((pk) => {
              const count = (productMap.get(pk) || []).length;
              const active = pk === activeProduct;
              return (
                <button
                  key={pk}
                  onClick={() => setActiveProduct(pk)}
                  className={`py-2 -mb-px border-b-2 transition text-sm ${
                    active
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-600 hover:text-slate-800"
                  }`}
                  title={pk}
                >
                  {pk} <span className="text-slate-400">({count})</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Table-like layout */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3">Renewal</th>
                <th className="py-2 pr-3">Entitlement</th>
                <th className="py-2 pr-3">Device</th>
                <th className="py-2 pr-3">User Status</th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((r, i) => {
                const u =
                  userByEmail.get(String(r.email || "").toLowerCase()) || {};
                const disabledUser = !!u.disabled;

                const selId = `renew-${activeProduct}-${i}`;

                return (
                  <tr
                    key={`${r.email}-${r.productKey}-${i}`}
                    className={`border-b ${disabledUser ? "opacity-60" : ""}`}
                  >
                    {/* User */}
                    <td className="py-3 pr-3">
                      <div className="font-medium">{r.email}</div>
                      <div className="text-xs text-slate-500">
                        {u.username ? `@${u.username} · ` : ""}
                        {u.role ? `Role: ${u.role}` : ""}
                      </div>
                    </td>

                    {/* Expiry */}
                    <td className="py-3 pr-3">
                      {r.expiresAt
                        ? dayjs(r.expiresAt).format("YYYY-MM-DD")
                        : "-"}
                    </td>

                    {/* Renewal */}
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <select id={selId} className="input max-w-[140px]">
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
                              r.email,
                              r.productKey,
                              Number(document.getElementById(selId).value),
                              "active"
                            )
                          }
                        >
                          Renew
                        </button>
                      </div>
                    </td>

                    {/* Entitlement actions */}

                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-sm"
                          title="Disable this entitlement"
                          onClick={() =>
                            updateEntitlement(
                              r.email,
                              r.productKey,
                              0,
                              "disabled"
                            )
                          }
                        >
                          Disable
                        </button>

                        <button
                          className="btn btn-sm"
                          title="Permanently remove entitlement"
                          onClick={() => {
                            const ok = window.confirm(
                              `Delete entitlement ${r.productKey} for ${r.email}? This cannot be undone.`
                            );
                            if (ok) deleteEntitlement(r.email, r.productKey);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>

                    {/* Device */}
                    <td className="py-3 pr-3">
                      <button
                        className="btn btn-sm"
                        title="Reset device binding"
                        onClick={async () => {
                          setMsg("");
                          try {
                            await apiAuthed(`/admin/users/reset-device`, {
                              token: accessToken,
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                email: r.email,
                                productKey: r.productKey,
                              }),
                            });

                            await load();
                            setMsg(`Device lock reset for ${r.productKey}`);
                          } catch (err) {
                            setMsg(err?.message || "Failed to reset device");
                          }
                        }}
                      >
                        Reset Device
                      </button>
                    </td>

                    {/* User status */}
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">
                          {disabledUser ? "Disabled" : "Active"}
                        </span>

                        <button
                          className="btn btn-sm"
                          onClick={() => setDisabled(r.email, !disabledUser)}
                        >
                          {disabledUser ? "Enable" : "Disable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sortedRows.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-600" colSpan={6}>
                    No users found under this subscription.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-slate-500">
          Showing <b>{sortedRows.length}</b> active subscriptions for{" "}
          <b>{activeProduct}</b>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 ">
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

            {/* ✅ NEW */}
            <button
              className="btn btn-sm"
              onClick={() => navigate("/admin/coupons")}
              title="Create / manage coupons"
            >
              AddCoupon
            </button>
          </div>
        </div>

        {msg && <div className="text-sm mt-2">{msg}</div>}

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

            <button
              onClick={() => setTab("installations")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "installations"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Installations ({installations.length})
            </button>
          </nav>
        </div>
      </div>

      {tab === "pending" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Pending Purchases</h2>
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="text-sm text-slate-600">No pending purchases.</div>
          ) : (
            <div className="space-y-2">
              {purchases.map((p) => {
                const isCart = Array.isArray(p.lines) && p.lines.length > 0;

                return (
                  <div
                    key={p._id}
                    className="border rounded p-3 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div>
                          <b>{p.email}</b>{" "}
                          {isCart ? (
                            <>submitted a cart</>
                          ) : (
                            <>
                              requested <b>{p.productKey}</b>
                            </>
                          )}
                        </div>
                        <div className="text-slate-600">
                          Requested:{" "}
                          {p.requestedMonths
                            ? `${p.requestedMonths} mo · `
                            : ""}
                          {dayjs(p.createdAt).format("YYYY-MM-DD HH:mm")}
                        </div>
                      </div>

                      {/* Right-hand actions */}
                      <div className="flex gap-2 items-center">
                        {!isCart ? (
                          <>
                            <select
                              id={`m-${p._id}`}
                              defaultValue={p.requestedMonths || 1}
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
                                  Number(
                                    document.getElementById(`m-${p._id}`).value
                                  )
                                )
                              }
                            >
                              Approve
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn"
                            onClick={() => approvePurchase(p._id)}
                          >
                            Approve cart
                          </button>
                        )}

                        <button
                          className="btn"
                          onClick={() => rejectPurchase(p._id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {/* Cart line items (if any) */}
                    {isCart && (
                      <div className="rounded border bg-slate-50">
                        <div className="px-3 py-2 text-sm font-medium">
                          Cart · {p.currency}{" "}
                          {p.totalAmount?.toLocaleString?.() ?? p.totalAmount}
                        </div>
                        <div className="divide-y">
                          {p.lines.map((ln, idx) => {
                            const months =
                              ln.billingInterval === "yearly"
                                ? (ln.qty || 0) * 12
                                : ln.qty || 0;
                            return (
                              <div
                                key={idx}
                                className="px-3 py-2 text-sm flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-medium">
                                    {ln.name || ln.productKey}
                                  </div>
                                  <div className="text-slate-600">
                                    {ln.billingInterval} · qty {ln.qty}{" "}
                                    {ln.billingInterval === "yearly"
                                      ? "(years)"
                                      : "(months)"}{" "}
                                    · adds <b>{months}</b> month
                                    {months === 1 ? "" : "s"}
                                  </div>
                                </div>
                                <div className="text-right text-slate-700">
                                  <div>
                                    Unit: {p.currency}{" "}
                                    {ln.unit?.toLocaleString?.() ?? ln.unit}
                                  </div>
                                  {ln.install > 0 && (
                                    <div className="text-xs">
                                      Install: {p.currency} {ln.install}
                                    </div>
                                  )}
                                  <div className="font-semibold">
                                    Subtotal: {p.currency}{" "}
                                    {ln.subtotal?.toLocaleString?.() ??
                                      ln.subtotal}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
            (() => {
              // Build product -> rows map
              const productMap = new Map();
              for (const row of activeRows) {
                const key = String(row.productKey || "Unknown");
                if (!productMap.has(key)) productMap.set(key, []);
                productMap.get(key).push(row);
              }

              // Sort product tabs (optional)
              const productKeys = Array.from(productMap.keys()).sort((a, b) =>
                a.localeCompare(b)
              );

              // local sub-tab state (per render) — keep it stable using React state
              // NOTE: we must declare state outside IIFE, so we use a small helper closure below
              return (
                <ActiveSubscriptionsByProduct
                  productKeys={productKeys}
                  productMap={productMap}
                  users={users}
                  setDisabled={setDisabled}
                  updateEntitlement={updateEntitlement}
                  accessToken={accessToken}
                  apiAuthed={apiAuthed}
                  load={load}
                  setMsg={setMsg}
                  deleteEntitlement={deleteEntitlement}
                />
              );
            })()
          )}
        </div>
      )}

      {tab === "installations" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Pending Installations</h2>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : installations.length === 0 ? (
            <div className="text-sm text-slate-600">
              No pending installations.
            </div>
          ) : (
            <div className="space-y-2">
              {installations.map((p) => (
                <div
                  key={p._id}
                  className="border rounded p-3 flex items-center justify-between gap-3"
                >
                  <div className="text-sm">
                    <div>
                      <b>{p.email}</b> · Approved purchase
                    </div>
                    <div className="text-slate-600">
                      {p.decidedAt
                        ? dayjs(p.decidedAt).format("YYYY-MM-DD HH:mm")
                        : ""}
                    </div>
                  </div>

                  <button
                    className="btn"
                    onClick={async () => {
                      setMsg("");
                      try {
                        await apiAuthed(
                          `/admin/installations/${p._id}/complete`,
                          {
                            token: accessToken,
                            method: "POST",
                          }
                        );
                        await load();
                        setMsg("Installation marked complete");
                      } catch (e) {
                        setMsg(e.message || "Failed to mark complete");
                      }
                    }}
                  >
                    Mark complete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
