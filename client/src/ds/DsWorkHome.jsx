// His Work overview, on real projects.
//
// The line in his brief that decides this screen: Work is organised BY PROJECT,
// NOT BY PRODUCT. Once data is extracted it stops belonging to one tool — a
// Revit extraction gives quantities, RateGen prices them, that becomes a
// valuation, Time Pro schedules against it. So the question this answers is
// "what am I in the middle of", where Manage answers "what am I paying for".
//
// His markup: .wk-head / .wk-acts / .dsh-stats / .dsh-stat / .wk-panel /
// .wk-ph / .wh-cont / .wh-go, and his two layouts — cards and a register —
// with the choice remembered, because somebody who prefers a register does not
// want to pick it again every morning.
//
// Every figure is from GET /me/projects-rollup, which is the aggregate the old
// dashboard already used: item counts, total cost, what has been valued and
// what is left. His sample tenant had four projects with typed totals; ours has
// whatever the account holds, including none.
//
// His location switch is NOT reproduced. It re-prices a whole portfolio into
// another geopolitical zone, and our rates are already stored priced to a zone
// — the switch would have to re-run RateGen against every item, which is a
// server job and not a display preference. Left for when there is an endpoint
// that can answer it honestly.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

// The catalogue keys are the legacy CAD-host slugs; these are the names people
// actually use for the products.
const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
};

const icon = (name) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#${name}`} />
  </svg>
);

const VIEW_KEY = "adlm-wh-view";

// Where a project opens today.
//
// His design has one project screen at /work/project/:id that serves every
// product. That screen is not built yet, and until it is, a project opens
// where it already opens: the per-product area the dashboard sends people to.
// Linking at the unbuilt route would be six dead links on the busiest screen
// of the surface.
const projectHref = (p) => {
  const k = String(p.productKey || "").toLowerCase();
  if (k === "archicad") return "/archicad";
  if (k === "rategen") return "/rategen";
  return k ? `/projects/${k}` : "/dashboard";
};

export default function DsWorkHome() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = React.useState(null);
  const [rail, setRail] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState(() => {
    if (typeof window === "undefined") return "cards";
    try {
      return window.localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards";
    } catch {
      return "cards";
    }
  });

  const chooseView = (v) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* a remembered preference is a nicety, not a requirement */
    }
  };

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/projects-rollup", { token: accessToken })
      .then((d) => alive && setProjects(d.projects || []))
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/rail", { token: accessToken })
      .then((d) => alive && setRail(d))
      // The rate count is one stat, not the screen.
      .catch(() => alive && setRail({}));

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const view$ = React.useMemo(() => {
    if (!projects) return null;

    const value = projects.reduce((a, p) => a + (Number(p.totalCost) || 0), 0);
    const items = projects.reduce((a, p) => a + (Number(p.itemCount) || 0), 0);
    const valued = projects.reduce((a, p) => a + (Number(p.valuedAmount) || 0), 0);

    // What each product has actually produced for this account, which is his
    // "measured from models" line read off the projects rather than typed.
    const bySource = {};
    for (const p of projects) {
      const k = p.productKey || "other";
      bySource[k] = bySource[k] || { projects: 0, items: 0, value: 0 };
      bySource[k].projects += 1;
      bySource[k].items += Number(p.itemCount) || 0;
      bySource[k].value += Number(p.totalCost) || 0;
    }

    const recent = [...projects].sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
    );

    // His register is sorted by value, biggest first — the question it answers
    // is "where is the money", not "what did I touch last".
    const byValue = [...projects].sort(
      (a, b) => (Number(b.totalCost) || 0) - (Number(a.totalCost) || 0),
    );

    return { value, items, valued, bySource, recent, byValue, count: projects.length };
  }, [projects]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your work could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view$) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your work…</p>
      </div>
    );
  }

  const sources = Object.entries(view$.bySource);
  const top = view$.recent[0] || null;

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Your work</h1>
          <p>
            Everything in hand, across every product on this account. Manage answers what you
            are paying for; this answers what you are in the middle of.
          </p>
        </div>
        {view$.count > 0 && (
          <div className="wk-acts">
            <div className="wk-loc-sw" aria-label="Choose a layout">
              {[
                ["cards", "Cards"],
                ["table", "Register"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={view === id ? "on" : ""}
                  onClick={() => chooseView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {view$.count === 0 ? (
        <section className="wk-panel">
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
              Nothing here yet. A project appears the moment one of the plugins sends its first
              extraction up: measure in QUIV or HERON, price it in RateGen, and it shows here
              with what it is worth.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <Link className="ds-btn btn-p ds-btn-sm" to="/manage/downloads">
                Install the plugins
              </Link>
              <Link className="ds-btn btn-o ds-btn-sm" to="/rategen">
                Open the rate library
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="dsh-stats">
            <div className="dsh-stat">
              <span className="k">Work in hand</span>
              <b>{money(view$.value)}</b>
              <span className="sub">
                {view$.count} project{view$.count === 1 ? "" : "s"} at the rates they were
                priced with
              </span>
            </div>
            <div className="dsh-stat">
              <span className="k">Measured</span>
              <b>
                {num(view$.items)}
                <span className="u">items</span>
              </b>
              <span className="sub">
                across {sources.length} extraction source{sources.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="dsh-stat">
              <span className="k">Valued to date</span>
              <b>{money(view$.valued)}</b>
              <span className="sub">
                {view$.value > 0
                  ? `${Math.round((view$.valued / view$.value) * 100)}% of the work in hand`
                  : "nothing valued yet"}
              </span>
            </div>
            {rail?.rates ? (
              <div className="dsh-stat">
                <span className="k">Rate library</span>
                <b>{num(rail.rates)}</b>
                <span className="sub">build-ups you can price against</span>
              </div>
            ) : null}
          </div>

          {view === "cards" && top && (
            <section className="wk-panel">
              <div className="wk-ph">
                <h2>Pick up where you left off</h2>
                <span className="wk-locnote">Across every product on this account</span>
              </div>
              <div className="wh-cont">
                <Link className="wh-go" to={projectHref(top)}>
                  {icon("wi-projects")}
                  <span className="k">Project</span>
                  <b>{top.name}</b>
                  <span className="s">
                    {num(top.itemCount)} items · {money(top.totalCost)} · touched{" "}
                    {when(top.updatedAt)}
                  </span>
                </Link>
                <Link className="wh-go" to="/rategen">
                  {icon("wi-library")}
                  <span className="k">Rate library</span>
                  <b>{rail?.rates ? `${num(rail.rates)} build-ups` : "Your rates"}</b>
                  <span className="s">
                    Priced to the zone each project sits in, shared by every product
                  </span>
                </Link>
                <Link className="wh-go" to="/work/projects">
                  {icon("wi-gantt")}
                  <span className="k">Everything else</span>
                  <b>All projects</b>
                  <span className="s">
                    {view$.count} in hand, newest first, with what each is worth
                  </span>
                </Link>
              </div>
            </section>
          )}

          <section className="wk-panel">
            <div className="wk-ph">
              <h2>Projects</h2>
              <Link className="more" to="/work/projects">
                See all
              </Link>
            </div>

            {/* His register: .wh-thd for the head row, .wh-row per project.
                The bar is share of the whole portfolio by value, which is what
                his `share` is — not progress, which gets its own column. */}
            <div className="wh-tbl">
              <div className="wh-thd">
                <span>Project</span>
                <span>From</span>
                <span>Items</span>
                <span>Share</span>
                <span>Touched</span>
                <span>Valued</span>
                <span>Value</span>
              </div>
              {(view === "table" ? view$.byValue : view$.recent.slice(0, 6)).map((p) => {
                const share = view$.value ? (Number(p.totalCost) || 0) / view$.value * 100 : 0;
                return (
                  <Link className="wh-row" to={projectHref(p)} key={p.id}>
                    <span className="n">
                      <b>{p.name}</b>
                      <em>{p.shared ? "Shared with you" : PRODUCT[p.productKey] || ""}</em>
                    </span>
                    <span className="src">{PRODUCT[p.productKey] || p.productKey || ""}</span>
                    <span className="it">
                      {num(p.itemCount)}
                      <i>items</i>
                    </span>
                    <span className="pg">
                      <i style={{ width: `${share.toFixed(1)}%` }} />
                      <em>{Math.round(share)}%</em>
                    </span>
                    <span className="up">{when(p.updatedAt)}</span>
                    <span className="st">
                      <em className={(p.progressPercent || 0) > 0 ? "b" : "a"}>
                        {Math.round(p.progressPercent || 0)}%
                      </em>
                    </span>
                    <span className="vl">{money(p.totalCost)}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          {view === "cards" && sources.length > 0 && (
            <section className="wk-panel">
              <div className="wk-ph">
                <h2>What each product has produced</h2>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div className="dsh-kv">
                  {sources.map(([k, s]) => (
                    <div key={k}>
                      <span>{PRODUCT[k] || k}</span>
                      <b>
                        {s.projects} project{s.projects === 1 ? "" : "s"} · {num(s.items)} items ·{" "}
                        {money(s.value)}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
