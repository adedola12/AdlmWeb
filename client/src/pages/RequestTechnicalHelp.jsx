// client/src/pages/RequestTechnicalHelp.jsx
// User-facing form to raise a technical-support ticket. Captures the issue and
// an AnyDesk address so the ADLM team can connect remotely. Auth-gated (mounted
// under ProtectedRoute) so the ticket is tied to the signed-in user.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

const CATEGORIES = [
  { value: "technical", label: "Technical issue" },
  { value: "account", label: "Account / login" },
  { value: "billing", label: "Billing / subscription" },
  { value: "feature-request", label: "Feature request" },
  { value: "general", label: "General question" },
];

export default function RequestTechnicalHelp() {
  const { accessToken } = useAuth();

  const [form, setForm] = React.useState({
    title: "",
    description: "",
    anyDeskAddress: "",
    category: "technical",
    productKey: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [done, setDone] = React.useState(false);

  // Past tickets so the user can see status / schedule.
  const [mine, setMine] = React.useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const loadMine = React.useCallback(async () => {
    try {
      const res = await apiAuthed("/api/support/tickets/mine", { token: accessToken });
      setMine(Array.isArray(res?.tickets) ? res.tickets : []);
    } catch {
      /* non-fatal */
    }
  }, [accessToken]);

  React.useEffect(() => {
    loadMine();
  }, [loadMine]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (!form.title.trim() || !form.description.trim()) {
      setErr("Please add a title and a description.");
      return;
    }
    setBusy(true);
    try {
      await apiAuthed("/api/support/tickets", {
        token: accessToken,
        method: "POST",
        body: {
          title: form.title.trim(),
          description: form.description.trim(),
          anyDeskAddress: form.anyDeskAddress.trim(),
          category: form.category,
          productKey: form.productKey.trim(),
        },
      });
      setDone(true);
      setForm({ title: "", description: "", anyDeskAddress: "", category: "technical", productKey: "" });
      loadMine();
    } catch (e) {
      setErr(e?.message || "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Request technical help</h1>
        <p className="text-slate-600 mt-1 text-sm">
          Tell us what's going wrong. If you'd like us to fix it directly on your
          machine, install{" "}
          <a className="text-adlm-blue-700 hover:underline" href="https://anydesk.com/download" target="_blank" rel="noreferrer">
            AnyDesk
          </a>{" "}
          and paste your AnyDesk address below — our team will connect at the
          scheduled time.
        </p>
      </div>

      {done && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 p-4 text-sm">
          ✅ Your request was submitted. We'll be in touch by email. You can track
          its status below.
          <button className="ml-2 underline" onClick={() => setDone(false)}>
            Submit another
          </button>
        </div>
      )}

      {!done && (
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Title</label>
            <input
              className="input"
              placeholder="e.g. Can't open RateGen after update"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">What's happening?</label>
            <textarea
              className="input min-h-[120px]"
              placeholder="Describe the issue, what you were doing, and any error message…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              required
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">
                Product <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                className="input"
                placeholder="e.g. revit, planswift, rategen"
                value={form.productKey}
                onChange={(e) => set("productKey", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              AnyDesk address <span className="text-slate-400 font-normal">(for remote support)</span>
            </label>
            <input
              className="input"
              placeholder="e.g. 1 234 567 890"
              value={form.anyDeskAddress}
              onChange={(e) => set("anyDeskAddress", e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              We only connect with your permission, at the scheduled time.
            </p>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex items-center gap-3">
            <button className="btn" disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
            <Link to="/support" className="text-sm text-slate-500 hover:underline">
              Other ways to reach us
            </Link>
          </div>
        </form>
      )}

      {mine.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Your requests</h2>
          <div className="space-y-2">
            {mine.map((t) => (
              <div key={t._id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <div className="font-medium text-sm">{t.title}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString()}
                    {t.scheduledForFixingAt
                      ? ` · scheduled ${new Date(t.scheduledForFixingAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap capitalize">
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
