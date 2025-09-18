import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.js";

export default function Admin() {
  const { accessToken } = useAuth();
  const [users, setUsers] = React.useState([]);
  const [purchases, setPurchases] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  async function load() {
    const [uRes, pRes] = await Promise.all([
      fetch("http://localhost:4000/admin/users", {
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("http://localhost:4000/admin/purchases?status=pending", {
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!uRes.ok) throw new Error("Failed to load users");
    if (!pRes.ok) throw new Error("Failed to load purchases");
    setUsers(await uRes.json());
    setPurchases(await pRes.json());
  }

  React.useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function updateEntitlement(email, productKey, months = 0, status) {
    setMsg("");
    const res = await fetch("http://localhost:4000/admin/users/entitlement", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, productKey, months, status }),
    });
    if (!res.ok) return setMsg("Failed to update entitlement");
    await load();
    setMsg("Entitlement updated");
  }

  async function setDisabled(email, disabled) {
    setMsg("");
    const res = await fetch("http://localhost:4000/admin/users/disable", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, disabled }),
    });
    if (!res.ok) return setMsg("Failed to update status");
    await load();
    setMsg("User status updated");
  }

  async function approvePurchase(id, months) {
    setMsg("");
    const res = await fetch(
      `http://localhost:4000/admin/purchases/${id}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ months }),
      }
    );
    if (!res.ok) return setMsg("Failed to approve");
    await load();
    setMsg("Purchase approved & entitlement applied");
  }

  async function rejectPurchase(id) {
    setMsg("");
    const res = await fetch(
      `http://localhost:4000/admin/purchases/${id}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return setMsg("Failed to reject");
    await load();
    setMsg("Purchase rejected");
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      {/* Pending Purchases */}
      <div className="card">
        <h2 className="font-semibold mb-3">Pending Purchases</h2>
        {purchases.length === 0 ? (
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
                    className="input"
                  >
                    <option value="1">1 month</option>
                    <option value="6">6 months</option>
                    <option value="12">1 year</option>
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
                  <button className="btn" onClick={() => rejectPurchase(p._id)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Existing Users/Entitlements UI (unchanged) */}
      <div className="space-y-3">
        {users.map((u, idx) => (
          <div key={idx} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{u.email}</div>
                <div className="text-sm text-slate-600">
                  Role: {u.role} · Disabled: {String(u.disabled)}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => setDisabled(u.email, !u.disabled)}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Entitlements</div>
              {(u.entitlements || []).length === 0 && (
                <div className="text-sm">None</div>
              )}

              {(u.entitlements || []).map((e, i) => (
                <div
                  key={i}
                  className="border rounded p-2 mb-2 flex items-center justify-between"
                >
                  <div className="text-sm">
                    <div>
                      {e.productKey} — {e.status}
                    </div>
                    <div>
                      Expires:{" "}
                      {e.expiresAt
                        ? dayjs(e.expiresAt).format("YYYY-MM-DD")
                        : "-"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn"
                      onClick={() =>
                        updateEntitlement(u.email, e.productKey, 1, "active")
                      }
                    >
                      +1 mo
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        updateEntitlement(u.email, e.productKey, 0, "disabled")
                      }
                    >
                      Disable
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        updateEntitlement(u.email, e.productKey, 0, "active")
                      }
                    >
                      Activate
                    </button>

                    <button
                      className="btn"
                      onClick={async () => {
                        setMsg("");
                        const res = await fetch(
                          "http://localhost:4000/admin/users/reset-device",
                          {
                            method: "POST",
                            credentials: "include",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${accessToken}`,
                            },
                            body: JSON.stringify({
                              email: u.email,
                              productKey: e.productKey,
                            }),
                          }
                        );
                        if (!res.ok) return setMsg("Failed to reset device");
                        await load();
                        setMsg(`Device lock reset for ${e.productKey}`);
                      }}
                    >
                      Reset Device
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex gap-2 mt-2">
                <select id={`p-${idx}`} className="input max-w-xs">
                  <option value="rategen">rategen</option>
                  <option value="planswift">planswift</option>
                  <option value="revit">revit</option>
                  <option value="mep">revitMep</option>
                </select>
                <button
                  className="btn"
                  onClick={() =>
                    updateEntitlement(
                      u.email,
                      document.getElementById(`p-${idx}`).value,
                      1,
                      "active"
                    )
                  }
                >
                  Grant +1 mo
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
