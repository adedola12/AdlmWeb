// Organisations — the same accounts, read sideways.
//
// His framing, and ours for the same reason: "There is no organisation object.
// This screen groups the account list by the company name on each account, and
// one organisation's page is a filter over the same rows rather than a record
// of its own. A lens, not an owner."
//
// True here one level deeper than he knew — the company name is not even on
// the account, it is on each entitlement. So a firm is the set of people
// holding a licence that names it, and every figure is derived from those
// licences rather than stored anywhere.
//
// HIS MERGE IS NOT BUILT
//
// The one feature a lens needs that a record would not: "Summit Build Africa
// appears twice in the live data because somebody typed Ltd; the merge folds
// the second into the first and every count follows, because every count is
// derived." Folding two spellings needs somewhere to remember the fold, and
// there is no such store. The list is sorted so near-duplicates sit near each
// other and can at least be seen.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  civil3d: "CIVIQ",
  rategen: "RateGen",
  "qs-takeoff": "Time Pro",
  archicad: "ArchiCAD",
};

export default function DsAdminOrganisations() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/queues/organisations", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  if (failed) {
    return <p className="adm-note">Organisations could not be loaded just now. Please refresh.</p>;
  }

  const all = d?.items || [];
  const s = q.trim().toLowerCase();
  const items = s
    ? all.filter(
        (f) =>
          f.name.toLowerCase().includes(s) ||
          f.accounts.some((a) => `${a.name} ${a.email}`.toLowerCase().includes(s)),
      )
    : all;

  const cols = [
    {
      h: "Organisation",
      w: "28%",
      cell: (f) => (
        <AdmTwo
          top={f.name}
          under={`${f.headcount} ${f.headcount === 1 ? "person" : "people"}`}
        />
      ),
    },
    {
      h: "Who is on it",
      cell: (f) => (
        <span className="adm-two">
          <b>{f.accounts.slice(0, 2).map((a) => a.name).join(", ")}</b>
          <span>
            {f.accounts.length > 2
              ? `and ${f.accounts.length - 2} more`
              : f.accounts[0]?.email || ""}
          </span>
        </span>
      ),
    },
    {
      h: "Holds",
      cell: (f) =>
        f.products.length ? (
          f.products.map((k) => PRODUCT[k] || k).join(" · ")
        ) : (
          <AdmDim>nothing</AdmDim>
        ),
    },
    { h: "Seats", num: true, cell: (f) => (f.seats ? f.seats : <AdmDim>—</AdmDim>) },
    {
      h: "Licences",
      cell: (f) => (
        <>
          <AdmChip tone={f.live ? "ok" : "calm"}>{f.live} live</AdmChip>
          {f.expired ? <AdmChip tone="bad">{f.expired} lapsed</AdmChip> : null}
        </>
      ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Organisations</h1>
          <p className="adm-lede">
            The same accounts, grouped by the firm named on their licences. There is no
            organisation record behind this — a firm is the people holding a licence that names
            it, so every figure here is derived and none of it can drift.
          </p>
        </div>
      </div>

      <label className="adm-find adm-find-wide">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use href="#hi-search" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a firm, or somebody on one"
          aria-label="Search organisations"
        />
      </label>

      {!d ? (
        <p className="adm-note">Reading the register…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={items}
          rowKey={(f) => f.name}
          empty={[
            "No organisations",
            "Nobody holds a licence with a firm named on it, so there is nothing to group by.",
          ]}
        />
      )}

      <p className="adm-foot-note">
        Two spellings of one firm show as two rows. Folding them together needs somewhere to
        remember the fold and there is no such store, so they are sorted next to each other to be
        seen rather than merged silently.
      </p>
    </>
  );
}
