// People — every individual account, and what they hold.
//
// His framing: "The register answers 'who is this?'; the record answers 'what
// happened to them?'. Searching by email is the commonest thing an
// administrator does at the start of a support call, so the search box takes
// email, name, username or firm and is focused when the page opens."
//
// Both kept. The search is focused on arrival and runs against the database
// rather than over the loaded page, because with 458 accounts and a limit, a
// client-side filter searches only what happened to arrive and quietly misses
// the person being looked for.
//
// NO ROW LINK YET, DELIBERATELY
//
// His rows lead to /admin/account — the record screen. That screen is not
// ported, so a row that navigated would land on nothing. Rather than link into
// a hole or fake a record, the rows are inert for now and the footnote says
// what is missing. This is the same rule the Installations screen follows
// about its adopt button.
//
// The table, filters, chips and empty state are the shared kit in adminUi.jsx,
// which is his admin-ui.js: five register screens are one table with different
// columns, so the columns are all this file really contains.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { toneFor } from "./adminKit.jsx";

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  civil3d: "CIVIQ",
  rategen: "RateGen",
  "qs-takeoff": "Time Pro",
  archicad: "ArchiCAD",
};
const productName = (k) => PRODUCT[k] || k;

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function DsAdminPeople() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const findRef = React.useRef(null);

  React.useEffect(() => {
    findRef.current?.focus();
  }, []);

  // The search waits for a pause in typing. Without it every keystroke is a
  // query against 458 accounts, and the answers come back out of order.
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      apiAuthed("/admin/people", { token: accessToken, params: { view, q } })
        .then((r) => alive && setD(r))
        .catch(() => alive && setFailed(true));
    }, q ? 220 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, view, q]);

  if (failed) {
    return <p className="adm-note">People could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};

  const cols = [
    {
      h: "Person",
      w: "26%",
      cell: (a) => <AdmTwo top={a.name} under={a.email} />,
    },
    {
      h: "Organisation",
      w: "22%",
      cell: (a) =>
        a.org ? (
          <AdmTwo top={a.org} under={a.owner ? "Organisation licence" : "Named on the licence"} />
        ) : (
          <AdmTwo top="Personal licence" under={a.role === "admin" ? "ADLM staff" : "No firm recorded"} />
        ),
    },
    {
      h: "Holds",
      cell: (a) =>
        a.holds.length ? (
          a.holds.map(productName).join(" · ")
        ) : (
          <AdmDim>nothing</AdmDim>
        ),
    },
    {
      h: "Seats",
      num: true,
      cell: (a) => (a.seats ? a.seats : <AdmDim>—</AdmDim>),
    },
    {
      h: "Next expiry",
      cell: (a) =>
        a.expiry ? (
          <AdmChip tone={toneFor(a.expiry.status)}>{when(a.expiry.date)}</AdmChip>
        ) : (
          <AdmDim>—</AdmDim>
        ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">People</h1>
          <p className="adm-lede">
            Every individual account. A licence is counted as held only when it is active and has
            not run out — the status flag is not swept when the date passes, so counting on it
            alone would report licences that expired months ago as current.
          </p>
        </div>
      </div>

      <label className="adm-find adm-find-wide">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use href="#hi-search" />
        </svg>
        <input
          ref={findRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email, name, username or firm"
          aria-label="Search people"
        />
      </label>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everyone", counts.all],
          ["holders", "Holding a licence", counts.holders],
          ["owners", "Organisation licences", counts.owners],
          ["idle", "Holding nothing", counts.idle],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the register…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            empty={["Nobody matches", "Try part of an email address, or the firm’s name."]}
          />
          {d.capped ? (
            <p className="adm-foot-note">
              Showing the first {d.shown} of {d.total}. Narrow it with the search rather than
              scrolling — the search runs against every account, not just the ones on this page.
            </p>
          ) : null}
        </>
      )}

      <p className="adm-foot-note">
        A row does not open yet. His register leads to an account record — what was bought, what
        was granted, what went wrong — and that screen is not built, so a row that navigated
        would land on nothing.
      </p>
    </>
  );
}
