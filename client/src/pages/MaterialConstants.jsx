// src/pages/MaterialConstants.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

// The Material Constants library: the factors that turn a measured bill
// quantity into the materials and labour behind it ("1 m³ of 1:2:4 concrete =
// 6.65 bags of cement"). Editing a value here changes every Material & Labour
// schedule generated afterwards — and any project can be regenerated against
// the new figures from its Budget tab.
//
// The same keys back QUIV's and Heron's own constants libraries, so a firm's
// standards mean the same thing on the desktop and on the web.
export default function MaterialConstants() {
  const { accessToken } = useAuth();
  const [groups, setGroups] = React.useState([]);
  const [constants, setConstants] = React.useState([]);
  const [drafts, setDrafts] = React.useState({}); // key → string being typed
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [openGroup, setOpenGroup] = React.useState(null);

  const apply = React.useCallback((res) => {
    setGroups(res?.groups || []);
    setConstants(res?.constants || []);
    setDrafts({});
  }, []);

  React.useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiAuthed("/me/material-constants", { token: accessToken });
        if (!cancelled) apply(res);
      } catch (e) {
        if (!cancelled) setMsg(e?.message || "Failed to load the constants library.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, apply]);

  const dirty = Object.keys(drafts).length > 0;
  const changedCount = constants.filter((c) => !c.isDefault).length;

  function edit(key, value) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  // Show the value being typed, else the saved one.
  function valueOf(c) {
    return drafts[c.key] !== undefined ? drafts[c.key] : String(c.value);
  }

  function outOfRange(c) {
    const raw = drafts[c.key];
    if (raw === undefined || raw === "") return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < c.min || n > c.max;
  }

  const invalid = constants.some(outOfRange);

  async function save() {
    if (invalid) return;
    setSaving(true);
    setMsg("");
    try {
      const values = {};
      for (const [key, raw] of Object.entries(drafts)) {
        if (raw === "") continue;
        values[key] = Number(raw);
      }
      const res = await apiAuthed("/me/material-constants", {
        token: accessToken,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      apply(res);
      setMsg(
        `✅ Saved. Open a project's Budget tab and choose “Rebuild schedule” to apply the new figures.`,
      );
    } catch (e) {
      setMsg(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function reset(key) {
    setSaving(true);
    setMsg("");
    try {
      const res = await apiAuthed(
        key ? `/me/material-constants/${encodeURIComponent(key)}` : "/me/material-constants",
        { token: accessToken, method: "DELETE" },
      );
      apply(res);
      setMsg(key ? "Reset to the default." : "✅ Everything reset to ADLM defaults.");
    } catch (e) {
      setMsg(e?.message || "Failed to reset.");
    } finally {
      setSaving(false);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (c) =>
    !q || c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q);

  const visibleGroups = groups
    .map((g) => ({ name: g, rows: constants.filter((c) => c.group === g && matches(c)) }))
    .filter((g) => g.rows.length);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-xl font-semibold">Material Constants</h1>
          <Link to="/rategen" className="text-sm underline">
            ← RateGen
          </Link>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The factors behind every material &amp; labour schedule — how many bags
          of cement go into a cubic metre, how many blocks into a square metre,
          what the labour costs per unit. Change one and every schedule you
          generate afterwards follows it.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
          These are the same constants QUIV and Heron use on the desktop.{" "}
          {changedCount > 0 ? (
            <span className="font-medium">
              {changedCount} value{changedCount === 1 ? "" : "s"} changed from the
              ADLM default.
            </span>
          ) : (
            "Every value is currently the ADLM default."
          )}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            className="input max-w-xs"
            placeholder="Search constants…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search material constants"
          />
          <button
            className="btn"
            onClick={save}
            disabled={saving || loading || !dirty || invalid || !accessToken}
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-adlm-dark-border dark:text-adlm-dark-muted dark:hover:bg-white/5"
            onClick={() => reset(null)}
            disabled={saving || loading || changedCount === 0}
          >
            Reset all to defaults
          </button>
          {invalid && (
            <span className="text-sm text-rose-600 dark:text-rose-400">
              A value is outside its allowed range.
            </span>
          )}
        </div>

        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </div>

      {loading ? (
        <div role="status" className="card text-sm text-slate-500">
          Loading…
        </div>
      ) : (
        visibleGroups.map((group) => {
          const open = q ? true : openGroup === null || openGroup === group.name;
          return (
            <div className="card" key={group.name}>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 text-left"
                onClick={() => setOpenGroup(open && !q ? "__none__" : group.name)}
                aria-expanded={open}
              >
                <h2 className="font-semibold">{group.name}</h2>
                <span className="text-xs text-slate-500">
                  {group.rows.length} value{group.rows.length === 1 ? "" : "s"}
                </span>
              </button>

              {open && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-3">Constant</th>
                        <th className="py-2 pr-3">Value</th>
                        <th className="py-2 pr-3">Unit</th>
                        <th className="py-2 pr-3">ADLM default</th>
                        <th className="py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((c) => (
                        <tr
                          key={c.key}
                          className="border-t border-slate-100 dark:border-white/10"
                        >
                          <td className="py-2 pr-3">
                            <div className="font-medium">{c.label}</div>
                            <div className="text-xs text-slate-400">{c.key}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              step="any"
                              min={c.min}
                              max={c.max}
                              className={`input w-32 ${
                                outOfRange(c) ? "border-rose-500" : ""
                              }`}
                              value={valueOf(c)}
                              onChange={(e) => edit(c.key, e.target.value)}
                              aria-label={c.label}
                              aria-invalid={outOfRange(c) || undefined}
                            />
                            {outOfRange(c) && (
                              <div className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                                Must be between {c.min} and {c.max}.
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-slate-500">{c.unit}</td>
                          <td className="py-2 pr-3 text-slate-500">{c.def}</td>
                          <td className="py-2 pr-3">
                            {!c.isDefault && (
                              <button
                                type="button"
                                className="text-xs underline text-slate-500"
                                onClick={() => reset(c.key)}
                                disabled={saving}
                              >
                                Reset
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
