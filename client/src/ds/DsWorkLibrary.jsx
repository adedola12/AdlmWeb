// His rate library, on the real RateGen catalogue.
//
// Kept alongside /rategen rather than over it. That screen is 900 lines and
// does things this one does not — master and user tabs, materials, labour, the
// editing — and replacing working software with a redesign is a decision worth
// making deliberately. What this adds is the thing /rategen has never had: a
// way to open one rate and see what it is made of. See DsWorkRate.
//
// His markup: .wk-head / .wk-bar / .wk-find / .wk-tabs / .wk-count /
// .wk-tbl.wk-tbl-rates with .wk-hd and a .wk-row per rate.
//
// Two of his controls are not reproduced, for the same reason as on the Work
// overview: the location switch would have to re-price every rate against
// another geopolitical zone, which is a server job. Rates already arrive
// scoped to the caller's location by the endpoint, and the screen says which.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const SORTS = [
  { id: "section", label: "By section" },
  { id: "rate", label: "Dearest first" },
  { id: "recent", label: "Recently changed" },
];

export default function DsWorkLibrary() {
  const { accessToken } = useAuth();
  const [rates, setRates] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("section");
  const [section, setSection] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    // The sync route is the one that returns a rate WITH its breakdown, which
    // is what makes the build-up screen possible at all.
    apiAuthed("/rategen-v2/library/rates/sync", {
      token: accessToken,
      params: { limit: 500 },
    })
      .then((d) => alive && setRates(Array.isArray(d.items) ? d.items : []))
      .catch(() => alive && setFailed(true));

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const sections = React.useMemo(() => {
    if (!rates) return [];
    const seen = new Map();
    for (const r of rates) {
      const k = r.sectionKey || "";
      if (k && !seen.has(k)) seen.set(k, r.sectionLabel || k);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rates]);

  const shown = React.useMemo(() => {
    if (!rates) return null;
    const term = q.trim().toLowerCase();
    let list = rates;

    if (section) list = list.filter((r) => (r.sectionKey || "") === section);
    if (term) {
      list = list.filter((r) =>
        `${r.description || ""} ${r.itemNo || ""} ${r.sectionLabel || ""}`
          .toLowerCase()
          .includes(term),
      );
    }

    list = [...list];
    if (sort === "rate") {
      list.sort((a, b) => (Number(b.totalCost) || 0) - (Number(a.totalCost) || 0));
    } else if (sort === "recent") {
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    } else {
      list.sort(
        (a, b) =>
          String(a.sectionLabel || "").localeCompare(String(b.sectionLabel || "")) ||
          String(a.itemNo || "").localeCompare(String(b.itemNo || ""), undefined, {
            numeric: true,
          }),
      );
    }
    return list;
  }, [rates, q, sort, section]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your rate library could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!shown) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your rate library…</p>
      </div>
    );
  }

  const zone = rates.find((r) => r.zone)?.zone || rates.find((r) => r.state)?.state || "";

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Rate library</h1>
          <p>
            One library for the practice. A rate changed here reaches QUIV, HERON and Revit MEP
            through this account, and every project already priced with it.
          </p>
        </div>
        <div className="wk-acts">
          <Link className="btn btn-o btn-sm" to="/rategen">
            Edit the library
          </Link>
        </div>
      </div>

      <div className="wk-bar">
        <label className="wk-find">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#hi-search" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search rates by description, item number or section"
            aria-label="Search the library"
            autoComplete="off"
          />
        </label>

        {sections.length > 1 && (
          <div className="wk-tabs">
            <button
              type="button"
              className={section === "" ? "on" : ""}
              onClick={() => setSection("")}
            >
              All sections
            </button>
            {sections.slice(0, 4).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={section === k ? "on" : ""}
                onClick={() => setSection(k)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="wk-tabs">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={sort === s.id ? "on" : ""}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="wk-count">
        {shown.length} of {rates.length} rate{rates.length === 1 ? "" : "s"}
        {zone ? ` · priced for ${zone}` : ""}
      </p>

      {!rates.length ? (
        <section className="wk-panel">
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
              Nothing in the library yet. RateGen fills this as you build rates, and every
              product on the account prices against it.
            </p>
            <Link className="btn btn-p btn-sm" to="/rategen" style={{ marginTop: 16 }}>
              Open RateGen
            </Link>
          </div>
        </section>
      ) : !shown.length ? (
        <p className="sub">Nothing matches “{q}”.</p>
      ) : (
        <div className="wk-tbl wk-tbl-rates" role="table">
          <div className="wk-hd" role="row">
            <span>Item of work</span>
            <span>Unit</span>
            <span>Rate</span>
            <span>Last touched</span>
            <span />
          </div>
          {shown.map((r) => (
            <Link className="wk-row" role="row" to={`/work/rate/${r.id}`} key={r.id}>
              <span className="wk-nm">
                <b>{r.description || r.itemNo || "Untitled rate"}</b>
                <span>
                  {[r.itemNo, r.sectionLabel].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="wk-u">{r.unit || ""}</span>
              <span className="wk-r">
                {money(r.totalCost)}
                <i>per {r.unit || "unit"}</i>
              </span>
              <span className="wk-w">
                {when(r.updatedAt)}
                <i>{r.zone || r.state || ""}</i>
              </span>
              <span className="wk-go">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <use href="#hi-right" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
