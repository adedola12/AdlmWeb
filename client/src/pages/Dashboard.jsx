import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function Dashboard() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiAuthed(`/me/summary`, { token: accessToken });
        setSummary(data);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, [accessToken]);

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">Welcome, {user?.email}</h1>
        <p className="text-sm text-slate-600">
          Your 15-day <b>licenseToken</b> is issued and can be used offline by
          plugins.
        </p>
        {/* <textarea
          readOnly
          className="mt-3 w-full text-xs p-2 border rounded"
          rows={6}
          value={licenseToken || ""}
        /> */}
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
            {(summary.entitlements || []).map((e, i) => (
              <div
                key={i}
                className="border rounded p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{e.productKey}</div>
                  <div className="text-sm text-slate-600">
                    Status: {e.status}
                  </div>
                </div>
                <div className="text-sm">
                  Expires:{" "}
                  {e.expiresAt ? dayjs(e.expiresAt).format("YYYY-MM-DD") : "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
