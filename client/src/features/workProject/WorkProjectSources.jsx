// The last three tabs: Model, Drawings and Services.
//
// His model() (work-proj.js:1738), drawings() (:1817) and services() (:1833).
// One file because each is short and all three answer the same question — where
// did this project's content come from — from a different origin.
//
// sourcesModel.js sets out at length which of his fixture's fields we have and
// which we do not, and what stands in where we do not.

import React from "react";
import { apiAuthed } from "../../http.js";
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
// The shell gates every tab on this now, but the three source tabs keep their
// own guard as well: it is what makes each correct on its own, and it is what
// the unit tests beside this file drive directly.
import { Bar, StillLoading } from "./workProjectBits.jsx";
import WorkProjectElementTrace from "./WorkProjectElementTrace.jsx";

// three.js plus the IFC/fragments loader, which together are the heaviest thing
// this client can pull. Lazy, so the Model tab costs nothing until somebody
// opens it and nothing at all on the other eight — WorkProjectFourD imports it
// the same way for the same reason.
const ModelViewer = React.lazy(() => import("../projects/ModelViewer.jsx"));

/** The disciplines the viewer can draw. Matches WorkProjectFourD. */
const VIEWABLE = ["architectural", "structural", "mep"];

const short = (d) => {
  const t = new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : EN_DASH;
};

/* ───────────────────────────── Model ───────────────────────────── */


export function WorkProjectModel({
  project,
  canEdit = false,
  onGo,
  loading = false,
  classicHref = "",
  productKey = "",
  projectId = "",
  accessToken = "",
}) {
  const models = React.useMemo(() => attachedModels(project), [project]);
  const warning = React.useMemo(() => modelWarning(project), [project]);

  // The viewer needs a URL to fetch, which the list does not carry — a row can
  // be "attached" on the strength of a filename alone. Read from the raw models
  // object for the same reason WorkProjectFourD does.
  const viewable = React.useMemo(
    () => VIEWABLE.some((d) => project?.models?.[d]?.url),
    [project],
  );
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  // The material and labour breakdown, for the element trace. Same field the
  // classic project view hands the viewer (ProjectsGeneric.jsx: sel.materialItems).
  const materialItems = React.useMemo(
    () => (Array.isArray(project?.materialItems) ? project.materialItems : []),
    [project],
  );
  // The element the viewer last reported a click on. 0 means nothing selected,
  // which is what ModelViewer itself uses.
  const [picked, setPicked] = React.useState(0);

  // Before the empty check, never after: the whole point is that an empty list
  // means nothing yet while the read is in flight.
  if (loading && !models.length) return <StillLoading what="model" />;

  if (!models.length) {
    return (
      <div className="pj-empty">
        <b>No model attached</b>
        <p>
          Export IFC from Revit and upload it, and the quantities on the bill are checked against
          it — anything that moved is flagged here.
        </p>
        {canEdit ? (
          <p className="ds-sub">
            {/* A sentence naming a place the reader cannot get to is a dead end.
                The shell already builds this href for the Collaborators panel
                (WorkProjectShell.jsx:283); it costs nothing to pass it here. */}
            Uploading is done in{" "}
            {classicHref ? (
              <a href={classicHref}>the classic workspace</a>
            ) : (
              "the classic workspace"
            )}
            .
          </p>
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

      {/* HIS LAYOUT, FINALLY WIRED UP.
          .pj-model is a two-column grid in ds-work-proj.css:472 — a viewport on
          the left and a side column on the right — and it was never used
          anywhere in the client. Which meant .ds .pj-model .vv never matched,
          so the model rows below had NO styling at all: the date, size and
          element count rendered as a browser's default italic run-on instead of
          his .vv grid. That is what the tab looked wrong about.

          The viewer goes in the left column. Not inside his .vw figure — that
          is built for a static image with a caption over it, and the live
          viewer brings its own .wk-panel chrome, discipline switcher and
          progress meter, all already in his classes. */}
      <div className="pj-model">
        {viewable ? (
          <React.Suspense
            fallback={
              // A blank rectangle on a slow connection is indistinguishable
              // from a failure, and "it feels stuck" is where this tab started.
              <section className="wk-panel" role="status" aria-live="polite">
                <div className="pj-empty">
                  <b>Loading the model{"…"}</b>
                  <p>The 3D viewer is a large download the first time.</p>
                </div>
              </section>
            }
          >
            <ModelViewer
              compact
              height={420}
              projectModels={project?.models || {}}
              items={items}
              materialItems={materialItems}
              productKey={productKey}
              projectId={projectId}
              accessToken={accessToken}
              onPickElement={setPicked}
            />
          </React.Suspense>
        ) : (
          // The grid has two columns either way: without this the model list
          // would stretch across both and stop looking like his design.
          <section className="wk-panel">
            <div className="pj-empty">
              <b>Nothing to draw</b>
              <p>
                This project&rsquo;s model was recorded by name but its file is not stored, so it
                cannot be shown here.
              </p>
            </div>
          </section>
        )}

        {picked ? (
          <WorkProjectElementTrace
            id={picked}
            items={items}
            materialItems={materialItems}
            onClear={() => setPicked(0)}
          />
        ) : (
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
          {/* Said once, beneath the list, rather than repeated on every row.
              Without it the tag is a bare statement with no way to act on it —
              and the action here is "upload the IFC instead", which is not
              guessable from the words "no ids to check". */}
          {models.some((m) => !m.checkable) ? (
            <>
              {" "}
              Pre-converted fragments carry no element ids, so a model uploaded as .frag cannot be
              checked against the bill at all — upload the IFC if you want that check.
            </>
          ) : null}
        </p>
      </section>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────── Drawings ─────────────────────────── */

export function WorkProjectDrawings({ project, onOpenPlace, loading = false }) {
  // Its own memo: the `: []` would hand a new array to the memos below on
  // every render, and they would all recompute.
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  const places = React.useMemo(() => measuredPlaces(items), [items]);
  const unplaced = React.useMemo(() => unplacedCount(items), [items]);

  // The rollup has no bill lines, so this reads "0 places" on a fully measured
  // job until the full document lands — and the count in the header makes that
  // read as fact rather than as a screen that has not finished.
  if (loading && !items.length) return <StillLoading what="drawings" />;

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

/**
 * Which projects could be linked into this one, and may this user do it?
 *
 * "If it's available" is three conditions, not one, and the server enforces all
 * three (server/routes/projects.js, addLinkedProject around :7990):
 *
 *   * the PARENT must be a QUIV or HERON project — the route refuses any other
 *     productKey outright;
 *   * the parent must not be BoQ-imported — linking merges by model element and
 *     a BoQ import has no model behind it, so the route answers 403;
 *   * there must be at least one MEP project THIS user owns that is not linked
 *     already.
 *
 * A button that leads to any of those refusals is worse than no button, so the
 * first two are checked before asking and the third is what the ask answers.
 *
 * The candidates read happens on the Services tab only, and only for somebody
 * who could act on it — not on every tab and never for a viewer. That is one
 * request on the screen where it is the point, which is the cheapest honest
 * answer to "is one available".
 */
function useLinkableMep({ project, productKey, projectId, accessToken, canEdit, linkedIds }) {
  const eligible =
    canEdit &&
    !!accessToken &&
    !!projectId &&
    ["revit", "planswift"].includes(String(productKey || "").toLowerCase()) &&
    String(project?.origin || "") !== "boq-import";

  const [candidates, setCandidates] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!eligible) return undefined;
    let alive = true;
    setFailed(false);
    apiAuthed(`/projects/${encodeURIComponent(productKey)}/${encodeURIComponent(projectId)}/linked-candidates`, {
      token: accessToken,
    })
      .then((d) => alive && setCandidates(Array.isArray(d?.candidates) ? d.candidates : []))
      // A failed read is NOT "none available". It leaves candidates null, which
      // renders nothing — the screen simply does not offer an action it cannot
      // stand behind, rather than claiming the user has no MEP projects.
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [eligible, productKey, projectId, accessToken]);

  // Already-linked ones are not candidates. The server would answer 409, which
  // is a correct refusal and a pointless thing to show somebody.
  const open = React.useMemo(
    () => (candidates || []).filter((c) => !linkedIds.has(String(c.projectId))),
    [candidates, linkedIds],
  );

  return { eligible, candidates, open, failed };
}

export function WorkProjectServices({
  project,
  canEdit = false,
  loading = false,
  classicHref = "",
  productKey = "",
  projectId = "",
  accessToken = "",
  onLinked,
}) {
  const services = React.useMemo(() => linkedServices(project), [project]);
  const total = React.useMemo(() => linkedServicesTotal(project), [project]);
  const linkedIds = React.useMemo(
    () => new Set(services.map((s) => String(s.id))),
    [services],
  );

  const { open, failed: candidatesFailed } = useLinkableMep({
    project,
    productKey,
    projectId,
    accessToken,
    canEdit,
    linkedIds,
  });

  const [picking, setPicking] = React.useState(false);
  const [pick, setPick] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [linkError, setLinkError] = React.useState("");

  async function link() {
    if (!pick || busy) return;
    setBusy(true);
    setLinkError("");
    try {
      const updated = await apiAuthed(
        `/projects/${encodeURIComponent(productKey)}/${encodeURIComponent(projectId)}/linked-projects`,
        { method: "POST", token: accessToken, data: { targetProjectId: pick } },
      );
      onLinked?.(updated);
      setPicking(false);
      setPick("");
    } catch (e) {
      setLinkError(e?.message || "That could not be linked just now.");
    } finally {
      setBusy(false);
    }
  }

  // Same reason as the Model tab: the rollup has no linked services, so until
  // the full document lands this would say a project with M&E has none.
  if (loading && !services.length) return <StillLoading what="services" />;

  const canOffer = open.length > 0;

  const picker = picking ? (
    <div className="pj-note">
      <div>
        <b>Which services bill?</b>
        <p className="ds-sub">
          Its total joins this project{"’"}s. You can unlink it again at any time.
        </p>
        <select
          className="ds-field"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="MEP project to link"
        >
          <option value="">Choose a project{"…"}</option>
          {open.map((c) => (
            <option key={c.projectId} value={c.projectId}>
              {c.name || "Untitled"}
              {c.total ? ` — ${money(c.total)}` : ""}
            </option>
          ))}
        </select>
        <div className="b">
          <button type="button" className="ds-btn" disabled={!pick || busy} onClick={link}>
            {busy ? "Linking…" : "Link it"}
          </button>
          <button
            type="button"
            className="ds-btn btn-o"
            disabled={busy}
            onClick={() => {
              setPicking(false);
              setLinkError("");
            }}
          >
            Cancel
          </button>
        </div>
        {linkError ? <p className="ds-sub">{linkError}</p> : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="pj-tb">
        <span className="pj-by">
          Services measured in Revit MEP roll into this project&rsquo;s estimated total.
        </span>
        {/* Offered here as well as in the empty state, so a project that
            already has one linked can gain another without going anywhere. */}
        {services.length && canOffer && !picking ? (
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setPicking(true)}>
            Link another
          </button>
        ) : null}
        {services.length ? (
          <span className="tot">
            Adds <b>{money(total)}</b>
          </span>
        ) : null}
      </div>

      {picker}

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
          {/* The action itself, where somebody looking at an empty tab is
              actually standing. Only when there IS an MEP bill of theirs to
              link — see useLinkableMep for the three conditions. */}
          {canOffer && !picking ? (
            <div className="b">
              <button type="button" className="ds-btn" onClick={() => setPicking(true)}>
                Link MEP bill
              </button>
            </div>
          ) : null}
          {canEdit && !canOffer ? (
            <p className="ds-sub">
              {/* Was a flat sentence naming a place with no way to get there.
                  The shell already builds this href (WorkProjectShell.jsx:283).
                  Still here because uploading an MEP bill in the first place,
                  and everything else about a services project, remains classic. */}
              {candidatesFailed
                ? "We could not check for services projects just now. "
                : "Nothing of yours is measured in Revit MEP yet. "}
              Linking is done in{" "}
              {classicHref ? (
                <a href={classicHref}>the classic workspace</a>
              ) : (
                "the classic workspace"
              )}
              .
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
