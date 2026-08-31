// The rate library — what a unit of work costs, and what it is built from.
//
// WHY THIS PAGE LOOKS LIKE THE WORK SIDE AND NOT LIKE THE REST OF THE ADMIN
//
// Richard's admin has exactly one rate screen, "Rate data", and it is the
// material and labour prices. His rate library — the rates themselves — is a
// WORK screen, and it is the one he designed: a search, three tabs, a trade
// filter, a sort, a count line, and a table of item / unit / rate / last
// touched. So this page wears his `wk-` library markup inside the admin chrome
// rather than being redrawn in `adm-` tables, because the screen already exists
// in his design and redrawing it would be inventing a second answer to a
// question he has already answered.
//
// WHAT THIS PAGE CANNOT DO, DELIBERATELY
//
// Nothing here edits. Rates are viewed on the website and edited in Rate Gen;
// master material and labour prices are published from Rate Gen too. The one
// thing the website owns is BUILDING a rate, which is why the only action on
// this page is "New rate" and it goes to the builder.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useAdmToast } from "./adminKit.jsx";
import "../styles/ds-work.css";

const ZONES = [
  { key: "north_west", name: "North West" },
  { key: "north_east", name: "North East" },
  { key: "north_central", name: "North Central" },
  { key: "south_west", name: "South West" },
  { key: "south_east", name: "South East" },
  { key: "south_south", name: "South South" },
];
const zoneName = (k) => ZONES.find((z) => z.key === k)?.name || "South West";

const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

const SORTS = [
  { value: "name", label: "Name, A to Z" },
  { value: "rate-hi", label: "Price, high to low" },
  { value: "rate-lo", label: "Price, low to high" },
  { value: "recent", label: "Recently touched" },
  { value: "trade", label: "Trade" },
];

/** His highlight: the searched term is marked inside the name it matched. */
function Mark({ text, term }) {
  const s = String(text || "");
  if (!term) return s;
  const i = s.toLowerCase().indexOf(term);
  if (i < 0) return s;
  return (
    <>
      {s.slice(0, i)}
      <mark>{s.slice(i, i + term.length)}</mark>
      {s.slice(i + term.length)}
    </>
  );
}

/**
 * His dropdown, as a native select.
 *
 * His is a scripted listbox that also shows a count beside each option. The
 * count is the useful half — it says how many rates a trade holds before you
 * filter to it — so it is kept in the option text, while the widget itself is
 * a select because a native one is keyboard-operable and screen-reader-legible
 * for free, and reimplementing that badly is worse than the small visual
 * difference.
 */
function Dd({ label, value, options, onChange }) {
  return (
    <label className="wk-dd">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {typeof o.count === "number" ? ` (${o.count})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function DsAdminRateLibrary() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [tab, setTab] = React.useState("rates"); // rates | materials | labour
  const [zone, setZone] = React.useState("south_west");
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("all");
  const [sort, setSort] = React.useState("name");

  const [rates, setRates] = React.useState(null);
  const [lib, setLib] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [libFailed, setLibFailed] = React.useState(false);

  // The open rate's build-up. Fetched on click, not with the list — see the
  // note on the detail route.
  const [openId, setOpenId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);

  /* ── the rates, once ─────────────────────────────────────────────────────
     Not per zone: a published rate carries the cost it was built at, and its
     own zone/state if it was built for one place. Re-fetching on a zone change
     would suggest the figures move, which they do not. */
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/catalogue/rates", { token: accessToken })
      .then((r) => alive && setRates(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  /* ── materials and labour, per zone ──────────────────────────────────────
     These DO move with the zone: the same cement is not the same money in
     Lagos and in Kano, which is the whole reason the master library is zoned. */
  React.useEffect(() => {
    if (!accessToken || tab === "rates") return undefined;
    let alive = true;
    setLib(null);
    setLibFailed(false);
    apiAuthed("/admin/catalogue/library", { token: accessToken, params: { zone } })
      .then((r) => alive && setLib(r))
      .catch(() => {
        if (!alive) return;
        // A failed read has to END the loading state, not just raise a toast.
        // Leaving `lib` null said "Reading the library…" for as long as the
        // screen stayed open, which is the same lie the old grid told with its
        // permanent "Working…" — the request had died minutes earlier.
        setLibFailed(true);
        say("The component library could not be loaded.");
      });
    return () => {
      alive = false;
    };
  }, [accessToken, zone, tab, say]);

  // Changing tab changes what the category dropdown even means — a material is
  // filed under what it is, a rate under its trade — so the filter resets
  // rather than carrying a value the new taxonomy has no place for.
  const pick = (t) => {
    setTab(t);
    setCat("all");
    setOpenId(null);
    if (!SORTS.slice(0, 3).some((s) => s.value === sort)) setSort("name");
  };

  const term = q.trim().toLowerCase();

  /* ── rates ──────────────────────────────────────────────────────────────── */

  const rateRows = React.useMemo(() => {
    const all = rates?.items || [];
    const list = all.filter((r) => {
      if (cat !== "all" && r.section !== cat) return false;
      if (!term) return true;
      return `${r.description} ${r.section} ${r.code}`.toLowerCase().includes(term);
    });
    const by = {
      // A recipe has no cost, so it sorts to the bottom of a price sort rather
      // than to the top as a zero would.
      "rate-hi": (a, b) => (b.total ?? -1) - (a.total ?? -1),
      "rate-lo": (a, b) => (a.total ?? Infinity) - (b.total ?? Infinity),
      recent: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
      trade: (a, b) =>
        a.section === b.section
          ? a.description.localeCompare(b.description)
          : String(a.section).localeCompare(String(b.section)),
      name: (a, b) => a.description.localeCompare(b.description),
    };
    return list.slice().sort(by[sort] || by.name);
  }, [rates, cat, term, sort]);

  const rateCats = React.useMemo(() => {
    const all = rates?.items || [];
    const n = {};
    for (const r of all) if (r.section) n[r.section] = (n[r.section] || 0) + 1;
    return [{ value: "all", label: "All trades", count: all.length }].concat(
      Object.keys(n)
        .sort()
        .map((k) => ({ value: k, label: k, count: n[k] })),
    );
  }, [rates]);

  /* ── materials and labour ───────────────────────────────────────────────── */

  const items = tab === "materials" ? lib?.materials : lib?.labour;

  const itemRows = React.useMemo(() => {
    const all = items || [];
    const list = all.filter((m) => {
      if (cat !== "all" && m.category !== cat) return false;
      if (!term) return true;
      return `${m.name} ${m.category}`.toLowerCase().includes(term);
    });
    const by = {
      "rate-hi": (a, b) => (b.price || 0) - (a.price || 0),
      "rate-lo": (a, b) => (a.price || 0) - (b.price || 0),
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
    };
    return list.slice().sort(by[sort] || by.name);
  }, [items, cat, term, sort]);

  const itemCats = React.useMemo(() => {
    const all = items || [];
    const n = {};
    for (const m of all) if (m.category) n[m.category] = (n[m.category] || 0) + 1;
    return [{ value: "all", label: "All categories", count: all.length }].concat(
      Object.keys(n)
        .sort()
        .map((k) => ({ value: k, label: k, count: n[k] })),
    );
  }, [items]);

  /* ── the build-up ───────────────────────────────────────────────────────── */

  function open(e, r) {
    e.preventDefault();
    if (openId === r.id) {
      setOpenId(null);
      return;
    }
    setOpenId(r.id);
    setDetail(null);
    apiAuthed(`/admin/catalogue/rates/${r.id}`, { token: accessToken })
      .then(setDetail)
      .catch(() => say("That rate's build-up could not be read."));
  }

  const loading = tab === "rates" ? !rates : !lib && !libFailed;

  const count =
    tab === "rates"
      ? `${rateRows.length} ${rateRows.length === 1 ? "rate" : "rates"}` +
        (cat === "all" ? "" : ` in ${cat}`) +
        " · built at the cost each was published with"
      : libFailed
        ? "The master library could not be read."
        : `${itemRows.length} ${tab === "materials" ? "materials" : "gangs"}` +
        (cat === "all" ? "" : ` in ${cat}`) +
        ` · priced for ${zoneName(zone)}`;

  if (failed) {
    return <p className="adm-note">The rate library could not be loaded just now. Please refresh.</p>;
  }

  return (
    <>
      {toast}

      <div className="wk-head">
        <div>
          <h1>Rate library</h1>
          <p>
            One library for the practice. A rate here is what every user prices against in QUIV,
            HERON and Revit MEP. Rates are read here and edited in Rate Gen — the one thing built on
            the website is a new one.
          </p>
        </div>
        <div className="wk-acts">
          <label className="wk-dd">
            <span>Zone</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              aria-label="Price the library for a location"
            >
              {ZONES.map((z) => (
                <option key={z.key} value={z.key}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <Link className="ds-btn btn-p ds-btn-sm" to="/admin/rategen/build">
            New rate
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
            placeholder="Search rates, materials, gangs — or a description"
            aria-label="Search the library"
            autoComplete="off"
          />
        </label>

        <div className="wk-tabs">
          {[
            ["rates", "Rates"],
            ["materials", "Materials"],
            ["labour", "Labour"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={tab === k ? "on" : undefined}
              onClick={() => pick(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <Dd
          label={tab === "rates" ? "Trade" : "Category"}
          value={cat}
          options={tab === "rates" ? rateCats : itemCats}
          onChange={setCat}
        />
        <Dd
          label="Sort by"
          value={sort}
          options={tab === "rates" ? SORTS : SORTS.slice(0, 3)}
          onChange={setSort}
        />
      </div>

      <p className="wk-count">{loading ? "Reading the library…" : count}</p>

      {loading ? null : tab === "rates" ? (
        rateRows.length ? (
          <div className="wk-tbl wk-tbl-rates" role="table">
            <div className="wk-hd" role="row">
              <span>Item of work</span>
              <span>Unit</span>
              <span>Rate</span>
              <span>Last touched</span>
              <span />
            </div>
            {rateRows.map((r) => (
              <React.Fragment key={r.id}>
                <a
                  className="wk-row"
                  role="row"
                  href={`/admin/catalogue/rates/${r.id}`}
                  onClick={(e) => open(e, r)}
                  aria-expanded={openId === r.id}
                >
                  <span className="wk-nm">
                    <b>
                      <Mark text={r.description} term={term} />
                    </b>
                    <span>
                      {[r.code, r.section].filter(Boolean).join(" · ")}
                      {r.recipe ? (
                        <>
                          {" · "}
                          <em className="wk-own">recipe</em>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="wk-u">{r.unit || "—"}</span>
                  <span className="wk-r">
                    {/* A recipe is not free, it is unpriced. A zero here would
                        be a lie the eye reads before the caveat. */}
                    {r.recipe ? "—" : money(r.total)}
                    <i>{r.recipe ? "not priced" : `per ${r.unit || "unit"}`}</i>
                  </span>
                  <span className="wk-w">
                    {when(r.updatedAt) || "—"}
                    <i>{r.lines ? `${r.lines} line${r.lines === 1 ? "" : "s"}` : "no build-up"}</i>
                  </span>
                  <span className="wk-go">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#hi-right" />
                    </svg>
                  </span>
                </a>

                {openId === r.id ? (
                  <div className="rl-open">
                    {!detail ? (
                      <p className="adm-note">Reading the build-up…</p>
                    ) : !detail.breakdown?.length ? (
                      <p className="adm-note">
                        This rate carries no build-up — it holds a figure and nothing showing how
                        the figure was reached.
                      </p>
                    ) : (
                      <>
                        <div className="rl-bu">
                          {detail.breakdown.map((l, i) => (
                            <div key={`${l.componentName}-${i}`}>
                              <span>
                                <b>{l.componentName}</b>
                                <em>{l.refKind}</em>
                              </span>
                              <span>
                                {l.quantity} {l.unit}
                              </span>
                              <span>{l.waste ? `${l.waste}% waste` : ""}</span>
                              <span>{l.unitPrice == null ? "—" : money(l.unitPrice)}</span>
                            </div>
                          ))}
                        </div>
                        {detail.recipe ? null : (
                          <p className="rl-sum">
                            Net {money(detail.net)} · overhead {detail.overheadPercent}% · profit{" "}
                            {detail.profitPercent}% · <b>{money(detail.total)}</b> per{" "}
                            {detail.unit || "unit"}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="adm-none">
            <b>Nothing matches</b>
            <span>Try part of a rate description, or a different trade.</span>
          </div>
        )
      ) : libFailed ? (
        <div className="adm-none">
          <b>Could not be read</b>
          <span>
            The master library did not answer. It lives on the Rate Gen database rather than this
            one, so this can fail on its own while the rest of the admin is fine.
          </span>
        </div>
      ) : itemRows.length ? (
        <div className="wk-tbl wk-tbl-mat" role="table">
          <div className="wk-hd" role="row">
            <span>{tab === "materials" ? "Material" : "Gang"}</span>
            <span>Unit</span>
            <span>{tab === "materials" ? "Price" : "Day rate"}</span>
            <span>Category</span>
          </div>
          {itemRows.map((m) => (
            <div className="wk-row" role="row" key={`${m.kind}-${m.sn}`}>
              <span className="wk-nm">
                <b>
                  <Mark text={m.name} term={term} />
                </b>
                <span>{m.category || "—"}</span>
              </span>
              <span className="wk-u">{m.unit || "—"}</span>
              <span className="wk-r">
                {money(m.price)}
                <i>per {m.unit || "unit"}</i>
              </span>
              <span className="wk-w">{m.category || "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="adm-none">
          <b>Nothing matches</b>
          <span>Try part of a name, or a different category.</span>
        </div>
      )}

      <p className="wk-count" style={{ marginTop: 18 }}>
        {tab === "rates"
          ? "A rate is edited in Rate Gen, not here — open it there and the change reaches every user on their next update."
          : "Master prices are published from Rate Gen. What you see here is what every user in this zone prices against."}
      </p>
    </>
  );
}
