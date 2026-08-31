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
import WkPrefs from "./WkPrefs.jsx";

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
/**
 * His product marks, already in public/ds. Keyed by OUR product key, which is
 * the legacy CAD-host slug — /product/revit is QUIV, planswift is HERON.
 */
const PRODUCT_ICON = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  mep: "/ds/ic-mep.png",
  civil3d: "/ds/ic-civiq.png",
};

/** His second line, for a product with no work of its own to report. */
const OFF_SUB = {
  revit: "Measurement straight off the 3D model",
  rategen: "Prices everything the other products measure",
  planswift: "Flat drawings, landing on the same work items",
  "qs-takeoff": "Durations come from gang output already held in the rates",
  mep: "Services measured against the same bill",
  civil3d: "Civil and infrastructure measurement",
  archicad: "Measurement from the ArchiCAD model",
};

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
  return k ? `/projects/${k}` : "/manage";
};

export default function DsWorkHome() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = React.useState(null);
  const [rail, setRail] = React.useState(null);
  const [summary, setSummary] = React.useState(null);
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

    // His last "Needs a decision" card is about what is on the plan but not
    // installed on this machine, which is what /me/summary carries.
    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setSummary(null));

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
      const k = p.baseProductKey || p.productKey || "other";
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

  // Memoised because productCards depends on it; a fresh array every render
  // would rebuild those cards on every render too.
  const sources = React.useMemo(
    () => (view$ ? Object.entries(view$.bySource) : []),
    [view$],
  );

  // His "Your work, by product": one card per product we sell, owned or not,
  // with what this account has actually produced in it. `on` is whether the
  // account holds it — his `.off` class dims the rest rather than hiding them,
  // because "you do not have this yet" is the point of showing it.
  // His "Your work, by product", card for card.
  //
  // The six he lists, in his order, each line phrased in that product's OWN
  // units rather than one generic "N items from M projects" for all of them:
  // QUIV counts elements out of Revit models, HERON counts items off sheets,
  // RateGen counts what is in the library, Time Pro counts programmes. That is
  // the whole point of the panel — it says what each one has actually done.
  //
  // ArchiCAD is not in his list because his build has no such product. It is
  // appended only when this account has ArchiCAD work, so the common case
  // matches him exactly and real work is never hidden.
  const productCards = React.useMemo(() => {
    const s2 = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
    const last = {};
    const named = {};
    for (const x of view$?.recent || []) {
      const k = x.baseProductKey || x.productKey || "other";
      if (!last[k] && x.updatedAt) last[k] = x.updatedAt;
      if (!named[k]) named[k] = x.name;
    }

    const build = (key, line, sub, cta, go) => {
      const src = view$?.bySource?.[key];
      return {
        key,
        name: PRODUCT[key],
        on: !!src,
        line: src ? line(src) : "Not on this account",
        sub: src ? sub(src) : OFF_SUB[key],
        cta: src ? cta : "Add it",
        go: src ? go : "/manage/products",
      };
    };

    const cards = [
      build(
        "revit",
        (v) => `${s2(v.items, "element", "elements")} from ${s2(v.projects, "Revit model", "Revit models")}`,
        () => (last.revit ? `Last read ${when(last.revit)}` : OFF_SUB.revit),
        "Projects",
        "/work/projects",
      ),
      {
        key: "rategen",
        name: PRODUCT.rategen,
        // RateGen is the one product whose work is not projects — it is the
        // library itself, which is why his line counts rates rather than
        // takeoffs. /me/rail already carries that number for the sidebar.
        on: !!rail?.rates,
        // His line: "13 rates, 20 materials, 8 gangs". All three come off the
        // one library document /me/rail already reads. A part with none of
        // something is left out rather than shown as a zero — "0 gangs" tells
        // nobody anything.
        line: rail?.rates
          ? [
              s2(rail.rates, "rate", "rates"),
              rail.materials ? s2(rail.materials, "material", "materials") : null,
              rail.gangs ? s2(rail.gangs, "gang", "gangs") : null,
            ]
              .filter(Boolean)
              .join(", ")
          : "Not on this account",
        sub: OFF_SUB.rategen,
        cta: rail?.rates ? "Library" : "Add it",
        go: rail?.rates ? "/work/library" : "/manage/products",
      },
      build(
        "planswift",
        (v) => `${s2(v.items, "item", "items")} off ${s2(v.projects, "sheet set", "sheet sets")}`,
        () => OFF_SUB.planswift,
        "See them",
        "/work/projects",
      ),
      build(
        "qs-takeoff",
        (v) => `${s2(v.projects, "programme", "programmes")}, derived from the quantities`,
        () => OFF_SUB["qs-takeoff"],
        "Programme",
        "/work/programme",
      ),
      build(
        "mep",
        (v) =>
          `${s2(v.items, "services item", "services items")}${
            named.mep ? ` from ${named.mep}` : ""
          }`,
        () => (last.mep ? `Last read ${when(last.mep)}` : OFF_SUB.mep),
        "See them",
        "/work/projects",
      ),
      build(
        "civil3d",
        (v) => `${s2(v.items, "item", "items")} from ${s2(v.projects, "alignment", "alignments")}`,
        () => (last.civil3d ? `Last read ${when(last.civil3d)}` : OFF_SUB.civil3d),
        "Projects",
        "/work/projects",
      ),
    ];

    if (view$?.bySource?.archicad) {
      cards.push(
        build(
          "archicad",
          (v) => `${s2(v.items, "item", "items")} from ${s2(v.projects, "model", "models")}`,
          () => (last.archicad ? `Last read ${when(last.archicad)}` : OFF_SUB.archicad),
          "Projects",
          "/work/projects",
        ),
      );
    }
    return cards;
  }, [view$, rail]);

  const attention = React.useMemo(() => {
    const out = [];
    const projects = view$?.recent || [];

    // His cards are keyed by the SUBJECT — the project, the course, the Hub —
    // not by a category. "MOREMI ESTATE BLOCK A / HERON data is 7 days older
    // than the project" tells you which thing needs the decision before it
    // tells you what kind of decision it is.
    // Capped, because his panel is a summary and ours is not a mock.
    //
    // Unbounded, this account produced FORTY-EIGHT cards — every old project it
    // has ever had, five of them called "Road Earthworks — New Road Design".
    // A wall of identical rows is not a list of decisions; it is a list you
    // stop reading. His shows four. These take the few that most deserve a
    // look: the biggest unpriced takeoffs, and the longest untouched.
    const unpriced = projects
      .filter((y) => (y.itemCount || 0) > 0 && !(Number(y.totalCost) || 0))
      .sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));

    for (const x of unpriced.slice(0, 2)) {
      out.push({
        k: x.name,
        t: "Measured, but nothing is priced against it",
        d: `${num(x.itemCount)} item${x.itemCount === 1 ? "" : "s"} taken off${
          x.updatedAt ? `, last touched ${when(x.updatedAt)}` : ""
        }. The rate library is what turns them into money.`,
        cta: "Open the project",
        go: projectHref(x),
      });
    }

    if (unpriced.length > 2) {
      out.push({
        k: "Rate library",
        t: `${unpriced.length - 2} more project${
          unpriced.length - 2 === 1 ? " is" : "s are"
        } measured but not priced`,
        d: "Everything measured turns into money through the same library.",
        cta: "Open the library",
        go: "/work/library",
      });
    }

    const OLD = 90 * 86400000;
    const stale = projects
      .filter((y) => y.updatedAt && Date.now() - new Date(y.updatedAt).getTime() > OLD)
      .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

    for (const x of stale.slice(0, 1)) {
      const days = Math.round((Date.now() - new Date(x.updatedAt).getTime()) / 86400000);
      out.push({
        k: x.name,
        t: `Not opened in ${days} days`,
        d: `Last read ${when(x.updatedAt)}. Anything drawn since then is not in this bill.`,
        cta: "Open the project",
        go: projectHref(x),
      });
    }

    if (stale.length > 1) {
      out.push({
        k: "Projects",
        t: `${stale.length - 1} more have not been opened in three months`,
        d: "Anything drawn since they were last read is not in those bills.",
        cta: "See them",
        go: "/work/projects",
      });
    }

    // His Installer Hub card: on the plan, but not on this machine.
    const installedKeys = new Set(
      (summary?.installations || []).map((i) => i.installationProductKey).filter(Boolean),
    );
    // PRODUCT is the map of things that actually install. A feature grant like
    // boq-import is an entitlement with no installer behind it, and telling
    // somebody to install one is not a decision they can act on — the Manage
    // overview already learned this the same way, where it produced "1 of your
    // 1 boq-import seat is not installed anywhere".
    const notInstalled = (summary?.entitlements || [])
      .filter((e) => !e.isCourse && PRODUCT[e.productKey] && !installedKeys.has(e.productKey))
      .map((e) => PRODUCT[e.productKey]);
    if (notInstalled.length) {
      out.push({
        k: "Installer Hub",
        t: `${notInstalled.length} product${
          notInstalled.length === 1 ? " is" : "s are"
        } on the plan but not installed here`,
        d: `${notInstalled.join(", ")}. The Hub installs what this account already pays for.`,
        cta: "Install them",
        go: "/manage/downloads",
      });
    }

    return out;
  }, [view$, summary]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Your work could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view$) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Loading your work…</p>
      </div>
    );
  }

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

            {/* His zone and currency dropdowns, beside the layout switch.
                Zone is what the rate library is priced against, so this is
                not decoration — changing it changes every number below. */}
            <WkPrefs />
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
              <span className="ds-sub">
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
              <span className="ds-sub">
                across {sources.length} extraction source{sources.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="dsh-stat">
              <span className="k">Valued to date</span>
              <b>{money(view$.valued)}</b>
              <span className="ds-sub">
                {view$.value > 0
                  ? `${Math.round((view$.valued / view$.value) * 100)}% of the work in hand`
                  : "nothing valued yet"}
              </span>
            </div>
            {rail?.rates ? (
              <div className="dsh-stat">
                <span className="k">Rate library</span>
                <b>{num(rail.rates)}</b>
                <span className="ds-sub">build-ups you can price against</span>
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

          {/* His register, and only in the register view — his cards layout
              does not contain it. */}
          {view === "table" && (
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
                        <em>{p.shared ? "Shared with you" : PRODUCT[p.baseProductKey] || ""}</em>
                      </span>
                      <span className="src">
                      {PRODUCT[p.baseProductKey] || p.baseProductKey || ""}
                      {p.isMaterials ? <i> · materials</i> : null}
                    </span>
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
          )}

          {/* His "Your work, by product". A card per product we sell, owned or
              not: .off dims the ones this account does not hold rather than
              hiding them, which is his point — the panel is also how somebody
              discovers what else measures into the same bill. */}
          {view === "cards" && (
            <section className="wk-panel">
              <div className="wk-ph">
                <h2>Your work, by product</h2>
                <Link className="more" to="/manage/products">
                  Manage products
                </Link>
              </div>
              <div className="wh-prods">
                {productCards.map((c) => (
                  <article className={`wh-prod${c.on ? "" : " off"}`} key={c.key}>
                    {/* His card carries an <img>, and .wh-prod img is what sizes
                        it to 34px — an inline SVG here gets no sizing rule at
                        all and renders at whatever it likes. */}
                    {PRODUCT_ICON[c.key] ? (
                      <img src={PRODUCT_ICON[c.key]} alt="" />
                    ) : (
                      icon(c.key)
                    )}
                    <div>
                      <b>{c.name}</b>
                      <span>{c.line}</span>
                      <em>{c.sub}</em>
                    </div>
                    <Link className="ds-btn btn-o ds-btn-sm" to={c.go}>
                      {c.cta}
                    </Link>
                  </article>
                ))}
              </div>
              <p className="wk-note">
                One extraction feeds all of them. QUIV reads the model once; RateGen prices it,
                Time Pro sequences it, and a valuation is the same numbers on a date. Nothing is
                measured twice.
              </p>
            </section>
          )}

          {/* His "Needs a decision". Every row is derived from this account's
              own work — a project measured but never priced, one nobody has
              opened in three months — rather than a fixed list. */}
          {view === "cards" && attention.length > 0 && (
            <section className="wk-panel">
              <div className="wk-ph">
                <h2>Needs a decision</h2>
                <span className="wk-locnote">{attention.length} open</span>
              </div>
              <div className="wh-att">
                {attention.map((a) => (
                  <div className="wh-a" key={a.k + a.t}>
                    <span className="k">{a.k}</span>
                    <b>{a.t}</b>
                    <p>{a.d}</p>
                    <Link className="ds-btn btn-o ds-btn-sm" to={a.go}>
                      {a.cta}
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}
