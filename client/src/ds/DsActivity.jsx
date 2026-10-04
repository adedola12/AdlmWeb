// The full activity trail, in his design.
//
// WHY THIS FILE EXISTS
//
// DsManageOverview shows the last six events and then offered "All activity" as
// a <Link to="/profile"> — straight out of the new build and into the classic
// Profile page, which is the one place the full log has ever been rendered
// (features/account/AccountActivity.jsx, mounted by pages/Profile.jsx:516). So
// the new dashboard had a door in it that led back to the old site.
//
// The trail itself is not new and nothing here writes to it: recordActivity()
// has been appending at every project and PM mutation all along, and
// GET /me/activity has paged it since it was built. This is the same data in
// the app frame, which is all that was missing.
//
// PARITY WITH THE CLASSIC TAB IS DELIBERATE
//
// Category filters, paging and the printable report are all carried over. A
// re-skin that quietly drops the report button is not a re-skin, it is a
// removal, and the people who use this screen use it to answer "what happened on
// this job and when" during a dispute.
//
// His classes only — .dsh-panel / .dsh-ph / .dsh-body / .dsh-chips /
// button.dsh-chip.on / .dsh-feed / .ds-btn. The one thing his sheet has no
// pattern for is a pager, so .dsh-pager is added to ds-local.css, the
// hand-authored companion, and NOT to the generated ds-dash.css.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const ReportModal = React.lazy(() => import("../features/reports/ReportModal.jsx"));

// Same categories and the same order as the classic tab, so somebody who knows
// the old screen is not hunting for a filter that moved.
const CATS = [
  { key: "", label: "All" },
  { key: "project", label: "Projects" },
  { key: "contract", label: "Contract" },
  { key: "commercial", label: "Rates & Variations" },
  { key: "valuation", label: "Valuation" },
  { key: "collaboration", label: "Collaboration" },
  { key: "model", label: "3D Models" },
  { key: "pm", label: "Schedule" },
];

// His .tick takes a modifier rather than a colour, and only has three. Mapping
// the eight categories onto what exists beats inventing five more classes: the
// label already says which kind it is, so the dot is a rhythm marker, not the
// information.
const TICK = {
  billing: "g",
  valuation: "g",
  commercial: "ds-a",
  contract: "ds-a",
};

function ago(d) {
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

const longDate = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime())
    ? ""
    : t.toLocaleString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function DsActivity() {
  const { accessToken } = useAuth();
  const [items, setItems] = React.useState(null);
  const [pagination, setPagination] = React.useState(null);
  const [category, setCategory] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setError("");
    // Not cleared to null on a filter change: blanking the list on every chip
    // press makes the screen flash, and the old rows are still true until the
    // new ones land.
    apiAuthed("/me/activity", {
      token: accessToken,
      params: { page, limit: 20, ...(category ? { category } : {}) },
    })
      .then((d) => {
        if (!alive) return;
        setItems(d.items || []);
        setPagination(d.pagination || null);
      })
      .catch(() => {
        if (!alive) return;
        // NOT setItems([]). A read that failed is not an empty log, and the
        // two render differently on purpose: "nothing has happened on this
        // account yet" is a claim about the customer's history, and making it
        // because the network blinked tells somebody with years of trail that
        // they have none. The support screen made exactly this mistake.
        setError("That did not load. Try again in a moment.");
      });
    return () => {
      alive = false;
    };
  }, [accessToken, category, page]);

  // A filter change goes back to page one. Staying on page 4 of a filter with
  // two pages is how a screen tells somebody there is nothing there when there is.
  const pick = (key) => {
    setCategory(key);
    setPage(1);
  };

  return (
    <div className="dsh-in">
      <section className="dsh-panel">
        <div className="dsh-ph">
          <h2>Activity</h2>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => setReport(true)}
          >
            Printable report
          </button>
        </div>

        <div className="dsh-body">
          <div className="dsh-chips" role="group" aria-label="Filter activity by kind">
            {CATS.map((c) => (
              <button
                key={c.key || "all"}
                type="button"
                className={`dsh-chip${category === c.key ? " on" : ""}`}
                aria-pressed={category === c.key}
                onClick={() => pick(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {error ? <p className="dsh-note err">{error}</p> : null}

          {items === null ? (
            <p className="dsh-note">Loading…</p>
          ) : items.length === 0 ? (
            <p className="dsh-note">
              {category
                ? "Nothing of that kind yet."
                : "Nothing has happened on this account yet. Activity appears here as you work on projects."}
            </p>
          ) : (
            <ul className="dsh-feed">
              {items.map((a) => (
                <li key={a._id}>
                  <span className={`tick${TICK[a.category] ? ` ${TICK[a.category]}` : ""}`} />
                  <div>
                    <b>{a.action || a.category || "Activity"}</b>
                    {a.summary ? ` ${a.summary}` : ""}
                    {a.projectName ? ` — ${a.projectName}` : ""}
                    {/* The exact time, because the whole point of this screen
                        is answering when something happened. `ago` is the
                        glanceable version and sits on the right. */}
                    <span className="dsh-when">{longDate(a.createdAt)}</span>
                  </div>
                  <span className="ago">{ago(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}

          {pagination && pagination.pages > 1 ? (
            <div className="dsh-pager">
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                disabled={!pagination.hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.pages} · {pagination.total} events
              </span>
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                disabled={!pagination.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {report ? (
        <React.Suspense fallback={null}>
          <ReportModal open type="activity" onClose={() => setReport(false)} />
        </React.Suspense>
      ) : null}
    </div>
  );
}
