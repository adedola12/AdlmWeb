// The full workspace: the whole project on one screen, at one date.
//
// WHAT THIS IS FOR
//
// The tabs answer "what is true now", each about one thing. This answers "what
// is true on the 14th of March" about all of them at once: which tasks are
// running, which bill lines they are building, which parts of the model that
// is, what should have been bought by then, what it should have cost and what
// it has. Moving the date moves all of it together.
//
// WHY THE PROGRAMME CARRIES IT AND THE MODEL ONLY ENRICHES IT
//
// A 3D model reaches a project exactly one way — somebody uploads an IFC by
// hand in the classic Bill tab. QUIV and HERON push quantities and element IDs,
// never geometry. So a screen built around the viewport would be empty on
// almost every real job. The programme is the spine instead: dates, cost and
// procurement work from the bill and the tasks, which every project can have,
// and the viewport appears when there is something to show.
//
// NO CHARTING LIBRARY
//
// The curve is an inline SVG polyline. The client has no charting dependency
// and adding one for two lines would be ~180KB on a screen that already loads
// three.js.

import React from "react";
import { buyRows } from "./budgetModel.js";
import {
  costSeries,
  dateAt,
  fractionOf,
  scrubRange,
  snapshotAt,
} from "./fourDModel.js";
import { taskProgress } from "./pmModel.js";
import { EN_DASH, compact, money } from "./workProjectFormat.js";

// three.js and web-ifc are ~1.4MB between them. They load when a project
// actually has a model, not when the screen opens.
const ModelViewer = React.lazy(() => import("../projects/ModelViewer.jsx"));

const dayLabel = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : EN_DASH;

const shortDay = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : EN_DASH;

/** One figure in the right-hand rail. */
function Stat({ label, value, sub, tone = "" }) {
  return (
    <div className={tone ? `fd-stat ${tone}` : "fd-stat"}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <em>{sub}</em> : null}
    </div>
  );
}

/**
 * Planned value against committed spend, over the whole programme.
 *
 * Two polylines in a 0-100 box, so the SVG scales with its container and needs
 * no measurement pass.
 */
function CostCurve({ series, at }) {
  if (!series.length) return null;
  const top = Math.max(1, ...series.map((p) => Math.max(p.planned, p.spend)));
  const x = (i) => (i / (series.length - 1)) * 100;
  const y = (v) => 100 - (v / top) * 100;
  const path = (key) => series.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const now = at * 100;
  return (
    <div className="fd-curve">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline className="pl" points={path("planned")} />
        <polyline className="sp" points={path("spend")} />
        <line className="nw" x1={now} x2={now} y1="0" y2="100" />
      </svg>
      <div className="lg">
        <span className="pl">Planned value</span>
        <span className="sp">Committed spend</span>
      </div>
    </div>
  );
}

export default function WorkProjectFourD({
  project,
  productKey = "",
  projectId = "",
  accessToken = "",
  onExit,
  onOpenLine,
}) {
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  const tasks = React.useMemo(() => {
    const pm = project?.pm || project?.projectManagement || {};
    return Array.isArray(pm.tasks) ? pm.tasks : [];
  }, [project]);
  const rows = React.useMemo(() => buyRows(project), [project]);
  const range = React.useMemo(() => scrubRange(tasks), [tasks]);
  const series = React.useMemo(
    () => costSeries(tasks, items, rows, { steps: 48 }),
    [tasks, items, rows],
  );

  // The scrubber's position, 0-1. Starts at today when today is inside the
  // programme — a QS opening this wants where the job actually is, not day one.
  const [at, setAt] = React.useState(() => (range ? fractionOf(range, new Date()) : 0));
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);

  // Playback. One step per frame-ish, scaled so the whole programme takes about
  // twenty seconds at 1x whatever its length — a six-month job and a two-year
  // job should both be watchable.
  React.useEffect(() => {
    if (!playing || !range) return undefined;
    const t = window.setInterval(() => {
      setAt((v) => {
        const next = v + (speed * 0.05) / 20;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(t);
  }, [playing, speed, range]);

  const date = range ? dateAt(range, at) : null;
  const snap = React.useMemo(
    () => snapshotAt(project, date, { rows }),
    [project, date, rows],
  );

  const models = project?.models || {};
  const hasModel = ["architectural", "structural", "mep"].some((d) => models?.[d]?.url);

  if (!range) {
    return (
      <div className="fd">
        <div className="pj-empty">
          <b>This project has no programme yet</b>
          <p>
            The full workspace runs on dates, and the only dated thing in a project is its
            programme. A bill line does not know when it is built. Plan the work from the bill
            on the PM dashboard, and this screen fills in: the timeline, what is being built on
            any date, what has to be bought by then and what it should have cost.
          </p>
          <div className="pj-acts">
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onExit}>
              Leave full screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fd">
      <div className="fd-top">
        <div className="fd-view">
          {hasModel ? (
            <React.Suspense
              fallback={<div className="fd-load">Loading the model{EN_DASH}</div>}
            >
              <ModelViewer
                compact
                height={420}
                projectModels={models}
                items={items}
                productKey={productKey}
                projectId={projectId}
                accessToken={accessToken}
                highlightIds={snap.elementIds}
                onPickElement={null}
              />
            </React.Suspense>
          ) : (
            <div className="fd-nomodel">
              <b>No 3D model on this project</b>
              <p>
                QUIV and HERON send quantities, not geometry. Attach an IFC in the classic
                workspace and the elements being built on the chosen date light up here.
              </p>
              <span>
                {snap.elementIds.length
                  ? `${snap.elementIds.length} elements are measured on the lines running today`
                  : "This bill carries no model element ids"}
              </span>
            </div>
          )}
        </div>

        <div className="fd-rail">
          <Stat label="Earliest start" value={shortDay(range.from)} sub={`${range.days} days`} />
          <Stat label="Latest finish" value={shortDay(range.to)} sub={`${snap.total} tasks`} />
          <Stat
            label="Planned to date"
            value={compact(snap.planned)}
            sub={`${snap.done} of ${snap.total} tasks finished`}
          />
          <Stat
            label="Built to date"
            value={compact(snap.earned)}
            sub={
              snap.variance >= 0
                ? `${compact(Math.abs(snap.variance))} ahead of plan`
                : `${compact(Math.abs(snap.variance))} behind plan`
            }
            tone={snap.variance < 0 ? "warn" : "ok"}
          />
          <Stat
            label="Procurement made"
            value={compact(snap.procurement.bought)}
            sub={
              snap.procurement.toBuy
                ? `${compact(snap.procurement.toBuy)} still to buy`
                : "Everything is bought"
            }
          />
          <Stat
            label="Overdue to buy"
            value={snap.procurement.overdue ? compact(snap.procurement.overdue) : EN_DASH}
            sub={
              snap.procurement.overdue
                ? "Should have been bought by this date"
                : "Nothing is late at this date"
            }
            tone={snap.procurement.overdue ? "warn" : ""}
          />
          <Stat
            label="Next spend"
            value={snap.procurement.next ? compact(snap.procurement.next.amount) : EN_DASH}
            sub={
              snap.procurement.next
                ? `${snap.procurement.next.name} by ${shortDay(snap.procurement.next.buyBy)}`
                : "Nothing scheduled after this date"
            }
          />
        </div>
      </div>

      <div className="fd-bar">
        <button
          type="button"
          className="fd-play"
          aria-label={playing ? "Pause" : "Play the sequence"}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <b className="fd-date">{dayLabel(date)}</b>
        <input
          className="fd-scrub"
          type="range"
          min="0"
          max="1000"
          value={Math.round(at * 1000)}
          aria-label="Move through the programme"
          onChange={(e) => {
            setPlaying(false);
            setAt(Number(e.target.value) / 1000);
          }}
        />
        <select
          className="fd-speed"
          value={speed}
          aria-label="Playback speed"
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onExit}>
          Leave full screen
        </button>
      </div>

      <div className="fd-bottom">
        <div className="fd-panel">
          <div className="fd-hd">
            <b>Cost over time</b>
            <em>
              {compact(snap.planned)} planned {EN_DASH} {compact(snap.procurement.bought)} spent
            </em>
          </div>
          <CostCurve series={series} at={at} />
        </div>

        <div className="fd-panel">
          <div className="fd-hd">
            <b>On this date</b>
            <em>
              {snap.tasks.length} {snap.tasks.length === 1 ? "task" : "tasks"} {EN_DASH}{" "}
              {compact(snap.linesValue)} of work
            </em>
          </div>
          <div className="fd-gantt">
            {tasks.map((t, i) => {
              const s = fractionOf(range, t?.startDate) * 100;
              const e = fractionOf(range, t?.endDate) * 100;
              const live = snap.tasks.includes(t);
              return (
                <div className="fd-row" key={t?.taskId || t?._id || `${t?.name}-${i}`}>
                  <span className="nm" title={t?.name}>
                    {t?.name || "Untitled task"}
                  </span>
                  <span className="tr">
                    <i
                      className={live ? "br on" : "br"}
                      style={{ left: `${s}%`, width: `${Math.max(1, e - s)}%` }}
                    >
                      <u style={{ width: `${taskProgress(t, items)}%` }} />
                    </i>
                    <s className="nw" style={{ left: `${at * 100}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="fd-panel">
          <div className="fd-hd">
            <b>Being built</b>
            <em>
              {snap.lineIndexes.length} bill{" "}
              {snap.lineIndexes.length === 1 ? "line" : "lines"} {EN_DASH}{" "}
              {snap.progressOfLines}% done
            </em>
          </div>
          <div className="fd-lines">
            {snap.lineIndexes.length ? (
              snap.lineIndexes.slice(0, 40).map((i) => (
                <button
                  type="button"
                  className="fd-line"
                  key={i}
                  onClick={() => onOpenLine?.(i)}
                >
                  <span className="ds">
                    <b>{items[i]?.description || "Untitled line"}</b>
                    <em>{items[i]?.category || "Uncategorized"}</em>
                  </span>
                  <span className="n">{money((items[i]?.qty || 0) * (items[i]?.rate || 0))}</span>
                </button>
              ))
            ) : (
              <p className="fd-none">Nothing is scheduled on this date.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
