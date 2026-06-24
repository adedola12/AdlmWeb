import React from "react";
import { apiAuthed } from "../../http";

// Naira money formatter. Mirrors the lightweight money() used across the
// project views (kept local to keep this card self-contained).
function money(v) {
  const n = Number(v) || 0;
  return "₦" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Linked Services & Works card (Feature P1).
 *
 * Rolls another project's cost (e.g. an MEP / services project) into THIS
 * project's general bill. Totals are LIVE (pull model — variations on the
 * linked project reflect immediately); `drift` shows how far the live total
 * has moved from the frozen snapshot, with a "rebaseline" action.
 *
 * Self-contained: builds its own API paths from productKey + projectId and
 * calls back onChange(updatedProject) after every mutation so the parent can
 * setSel(updated). Money is hidden when the viewer can't see rates.
 */
export default function LinkedProjectsCard({
  productKey = "",
  projectId = "",
  accessToken = "",
  access = { canEdit: true, canSeeRates: true },
  linkedSummaries = [],
  onChange,
}) {
  const canEdit = access?.canEdit !== false;
  const canSeeRates = access?.canSeeRates !== false;

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const [candidates, setCandidates] = React.useState([]);
  const [loadingCands, setLoadingCands] = React.useState(false);
  const [pick, setPick] = React.useState("");

  const base = `/projects/${productKey}/${projectId}`;
  const summaries = Array.isArray(linkedSummaries) ? linkedSummaries : [];
  const linkedTotal = summaries.reduce(
    (s, l) => s + (Number(l?.live?.total ?? l?.snapshot?.total) || 0),
    0,
  );

  async function loadCandidates() {
    setLoadingCands(true);
    setError("");
    try {
      const res = await apiAuthed(`${base}/linked-candidates`, {
        token: accessToken,
      });
      const list = (res?.candidates || []).filter(
        (c) => !summaries.some((s) => s.projectId === c.projectId),
      );
      setCandidates(list);
      setPicking(true);
    } catch (e) {
      setError(e?.message || "Could not load projects");
    } finally {
      setLoadingCands(false);
    }
  }

  async function addLink() {
    if (!pick) return;
    setBusy(true);
    setError("");
    try {
      const updated = await apiAuthed(`${base}/linked-projects`, {
        method: "POST",
        token: accessToken,
        data: { targetProjectId: pick },
      });
      onChange?.(updated);
      setPicking(false);
      setPick("");
    } catch (e) {
      // If already linked, the server returns 409. Refresh the parent project
      // so the stale `linkedSummaries` (which caused the empty display) is
      // replaced with the current server state, revealing the existing link.
      if (e?.message?.includes("already linked")) {
        try {
          const fresh = await apiAuthed(base, { token: accessToken });
          onChange?.(fresh);
          setPicking(false);
          setPick("");
        } catch {/* ignore */}
      }
      setError(e?.message || "Could not link project");
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(linkId) {
    setBusy(true);
    setError("");
    try {
      const updated = await apiAuthed(`${base}/linked-projects/${linkId}`, {
        method: "DELETE",
        token: accessToken,
      });
      onChange?.(updated);
    } catch (e) {
      setError(e?.message || "Could not remove link");
    } finally {
      setBusy(false);
    }
  }

  async function refreshLink(linkId) {
    setBusy(true);
    setError("");
    try {
      const updated = await apiAuthed(
        `${base}/linked-projects/${linkId}/refresh`,
        { method: "POST", token: accessToken },
      );
      onChange?.(updated);
    } catch (e) {
      setError(e?.message || "Could not refresh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-adlm-dark-text">
            Linked Services &amp; Works
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Roll an MEP / services project into this general bill. Totals update
            live as the linked project changes.
          </p>
        </div>
        {canSeeRates && summaries.length > 0 && (
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Linked total
            </div>
            <div className="text-base font-semibold text-slate-900 dark:text-adlm-dark-text">
              {money(linkedTotal)}
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

      {summaries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          No linked projects yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {summaries.map((l) => {
            const live = Number(l?.live?.total ?? l?.snapshot?.total) || 0;
            const drift = Number(l?.drift) || 0;

            // Build a breakdown of what changed between snapshot and live
            const driftBreakdown = (() => {
              if (!l.live || !l.snapshot || drift === 0) return [];
              const parts = [];
              const dMeasured = (l.live.measured || 0) - (l.snapshot.measured || 0);
              const dProvisional = (l.live.provisional || 0) - (l.snapshot.provisional || 0);
              const dVariations = (l.live.variations || 0) - (l.snapshot.variations || 0);
              if (Math.abs(dMeasured) > 0.5) parts.push(`Measured: ${dMeasured > 0 ? "+" : ""}${money(dMeasured)}`);
              if (Math.abs(dProvisional) > 0.5) parts.push(`PC sums: ${dProvisional > 0 ? "+" : ""}${money(dProvisional)}`);
              if (Math.abs(dVariations) > 0.5) parts.push(`Variations: ${dVariations > 0 ? "+" : ""}${money(dVariations)}`);
              return parts;
            })();

            return (
              <li
                key={l.id}
                className="rounded-xl border border-slate-100 dark:border-white/10 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-adlm-dark-text">
                        {l.label || l.name || "Linked project"}
                      </span>
                      {l.productKey && (
                        <span className="shrink-0 rounded bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {l.productKey}
                        </span>
                      )}
                      {!l.accessible && (
                        <span className="shrink-0 text-[10px] text-amber-600">
                          no access
                        </span>
                      )}
                    </div>
                    {canSeeRates && drift !== 0 && (
                      <div className="mt-1 text-[11px] text-amber-600">
                        Total changed {drift > 0 ? "+" : ""}{money(drift)} since snapshot
                        {driftBreakdown.length > 0 && (
                          <span className="ml-1 text-amber-500">
                            ({driftBreakdown.join(" · ")})
                          </span>
                        )}
                        {canEdit && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="underline"
                              onClick={() => refreshLink(l.id)}
                              disabled={busy}
                            >
                              rebaseline
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {canSeeRates && l.live && (
                      <div className="mt-1 flex gap-3 text-[10px] text-slate-400 dark:text-adlm-dark-dim">
                        <span>Measured: {money(l.live.measured)}</span>
                        {(l.live.provisional || 0) > 0 && <span>PC sums: {money(l.live.provisional)}</span>}
                        {(l.live.variations || 0) > 0 && <span>Variations: {money(l.live.variations)}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {canSeeRates && (
                      <span className="text-sm font-semibold text-slate-900 dark:text-adlm-dark-text">
                        {money(live)}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeLink(l.id)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:underline"
                        aria-label={`Unlink ${l.label || "project"}`}
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3">
          {!picking ? (
            <button
              type="button"
              className="btn"
              onClick={loadCandidates}
              disabled={loadingCands}
            >
              {loadingCands ? "Loading…" : "+ Link a project"}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-sm"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                aria-label="Select a project to link"
              >
                <option value="">Select a project…</option>
                {candidates.map((c) => (
                  <option key={c.projectId} value={c.projectId}>
                    {c.name}
                    {c.productKey ? ` (${c.productKey})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={addLink}
                disabled={!pick || busy}
              >
                {busy ? "Linking…" : "Link"}
              </button>
              <button
                type="button"
                className="text-sm text-slate-500 hover:underline"
                onClick={() => {
                  setPicking(false);
                  setPick("");
                }}
              >
                Cancel
              </button>
              {candidates.length === 0 && (
                <span className="text-xs text-slate-500">
                  No other projects to link.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
