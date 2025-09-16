import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.js";

export default function Admin() {
  const { accessToken } = useAuth();
  const [users, setUsers] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  async function load() {
    const res = await fetch("http://localhost:4000/admin/users", {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Failed to load users");
    setUsers(await res.json());
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
    if (!res.ok) {
      setMsg("Failed to update entitlement");
      return;
    }
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
    if (!res.ok) {
      setMsg("Failed to update status");
      return;
    }
    await load();
    setMsg("User status updated");
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin — Users</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      <div className="space-y-3">
        {users.map((u, idx) => (
          <div key={idx} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{u.email}</div>
                <div className="text-sm text-slate-600">
                  Role: {u.role} &middot; Disabled: {String(u.disabled)}
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
                  </div>
                </div>
              ))}
              {/* Quick add new entitlement */}
              <div className="flex gap-2 mt-2">
                <select id={`p-${idx}`} className="input max-w-xs">
                  <option value="rategen">rategen</option>
                  <option value="planswift">planswift</option>
                  <option value="revit">revit</option>
                </select>
                <button
                  className="btn"
                  onClick={() => {
                    const val = document.getElementById(`p-${idx}`).value;
                    updateEntitlement(u.email, val, 1, "active");
                  }}
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
