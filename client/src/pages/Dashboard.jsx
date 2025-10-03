// src/pages/Dashboard.jsx
import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [err, setErr] = React.useState("");
  const navigate = useNavigate();

  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiAuthed(`/me/summary`, { token: accessToken });
        setSummary(data);
      } catch (e) {
        setErr(e.message || "Failed to load summary");
      }
    })();
  }, [accessToken]);

  function openProduct(e) {
    // Only allow click for active subscriptions
    if (e.status !== "active") return;
    if ((e.productKey || "").toLowerCase() === "revit") {
      navigate("/revit-projects");
    } else {
      navigate(`/product/${e.productKey}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">Welcome, {user?.email}</h1>
        <p className="text-sm text-slate-600">
          Your 15-day <b>licenseToken</b> is issued and can be used offline by
          plugins.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Active Subscriptions</h2>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        {!summary ? (
          "Loading…"
        ) : (
          <div className="space-y-2">
            {(summary.entitlements || []).length === 0 && (
              <div>No subscriptions yet.</div>
            )}
            {(summary.entitlements || []).map((e, i) => {
              const isActive = e.status === "active";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => openProduct(e)}
                  className={`w-full border rounded p-3 flex items-center justify-between text-left 
                    transition hover:bg-slate-50 ${
                      isActive
                        ? "cursor-pointer"
                        : "opacity-60 cursor-not-allowed"
                    }`}
                >
                  <div>
                    <div className="font-medium">{e.productKey}</div>
                    <div className="text-sm text-slate-600">
                      Status: {e.status}
                    </div>
                  </div>
                  <div className="text-sm">
                    Expires:{" "}
                    {e.expiresAt
                      ? dayjs(e.expiresAt).format("YYYY-MM-DD")
                      : "-"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
