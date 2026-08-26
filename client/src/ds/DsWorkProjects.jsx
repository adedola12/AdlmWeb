// His projects screen — sources first, then the projects inside one.
//
// His markup: .wk-projs / .wk-proj with its .t / h3 / .stage / .c / .s / .f
// blocks, and .wk-src for the extraction source chip. The three figures in the
// foot are his: items, value, and how much of it has been valued.
//
// Two of his fields have no equivalent in our data and are not invented:
//
//   * Client. His card carries one under the name. We store a project name and
//     an owner, not a client, so the sub-line carries what we do know — where
//     the quantities came from, and whether the project is shared with you
//     rather than yours.
//   * Stage ("Tender", "Construction"). Nothing records it. The chip shows
//     valuation state instead, which is a real fact about the project and is
//     what the colour was carrying anyway.

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
        month: "short",
        year: "numeric",
      })
    : "";

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
};

const ICONS = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  mep: "/ds/ic-mep.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  civil3d: "/ds/ic-civiq.png",
};

const SORTS = [
  { id: "recent", label: "Recently touched" },
  { id: "value", label: "Value" },
  { id: "name", label: "Name" },
];

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

export default function DsWorkProjects() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [sort, setSort] = React.useState("recent");
  const [q, setQ] = React.useState("");
  const [openKey, setOpenKey] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/projects-rollup", { token: accessToken })
      .then((d) => alive && setProjects(d.projects || []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  // Projects arrive as one flat list, but they do not come from one place: a
  // QUIV extraction, a HERON takeoff and a CIVIQ corridor are different kinds
  // of work that happen to share an account. So the first level is the source,
  // and a source opens to show what is inside it.
  //
  // This is not a contradiction of "organised by project, not by product". The
  // grouping is by where the quantities were MEASURED, which is a fact about
  // the project rather than a product menu; what the surface refuses to do is
  // make somebody go to a product to find their work. Everything is still
  // here, one level down, and the counts are on the folder so the level costs
  // nothing to read past.
  const folders = React.useMemo(() => {
    if (!projects) return null;
    const by = new Map();
    for (const p of projects) {
      const key = p.productKey || "other";
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(p);
    }
    return [...by.entries()]
      .map(([key, list]) => ({
        key,
        // "other" is the bucket for a project with no productKey, and it is a
        // key rather than a name — `PRODUCT[key] || key` would print the word
        // "other" on the card, which tells nobody anything. A project without
        // a source came in some other way, so say that.
        name: key === "other" ? "Imported" : PRODUCT[key] || key,
        icon: ICONS[key] || "",
        count: list.length,
        items: list.reduce((n, p) => n + (Number(p.itemCount) || 0), 0),
        value: list.reduce((n, p) => n + (Number(p.totalCost) || 0), 0),
        touched: list.reduce(
          (d, p) => (new Date(p.updatedAt || 0) > new Date(d || 0) ? p.updatedAt : d),
          null,
        ),
      }))
      .sort((a, b) => b.value - a.value);
  }, [projects]);

  // What is on screen: one source's projects once a folder is open.
  const shown = React.useMemo(() => {
    if (!projects) return null;
    const pool = openKey
      ? projects.filter((p) => (p.productKey || "other") === openKey)
      : projects;
    const term = q.trim().toLowerCase();
    const list = term
      ? pool.filter((p) => String(p.name || "").toLowerCase().includes(term))
      : [...pool];

    if (sort === "value") {
      list.sort((a, b) => (Number(b.totalCost) || 0) - (Number(a.totalCost) || 0));
    } else if (sort === "name") {
      list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else {
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }
    return list;
  }, [projects, sort, q, openKey]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your projects could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!shown || !folders) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your projects…</p>
      </div>
    );
  }

  const total = projects.reduce((a, p) => a + (Number(p.totalCost) || 0), 0);
  const openFolder = openKey ? folders.find((f) => f.key === openKey) : null;

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>{openFolder ? openFolder.name : "Projects"}</h1>
          <p>
            {!projects.length
              ? "Nothing here yet."
              : openFolder
                ? `${openFolder.count} project${openFolder.count === 1 ? "" : "s"} measured in ${openFolder.name}, worth ${money(openFolder.value)}.`
                : `${projects.length} project${projects.length === 1 ? "" : "s"} across ${folders.length} source${folders.length === 1 ? "" : "s"}, worth ${money(total)} at the rates they were priced with.`}
          </p>
          {openFolder && (
            <p className="wk-ref">
              <button
                type="button"
                onClick={() => {
                  setOpenKey("");
                  setQ("");
                }}
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--action)",
                  font: "inherit",
                }}
              >
                ← All sources
              </button>
            </p>
          )}
        </div>
        {openFolder && openFolder.count > 1 && (
          <div className="wk-acts">
            <div className="wk-loc-sw" aria-label="Sort the projects">
              {SORTS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={sort === opt.id ? "on" : ""}
                  onClick={() => setSort(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!projects.length ? (
        <section className="wk-panel">
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
              A project appears here the moment one of the plugins sends its first extraction
              up. Measure in QUIV or HERON, price it in RateGen, and it lands with everything
              it is worth.
            </p>
            <Link className="btn btn-p btn-sm" to="/manage/downloads" style={{ marginTop: 16 }}>
              Install the plugins
            </Link>
          </div>
        </section>
      ) : !openFolder ? (
        /* Level one: the sources. A button rather than a link, because opening
           one is a change of view rather than a navigation — the browser's back
           button should leave the screen, not close a folder. */
        <div className="wk-projs">
          {folders.map((f) => (
            <button
              type="button"
              className="wk-proj"
              key={f.key}
              onClick={() => setOpenKey(f.key)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                font: "inherit",
                width: "100%",
              }}
            >
              <div className="t">
                <h3>
                  {f.icon && (
                    <img
                      src={f.icon}
                      alt=""
                      style={{
                        width: 20,
                        height: 20,
                        verticalAlign: -4,
                        marginRight: 9,
                        objectFit: "contain",
                      }}
                    />
                  )}
                  {f.name}
                </h3>
                <span className="stage">
                  {f.count} project{f.count === 1 ? "" : "s"}
                </span>
              </div>
              <p className="c">
                {f.key === "other" ? "No extraction source recorded" : `Measured in ${f.name}`}
                {f.touched ? ` · touched ${when(f.touched)}` : ""}
              </p>
              <div className="f">
                <div>
                  <b>{num(f.items)}</b>
                  <span>items</span>
                </div>
                <div>
                  <b>{money(f.value)}</b>
                  <span>value</span>
                </div>
                <div>
                  <b>{Math.round(total ? (f.value / total) * 100 : 0)}%</b>
                  <span>of the book</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Level two: what is inside the open source. */
        <>
          {openFolder.count > 6 && (
            <div style={{ marginBottom: 18 }}>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Find a project in ${openFolder.name}`}
                aria-label="Find a project by name"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "var(--ink)",
                  fontSize: 13.5,
                }}
              />
            </div>
          )}

          {shown.length ? (
            <div className="wk-projs">
              {shown.map((p) => {
                const pct = Math.round(p.progressPercent || 0);
                return (
                  <Link className="wk-proj" to={projectHref(p)} key={p.id}>
                    <div className="t">
                      <h3>{p.name}</h3>
                      <span className={pct > 0 ? "stage amber" : "stage"}>
                        {pct > 0 ? `${pct}% valued` : "Not valued"}
                      </span>
                    </div>
                    <p className="c">
                      {p.shared ? "Shared with you" : "Yours"}
                      {p.version ? ` · v${p.version}` : ""} · touched {when(p.updatedAt)}
                    </p>
                    <div className="s">
                      <span className="wk-src">
                        {ICONS[p.productKey] && <img src={ICONS[p.productKey]} alt="" />}
                        {PRODUCT[p.productKey] || p.productKey || "Imported"}
                      </span>
                      {p.publicShareEnabled && <span className="wk-src sm">Share link on</span>}
                    </div>
                    <div className="f">
                      <div>
                        <b>{num(p.itemCount)}</b>
                        <span>items</span>
                      </div>
                      <div>
                        <b>{money(p.totalCost)}</b>
                        <span>value</span>
                      </div>
                      <div>
                        <b>{money(p.remainingAmount)}</b>
                        <span>remaining</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="sub">
              Nothing in {openFolder.name} matches “{q}”.
            </p>
          )}
        </>
      )}
    </div>
  );
}
