// The last three tabs: Model, Drawings and Services.
//
// His model() (work-proj.js:1738), drawings() (:1817) and services() (:1833).
// One file because each is short and all three answer the same question — where
// did this project's content come from — from a different origin.
//
// sourcesModel.js sets out at length which of his fixture's fields we have and
// which we do not, and what stands in where we do not.

import React from "react";
import {
  attachedModels,
  formatSize,
  linkedServices,
  linkedServicesTotal,
  measuredPlaces,
  modelWarning,
  unplacedCount,
} from "./sourcesModel.js";
import { EN_DASH, compact, money } from "./workProjectFormat.js";
import { Bar } from "./workProjectBits.jsx";

const short = (d) => {
  const t = new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : EN_DASH;
};

/* ───────────────────────────── Model ───────────────────────────── */

export function WorkProjectModel({ project, canEdit = false, onGo }) {
  const models = React.useMemo(() => attachedModels(project), [project]);
  const warning = React.useMemo(() => modelWarning(project), [project]);

  if (!models.length) {
    return (
      <div className="pj-empty">
        <b>No model attached</b>
        <p>
          Export IFC from Revit and upload it, and the quantities on the bill are checked against
          it — anything that moved is flagged here.
        </p>
        {canEdit ? (
          <p className="ds-sub">Uploading is done in the full workspace.</p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {warning ? (
        <div className="pj-note warn">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <div>
            <b>The model no longer answers the whole bill.</b> {warning.text} in{" "}
            {warning.disciplines.join(" and ")}.{" "}
            <button type="button" className="pj-lnk" onClick={() => onGo?.("bill")}>
              Open the bill
            </button>
          </div>
        </div>
      ) : null}

      <section className="wk-panel vs">
        <div className="wk-ph">
          <h2>Models</h2>
          <span className="wk-locnote">One per discipline</span>
        </div>

        {models.map((m) => (
          <div className="vv" key={m.key}>
            <span className="v">{m.format.toUpperCase()}</span>
            <span className="ds">
              <b>
                {m.label}
                {m.sourceFile ? ` · ${m.sourceFile}` : ""}
              </b>
              <em>
                {[
                  m.uploadedAt ? short(m.uploadedAt) : null,
                  formatSize(m.sizeBytes) || null,
                  m.elementCount ? `${m.elementCount.toLocaleString("en-NG")} elements` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </em>
            </span>
            <span className={m.tone === "warn" ? "tag warn" : "tag"}>
              {m.statusLabel}
              {m.status === "invalid" && m.missingCount
                ? ` · ${m.missingCount} missing`
                : m.status === "valid" && m.requiredCount
                  ? ` · ${m.matchedCount}/${m.requiredCount}`
                  : ""}
            </span>
          </div>
        ))}

        <p className="pj-foot">
          Export IFC from Revit, then upload it. The element ids the bill was measured from are
          checked against the model; anything missing is flagged here.
        </p>
      </section>
    </>
  );
}

/* ─────────────────────────── Drawings ─────────────────────────── */

export function WorkProjectDrawings({ project, onOpenPlace }) {
  // Its own memo: the `: []` would hand a new array to the memos below on
  // every render, and they would all recompute.
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  const places = React.useMemo(() => measuredPlaces(items), [items]);
  const unplaced = React.useMemo(() => unplacedCount(items), [items]);

  return (
    <section className="wk-panel">
      <div className="wk-ph">
        <h2>Where this was measured</h2>
        <span className="wk-locnote">
          {places.length} {places.length === 1 ? "place" : "places"}
        </span>
      </div>

      {places.length ? (
        <div className="pj-sheets">
          {places.map((s) => (
            <div className="sh" key={s.place}>
              <span className="no">{s.indexes.length}</span>
              <span className="ds">
                <b>{s.place}</b>
                <em>
                  {s.indexes.length} bill item{s.indexes.length === 1 ? "" : "s"} ·{" "}
                  {s.value > 0 ? compact(s.value) : "not priced yet"}
                </em>
              </span>
              <button type="button" className="pj-lnk" onClick={() => onOpenPlace?.(s.place)}>
                Show items
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="pj-empty sm">
          <b>Nothing says where it was measured</b>
          <p>
            HERON records the drawing each line came from when the takeoff is saved. These lines
            were entered another way.
          </p>
        </div>
      )}

      {unplaced ? (
        <p className="pj-foot">
          {unplaced} line{unplaced === 1 ? "" : "s"} record{unplaced === 1 ? "s" : ""} no place.
          {unplaced === 1 ? " It still counts" : " They still count"} on the bill.
        </p>
      ) : (
        <p className="pj-foot">
          Places sync when the takeoff is saved in HERON. To measure more, open the drawing set in
          PlanSwift and run HERON on this project.
        </p>
      )}
    </section>
  );
}

/* ─────────────────────────── Services ─────────────────────────── */

export function WorkProjectServices({ project, canEdit = false }) {
  const services = React.useMemo(() => linkedServices(project), [project]);
  const total = React.useMemo(() => linkedServicesTotal(project), [project]);

  return (
    <>
      <div className="pj-tb">
        <span className="pj-by">
          Services measured in Revit MEP roll into this project&rsquo;s estimated total.
        </span>
        {services.length ? (
          <span className="tot">
            Adds <b>{money(total)}</b>
          </span>
        ) : null}
      </div>

      {services.length ? (
        <div className="pj-grid">
          {services.map((s) => (
            <div className="pj-card st" key={s.id}>
              <div className="top">
                <span className="src">Revit MEP</span>
                {s.stale ? <span className="tag">Snapshot</span> : null}
              </div>
              <b className="nm">{s.name}</b>
              <span className="cl">Linked {short(s.addedAt)}</span>

              <div className="pr">
                <span>Priced</span>
                <em>{Math.round(s.pricedPercent)}%</em>
              </div>
              <Bar percent={s.pricedPercent} />

              <div className="ft">
                <div>
                  <span>Adds</span>
                  <b>{compact(s.total)}</b>
                </div>
                <div>
                  <span>Items</span>
                  <b>{s.itemCount || EN_DASH}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pj-empty">
          <b>No services linked</b>
          <p>
            If the M&amp;E is measured in Revit MEP — by you or a consultant — link it and its
            total joins this project&rsquo;s.
          </p>
          {canEdit ? (
            <p className="ds-sub">Linking is done in the full workspace.</p>
          ) : null}
        </div>
      )}
    </>
  );
}
