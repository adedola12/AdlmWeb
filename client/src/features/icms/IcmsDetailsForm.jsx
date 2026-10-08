// "ICMS details…": the ICMS 3 attributes a QS states once per project, behind
// both Export menus (the classic workspace's and /work/project's).
//
// Until this form, PUT /projectsboq/:tool/:id/icms had no screen, so cost and
// carbon per m2 were always blank and the workbook cover told the QS to "set it
// in the ICMS details" that nothing could set.
//
// Built from the side panel's own classes (.pn-sec / .pn-num / .pn-bad / .hint
// / .ds-btn), the same ones the variation and certificate forms use. It reads
// the report (GET .../icms) rather than the project, because the report is what
// knows which values are stated and which are assumed, and what the per-m2
// figures come to once an area is in.

import React from "react";
import { apiAuthed } from "../../http.js";
import {
  ICMS_CARBON_BOUNDARIES,
  ICMS_PRICE_BASES,
  ICMS_PROJECT_TYPES,
  ICMS_STAGES,
  draftFromAttributes,
  icmsBodyFrom,
  icmsDraftProblem,
  icmsPath,
  perM2Lines,
  placeholdersFrom,
} from "./icmsDetails.js";

const READ_ONLY = {
  sample:
    "This is a sample project, so its ICMS details cannot be changed. Open one of your own projects to set them.",
  view: "You have view access to this project, so its ICMS details cannot be changed. The owner can set them.",
};

function PerM2({ report }) {
  const p = perM2Lines(report);
  return (
    <div className="pn-sec" data-testid="icms-per-m2">
      <span className="k">Per m2 in the export</span>
      {p ? (
        <>
          <p className="hint" style={{ marginTop: 0 }}>{p.basis}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink)" }}>{p.cost}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink)" }}>{p.carbon}</p>
        </>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>
          Blank until a floor area is saved. Enter the gross internal area (IPMS 2), or the
          gross external area (IPMS 1), and the workbook and JSON give cost and carbon per m2.
        </p>
      )}
    </div>
  );
}

export default function IcmsDetailsForm({
  productKey,
  projectId,
  accessToken,
  canEdit = false,
  readOnlyReason = "view",
  onSaved,
  onDone,
}) {
  const [report, setReport] = React.useState(null);
  const [loadFailed, setLoadFailed] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  const [hints, setHints] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  const path = icmsPath(productKey, projectId);

  const load = React.useCallback(async () => {
    const r = await apiAuthed(path, { token: accessToken });
    setReport(r);
    setDraft(draftFromAttributes(r?.attributes));
    setHints(placeholdersFrom(r?.attributes));
    return r;
  }, [path, accessToken]);

  React.useEffect(() => {
    if (!productKey || !projectId) return undefined;
    let live = true;
    setLoadFailed("");
    load().catch((e) => {
      if (live) setLoadFailed(String(e?.message || "The ICMS details could not be read."));
    });
    return () => {
      live = false;
    };
  }, [productKey, projectId, load]);

  if (loadFailed) {
    return (
      <div className="pn-sec">
        <span className="k">Could not read the ICMS details</span>
        <p className="pn-bad" role="status">{loadFailed}</p>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="pn-sec">
        <p className="hint">Reading this project&rsquo;s ICMS details…</p>
      </div>
    );
  }

  const locked = !canEdit;
  const problem = locked ? "" : icmsDraftProblem(draft);
  const set = (k) => (e) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  };
  const off = locked || busy;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (locked || problem || busy) return;
    setBusy(true);
    setFailed("");
    setSaved(false);
    try {
      await apiAuthed(path, { token: accessToken, method: "PUT", body: icmsBodyFrom(draft) });
      // Read the report back rather than trusting the draft: it is the report
      // that turns the areas into cost and carbon per m2.
      const fresh = await load();
      setSaved(true);
      onSaved?.(fresh);
    } catch (err) {
      setFailed(String(err?.message || "The ICMS details could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="ICMS details" noValidate>
      {locked ? (
        <div className="pn-sec">
          <p className="hint" role="note" style={{ marginTop: 0 }}>
            {READ_ONLY[readOnlyReason] || READ_ONLY.view}
          </p>
        </div>
      ) : null}

      <div className="pn-sec">
        <span className="k">The project</span>
        <label className="pn-num">
          <span>Asset type</span>
          <select value={draft.projectType} disabled={off} onChange={set("projectType")}>
            {ICMS_PROJECT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="pn-num">
          <span>Project stage</span>
          <select value={draft.projectStatus} disabled={off} onChange={set("projectStatus")}>
            <option value="">
              {hints.projectStatus ? `From the contract (${hints.projectStatus})` : "From the contract"}
            </option>
            {ICMS_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {draft.projectStatus && !ICMS_STAGES.includes(draft.projectStatus) ? (
              <option value={draft.projectStatus}>{draft.projectStatus}</option>
            ) : null}
          </select>
        </label>
        <label className="pn-num">
          <span>Location</span>
          <input
            type="text"
            maxLength={200}
            placeholder="e.g. Ikoyi, Lagos"
            value={draft.location}
            disabled={off}
            onChange={set("location")}
          />
        </label>
      </div>

      <div className="pn-sec">
        <span className="k">Money and date</span>
        <label className="pn-num">
          <span>Country</span>
          <input
            type="text"
            maxLength={2}
            autoCapitalize="characters"
            placeholder={hints.country || "NG"}
            value={draft.country}
            disabled={off}
            onChange={set("country")}
          />
        </label>
        <label className="pn-num">
          <span>Currency</span>
          <input
            type="text"
            maxLength={3}
            autoCapitalize="characters"
            placeholder={hints.currency || "NGN"}
            value={draft.currency}
            disabled={off}
            onChange={set("currency")}
          />
        </label>
        <label className="pn-num">
          <span>Base date</span>
          <input type="date" value={draft.baseDate} disabled={off} onChange={set("baseDate")} />
        </label>
        <label className="pn-num">
          <span>Price basis</span>
          <select value={draft.priceBasis} disabled={off} onChange={set("priceBasis")}>
            <option value="">{hints.priceBasis || "Current prices at the base date"}</option>
            {ICMS_PRICE_BASES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
            {draft.priceBasis && !ICMS_PRICE_BASES.some((b) => b.value === draft.priceBasis) ? (
              <option value={draft.priceBasis}>{draft.priceBasis}</option>
            ) : null}
          </select>
        </label>
        <p className="hint">
          Country and currency are ISO codes: NG and NGN for a Nigerian job. The base date is
          the date the prices are at. Left blank, the export assumes what is shown.
        </p>
      </div>

      <div className="pn-sec">
        <span className="k">Floor areas</span>
        <label className="pn-num">
          <span>Gross external area, IPMS 1 (m2)</span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={draft.gfaIpms1}
            disabled={off}
            onChange={set("gfaIpms1")}
          />
        </label>
        <label className="pn-num">
          <span>Gross internal area, IPMS 2 (m2)</span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={draft.gfaIpms2}
            disabled={off}
            onChange={set("gfaIpms2")}
          />
        </label>
        <p className="hint">
          Cost and carbon per m2 are given on IPMS 2 where it is stated, else on IPMS 1.
        </p>
      </div>

      <div className="pn-sec">
        <span className="k">Carbon</span>
        <label className="pn-num">
          <span>Carbon boundary</span>
          <select value={draft.carbonBoundary} disabled={off} onChange={set("carbonBoundary")}>
            <option value="">{hints.carbonBoundary || "Up front carbon (A1-A5)"}</option>
            {ICMS_CARBON_BOUNDARIES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {draft.carbonBoundary && !ICMS_CARBON_BOUNDARIES.includes(draft.carbonBoundary) ? (
              <option value={draft.carbonBoundary}>{draft.carbonBoundary}</option>
            ) : null}
          </select>
        </label>
        <p className="hint">
          The carbon in the report is up front, stages A1 to A5, from each line&rsquo;s RateGen rate.
        </p>
      </div>

      <PerM2 report={report} />

      {problem ? <p className="pn-bad">{problem}</p> : null}
      {failed ? (
        <p className="pn-bad" role="status">
          {failed}
        </p>
      ) : null}

      {locked ? null : (
        <div className="pn-sec">
          <button type="submit" className="ds-btn btn-p ds-btn-sm" disabled={busy || !!problem}>
            {busy ? "Saving…" : "Save ICMS details"}
          </button>
          {onDone ? (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              style={{ marginLeft: 8 }}
              disabled={busy}
              onClick={onDone}
            >
              Done
            </button>
          ) : null}
          <p className="hint" role={saved ? "status" : undefined}>
            {saved
              ? "Saved. The next ICMS 3 export uses these details."
              : "Saved once for this project and used by both ICMS 3 exports."}
          </p>
        </div>
      )}
    </form>
  );
}
