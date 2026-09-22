// His project gallery (work-proj.js gallery(), 17 Sep 2026) on our projects
// (P0.4). His markup and classes: .pj-bar-tools with .pj-search, three .wk-dd
// dropdowns and .pj-views; .pj-sum; then .pj-grid of .pj-card, or the
// .pj-table list. Grid or list is remembered per browser.
//
// His data has fields ours does not, so each is mapped to a real fact rather
// than invented:
//   stage    his six stages, from what the project actually holds: no rates
//            yet is Takeoff, priced is Priced, a valuation started is
//            Valuations, fully valued is Final account.
//   client   we store no client; the line says whose project it is.
//   progress valued %, the one progress figure we record.
//   flags    shared with you, share link on, material schedule.

import React from "react";
import { Link } from "react-router-dom";
import WkDropdown from "./WkDropdown.jsx";
// His work-proj.css (ported in P0.3), which nothing loaded until now.
import "../styles/ds-work-proj.css";
import { projectWorkspaceHref } from "../lib/projectLinks.js";
import {
  SOURCES,
  STAGES,
  STAGE_ORDER,
  compact,
  estimatedOf,
  isMoneyHidden,
  short,
  sourceOf,
  stageOf,
} from "../lib/projectGallery.js";

/** The one placeholder for a withheld or empty figure. An en dash. */
const DASH = "–";

/**
 * What this card may say about money.
 *
 * A project shared by somebody who may not show this reader rates comes back
 * flagged `moneyHidden`. The card then shows an en dash — never a figure, and
 * never a zero that reads as "worth nothing" — and the row is left out of the
 * total at the top, which says so.
 */
const estimatedCell = (p) => (isMoneyHidden(p) ? DASH : compact(estimatedOf(p)));

/** Sorting by value must not rank a figure the screen will not print. */
const sortValue = (p) => (isMoneyHidden(p) ? 0 : estimatedOf(p));

const ICON = {
  grid: (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  ),
};

const Stage = ({ p }) => {
  const s = stageOf(p);
  return <span className={`pj-stage s-${s}`}>{STAGES.find((x) => x.id === s)?.name}</span>;
};

const Bar = ({ pct }) => (
  <span className={pct >= 100 ? "pj-bar ok" : "pj-bar"}>
    <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </span>
);

function Flags({ p }) {
  const f = [];
  if (p.shared) f.push(<span key="s" className="pj-flag mute">Shared with you</span>);
  if (isMoneyHidden(p)) f.push(<span key="h" className="pj-flag mute">Money hidden</span>);
  if (p.publicShareEnabled) f.push(<span key="l" className="pj-flag mute">Share link on</span>);
  if (p.isMaterials) f.push(<span key="m" className="pj-flag">Material schedule</span>);
  return f.length ? f : null;
}

const whose = (p) => `${p.shared ? "Shared with you" : "Yours"}${p.version ? ` · v${p.version}` : ""}`;

const VIEW_KEY = "adlm-pj-view";

/**
 * @param {object} p
 * @param {object[]|null} p.projects  normalised rollup rows (lib/projectLinks.js)
 * @param {string} [p.fixedTool]      a source key; the tool page shows only its own
 */
export default function DsProjectGallery({ projects, fixedTool = "" }) {
  const [q, setQ] = React.useState("");
  const [tool, setTool] = React.useState(fixedTool || "all");
  const [stage, setStage] = React.useState("all");
  const [sort, setSort] = React.useState("updated");
  const [view, setView] = React.useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  const tools = React.useMemo(() => {
    const have = new Set((projects || []).map(sourceOf).filter((k) => SOURCES[k]));
    return [...have];
  }, [projects]);

  const list = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = (projects || []).filter((p) => {
      if (tool !== "all" && sourceOf(p) !== tool) return false;
      if (stage !== "all" && stageOf(p) !== stage) return false;
      if (term && !String(p.name || "").toLowerCase().includes(term)) return false;
      return true;
    });
    out.sort((a, b) => {
      // A withheld figure sorts as nothing rather than by its real size: the
      // order of the cards must not rank money the screen is refusing to show.
      if (sort === "value") return sortValue(b) - sortValue(a);
      if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sort === "stage") return STAGE_ORDER[stageOf(a)] - STAGE_ORDER[stageOf(b)];
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    return out;
  }, [projects, q, tool, stage, sort]);

  const pick = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-browser nicety only */
    }
  };

  const filtered = !!q.trim() || stage !== "all" || (!fixedTool && tool !== "all");
  // A first run is an account (or a tool page) with nothing in it at all —
  // not a filter that happens to match nothing. Keeping the two apart is the
  // whole point of rec-05: the same words cannot serve both.
  const firstRun = !filtered && !(projects || []).some((p) => !fixedTool || sourceOf(p) === fixedTool);
  // The total is the sum of the figures actually on screen. A project whose
  // money is withheld shows an en dash, so it cannot be in the total either —
  // and the line says how many were left out rather than under-reporting.
  const counted = list.filter((p) => !isMoneyHidden(p));
  const withheld = list.length - counted.length;
  const total = counted.reduce((a, p) => a + estimatedOf(p), 0);
  const src = SOURCES[fixedTool];

  return (
    <>
      <div className="pj-bar-tools">
        <label className="pj-search">
          {ICON.search}
          <input
            type="search"
            placeholder="Search projects"
            aria-label="Search projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {fixedTool ? null : (
          <WkDropdown
            label="Source"
            value={tool}
            onPick={setTool}
            options={[
              { value: "all", label: "All tools" },
              ...tools.map((k) => ({ value: k, label: SOURCES[k].name, note: SOURCES[k].host })),
            ]}
          />
        )}
        <WkDropdown
          label="Stage"
          value={stage}
          onPick={setStage}
          options={[{ value: "all", label: "Every stage" }, ...STAGES.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <WkDropdown
          label="Sort"
          value={sort}
          onPick={setSort}
          options={[
            { value: "updated", label: "Recently updated" },
            { value: "value", label: "Estimated value" },
            { value: "name", label: "Name" },
            { value: "stage", label: "Stage" },
          ]}
        />
        <div className="pj-views" role="group" aria-label="Layout">
          {["grid", "list"].map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === "grid" ? "Grid" : "List"}
              aria-pressed={view === v}
              onClick={() => pick(v)}
            >
              {ICON[v]}
            </button>
          ))}
        </div>
      </div>

      <p className="pj-sum" aria-live="polite">
        {projects ? (
          <>
            {list.length} {list.length === 1 ? "project" : "projects"} ·{" "}
            <b>{counted.length ? compact(total) : DASH}</b> estimated
            {withheld
              ? ` · ${withheld} with money hidden ${withheld === 1 ? "is" : "are"} not counted`
              : ""}
          </>
        ) : (
          "Loading your projects…"
        )}
      </p>

      <div className="pj-out">
        {!projects ? null : !list.length ? (
          firstRun ? (
            // Nothing is filtered and there is nothing to filter: this account
            // has no projects at all. "Nothing matches those filters" was a
            // false message on somebody's first morning (rec-05). Say how a
            // project actually starts instead.
            <div className="pj-empty">
              <b>No projects yet</b>
              {fixedTool && src ? (
                <p>
                  Projects start in {src.host}. Open {src.name} there, measure, and save to ADLM
                  Cloud: the project appears here.
                </p>
              ) : (
                <p>
                  Projects start in the plugins. Measure in QUIV, HERON or Revit MEP, then save to
                  ADLM Cloud and the project appears here to price, plan and value.
                </p>
              )}
              {fixedTool ? null : (
                <div className="b">
                  <Link className="ds-btn btn-o ds-btn-sm" to="/work/tool/quiv">
                    How QUIV projects start
                  </Link>
                  <Link className="ds-btn btn-o ds-btn-sm" to="/work/tool/heron">
                    How HERON projects start
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="pj-empty">
              <b>No projects match</b>
              <p>
                {fixedTool && !filtered && src
                  ? `Projects start in ${src.host}. Open ${src.name} there, measure, and save to ADLM Cloud: the project appears here.`
                  : "Nothing matches those filters."}
              </p>
              {filtered ? (
                <button
                  type="button"
                  className="ds-btn btn-o ds-btn-sm"
                  onClick={() => {
                    setQ("");
                    setStage("all");
                    if (!fixedTool) setTool("all");
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )
        ) : view === "grid" ? (
          <div className="pj-grid">
            {list.map((p) => {
              const s = SOURCES[sourceOf(p)];
              const pct = Math.round(Number(p.progressPercent) || 0);
              return (
                <Link className="pj-card" key={p.id} to={projectWorkspaceHref(p)}>
                  <div className="top">
                    {s?.icon ? <img className="ti" src={s.icon} alt="" /> : null}
                    <span className="src">{s?.name || "Imported"}</span>
                    <Stage p={p} />
                  </div>
                  <b className="nm">{p.name}</b>
                  <span className="cl">{whose(p)}</span>
                  <div className="pr">
                    <span>Valued</span>
                    <em>{pct}%</em>
                  </div>
                  <Bar pct={pct} />
                  <div className="ft">
                    <div>
                      <span>Estimated</span>
                      <b>{estimatedCell(p)}</b>
                    </div>
                    <div>
                      <span>Updated</span>
                      <b>{short(p.updatedAt)}</b>
                    </div>
                  </div>
                  {Flags({ p }) ? (
                    <div className="fl">
                      <Flags p={p} />
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="pj-table" role="table">
            <div className="hd" role="row">
              <span>Project</span>
              <span>Source</span>
              <span>Stage</span>
              <span>Progress</span>
              <span className="n">Estimated</span>
              <span className="n">Updated</span>
            </div>
            {list.map((p) => {
              const s = SOURCES[sourceOf(p)];
              const pct = Math.round(Number(p.progressPercent) || 0);
              return (
                <Link className="rw" role="row" key={p.id} to={projectWorkspaceHref(p)}>
                  <span className="p">
                    <b>{p.name}</b>
                    <em>{whose(p)}</em>
                    {Flags({ p }) ? (
                      <span className="fl">
                        <Flags p={p} />
                      </span>
                    ) : null}
                  </span>
                  <span className="s">
                    {s?.icon ? <img className="ti" src={s.icon} alt="" /> : null}
                    {s?.name || "Imported"}
                  </span>
                  <span>
                    <Stage p={p} />
                  </span>
                  <span className="g">
                    <Bar pct={pct} />
                    <em>Valued {pct}%</em>
                  </span>
                  <span className="n">
                    <b>{estimatedCell(p)}</b>
                  </span>
                  <span className="n">{short(p.updatedAt)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
