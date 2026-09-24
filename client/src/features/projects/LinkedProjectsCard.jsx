import React from "react";
import { apiAuthed } from "../../http";

// Naira money formatter. Mirrors the lightweight money() used across the
// project views (kept local to keep this card self-contained).
function money(v) {
  const n = Number(v) || 0;
  return "₦" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// His note tones: orange for a problem, light blue for a result.
const NOTE_WARN = {
  margin: 0,
  background: "var(--pal-orange-wash)",
  color: "var(--pal-orange-key)",
  borderColor: "var(--pal-orange-line)",
};
const NOTE_GOOD = {
  margin: 0,
  background: "var(--pal-light-wash)",
  color: "var(--pal-light-key)",
  borderColor: "var(--pal-light-line)",
};
const LINK_BTN = {
  background: "none",
  border: 0,
  padding: 0,
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
  textDecoration: "underline",
};

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
    <section className="wk-panel" style={{ marginBottom: 0 }}>
      <div className="wk-ph" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2>Linked Services &amp; Works</h2>
          <div className="wk-locnote" style={{ marginTop: 4 }}>
            Roll an MEP / services project into this general bill. Totals update
            live as the linked project changes.
          </div>
        </div>
        {canSeeRates && summaries.length > 0 && (
          <div style={{ textAlign: "right", flex: "none" }}>
            <div className="wk-locnote">Linked total</div>
            <b style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)" }}>{money(linkedTotal)}</b>
          </div>
        )}
      </div>

      {error && (
        <p className="mk-note" role="alert" style={{ ...NOTE_WARN, margin: "14px 20px 0" }}>
          {error}
        </p>
      )}

      {summaries.length === 0 ? (
        <div className="wk-empty" style={{ padding: "26px 22px" }}>
          <b>No linked projects yet</b>
          <p>
            A link rolls another project&rsquo;s total into this bill as one line and keeps it
            live, so an MEP or services package measured separately is still counted here
            without being measured again.
          </p>
          {/* The control is at the foot of this card, and only for somebody
              who may edit the project. Saying "link one" to a reader who has
              no button would be worse than saying nothing. */}
          <p>
            {canEdit
              ? "Link a project, at the foot of this card, adds the first one."
              : "You are reading this project rather than working on it, so you cannot link one."}
          </p>
        </div>
      ) : (
        <div className="wk-use">
          {summaries.map((l) => {
            const live = Number(l?.live?.total ?? l?.snapshot?.total) || 0;
            const drift = Number(l?.drift) || 0;

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
              <div className="wk-useline" key={l.id}>
                <span className="p" style={{ minWidth: 0 }}>
                  {l.label || l.name || "Linked project"}
                  {canSeeRates && drift !== 0 && (
                    <em style={{ color: "var(--pal-orange-key)" }}>
                      Total changed {drift > 0 ? "+" : ""}{money(drift)} since snapshot
                      {driftBreakdown.length > 0 ? ` (${driftBreakdown.join(" · ")})` : ""}
                      {canEdit && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            style={LINK_BTN}
                            onClick={() => refreshLink(l.id)}
                            disabled={busy}
                          >
                            rebaseline
                          </button>
                        </>
                      )}
                    </em>
                  )}
                  {canSeeRates && l.live && (
                    <em>
                      Measured: {money(l.live.measured)}
                      {(l.live.provisional || 0) > 0 ? ` · PC sums: ${money(l.live.provisional)}` : ""}
                      {(l.live.variations || 0) > 0 ? ` · Variations: ${money(l.live.variations)}` : ""}
                    </em>
                  )}
                </span>
                <span className="q">
                  {l.productKey && <span className="wk-src sm">{l.productKey}</span>}
                  {!l.accessible && (
                    <span style={{ display: "block", marginTop: 4, color: "var(--pal-orange-key)" }}>
                      no access
                    </span>
                  )}
                </span>
                <span className="v">
                  {canSeeRates ? money(live) : null}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeLink(l.id)}
                      disabled={busy}
                      style={{ ...LINK_BTN, display: "block", marginLeft: "auto", marginTop: 4, fontSize: 12, fontWeight: 400, color: "var(--pal-orange-key)" }}
                      aria-label={`Unlink ${l.label || "project"}`}
                    >
                      Unlink
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div
          className="wk-bar"
          style={{ margin: 0, padding: "14px 20px 18px", borderTop: "1px solid var(--line)" }}
        >
          {!picking ? (
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-o"
              onClick={loadCandidates}
              disabled={loadingCands}
            >
              {loadingCands ? "Loading…" : "+ Link a project"}
            </button>
          ) : (
            <>
              <label className="wk-f" style={{ flex: "1 1 240px", minWidth: 0 }}>
                <select
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
              </label>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-p"
                onClick={addLink}
                disabled={!pick || busy}
              >
                {busy ? "Linking…" : "Link"}
              </button>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={() => {
                  setPicking(false);
                  setPick("");
                }}
              >
                Cancel
              </button>
              {candidates.length === 0 && (
                <span className="wk-locnote">No other projects to link.</span>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
