// The panel behind "Export to Excel" on the project's … menu.
//
// Richard's overflow list has "Export to Excel" on it. It was left off ours on
// the grounds that the export is ~400 lines of workbook building — true of the
// generic BoQ, which SheetJS builds in the browser, and not true of these, which
// the server builds and serves from authenticated GET endpoints. So this is his
// menu entry restored, not a new one invented.
//
// WHY A PANEL RATHER THAN SEVEN MENU ENTRIES
//
// There are up to seven documents and the … menu holds six items in total. Seven
// more would bury Collaborators and the two reports. His layer L5 is the answer
// the design already gives for "more than a menu's worth": things open OVER the
// tab (WORK.md §13), which is where the line panel and the collaborator roster
// go.
//
// Nothing here is styled with a new class. Every document is a button with a line
// of explanation beneath it, on .pn-sec / .ds-btn / .hint — the same three his
// collaborator panel uses.

import React from "react";
import { Link } from "react-router-dom";
import { downloadFile } from "../../lib/downloadWorkbook.js";
import { exportsFor, noExportsReason } from "./exportModel.js";

const BILL_KEYS = new Set(["boq-elemental", "boq-trade", "bill-budget", "bill-budget-trade"]);

/**
 * Why there is nothing here, in the reader's terms.
 *
 * Four causes, and three of them used to read as the fourth. In particular,
 * "an active RateGen subscription lifts this" was said to a VIEW-ONLY reader,
 * for whom it is untrue twice over: buying RateGen flips canSeeRates, and
 * canExport still refuses every document — including the four bill workbooks,
 * which findProjectDoc refuses with 403 VIEW_ONLY (projects.boq.js:189).
 */
const REASON = {
  failed:
    "This project's bill could not be read just now, and every document here is built from it. Reload the page and try again.",
  "view-only":
    "You have view access to this project, which does not include taking its documents. The owner can share it at full access if you need them.",
  "rates-hidden":
    "This project's rates are not visible to you, so its documents cannot be exported. An active RateGen subscription lifts this.",
  "no-bill":
    "There is no bill on this project yet. Measure or import one and every document here is built from it.",
  loading: "This project is still loading.",
};

/**
 * One group of documents.
 *
 * At MODULE level, not inside the component. Declared in the body, its identity
 * changed on every render, so every setBusy and setFailed unmounted and remounted
 * the whole group — which destroys the button a keyboard reader had just pressed
 * and drops focus to the body, exactly as the refusal they need appears.
 */
function Group({ title, list, busy, failed, onTake }) {
  if (!list.length) return null;
  return (
    <div className="pn-sec">
      <span className="k">{title}</span>
      {list.map((r) => (
        <React.Fragment key={r.key}>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={!!busy}
            aria-busy={busy === r.key}
            onClick={() => onTake(r)}
          >
            {busy === r.key ? "Building…" : r.label}
          </button>
          {/* role="status" so a refusal is ANNOUNCED. The whole reason a failed
              export keeps its message in the panel rather than a toast is that
              the server's words are the only instruction the reader gets — and
              a reader using a screen reader was the one person who never got
              them. */}
          <p className="hint" role={failed[r.key] ? "status" : undefined}>
            {failed[r.key] ? failed[r.key] : r.note}
          </p>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function WorkProjectExports({
  project,
  productKey,
  saveId,
  accessToken,
  classicHref = "",
  // The shell knows the difference between "not loaded yet" and "the load
  // failed", and only it does: a failed read leaves `project` null exactly as a
  // pending one does. Without this the panel said "still loading" two inches
  // below the shell's own banner saying the read had failed.
  failed: loadFailed = false,
  onToast,
  // Opens the ICMS details form in place of this panel. Absent, the section is not shown.
  onOpenIcms,
}) {
  const rows = React.useMemo(
    () => exportsFor(project, { productKey, saveId }),
    [project, productKey, saveId],
  );
  const reason = noExportsReason(project, { productKey, saveId, failed: loadFailed });

  // Which row is downloading, and what went wrong with it. Keyed by row rather
  // than a single flag: a QS taking the bill and then a certificate should not
  // see the first row's error sitting under the second.
  const [busy, setBusy] = React.useState("");
  const [failed, setFailed] = React.useState({});

  const take = React.useCallback(
    async (row) => {
      setBusy(row.key);
      setFailed((f) => {
        const next = { ...f };
        delete next[row.key];
        return next;
      });
      try {
        const filename = await downloadFile({
          path: row.path,
          token: accessToken,
          fallbackName: row.fallbackName,
          failureMessage: row.failureMessage,
        });
        onToast?.({ tone: "success", title: `Saved ${filename}` });
      } catch (err) {
        // Shown in the panel, not as a toast. A failed export's message is the
        // server explaining itself — "an active RateGen subscription lifts this",
        // "finalize the account first" — and that is too much to read before a
        // toast closes, and too useful to lose.
        setFailed((f) => ({ ...f, [row.key]: String(err?.message || row.failureMessage) }));
      } finally {
        setBusy("");
      }
    },
    [accessToken, onToast],
  );

  if (!rows.length) {
    return (
      <div className="pn-sec">
        <span className="k">{reason === "failed" ? "The bill could not be read" : "Nothing to export yet"}</span>
        <p className="hint">{REASON[reason] || REASON.loading}</p>
        {/* The one refusal with somewhere to go: a view-only reader cannot export,
            but the owner can share the project at full access. */}
        {reason === "view-only" && classicHref ? (
          <Link className="ds-btn btn-o ds-btn-sm" to={classicHref}>
            Open the classic workspace
          </Link>
        ) : null}
      </div>
    );
  }

  const bill = rows.filter((r) => BILL_KEYS.has(r.key));
  const priced = rows.filter((r) => !BILL_KEYS.has(r.key));

  return (
    <>
      <Group title="The bill" list={bill} busy={busy} failed={failed} onTake={take} />
      <Group title="Payment documents" list={priced} busy={busy} failed={failed} onTake={take} />
      {onOpenIcms ? (
        <div className="pn-sec">
          <span className="k">ICMS 3</span>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onOpenIcms}>
            ICMS details…
          </button>
          <p className="hint">
            Country, currency, base date, asset type, stage, floor areas and carbon boundary,
            stated once for this project. The ICMS 3 cost and carbon report, in Excel or
            JSON, is in the Export menu and gives cost and carbon per m2 once a floor area
            is saved.
          </p>
        </div>
      ) : null}
      {classicHref ? (
        <div className="pn-sec">
          <span className="k">Not here</span>
          <p className="hint">
            The combined BoQ with its variations, provisional sums and preliminary
            sheets is built in the browser rather than by the server, so it is
            still on the{" "}
            <Link to={classicHref}>classic workspace</Link>.
          </p>
        </div>
      ) : null}
    </>
  );
}
