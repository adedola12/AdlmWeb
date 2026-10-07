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

export default function WorkProjectExports({
  project,
  productKey,
  saveId,
  accessToken,
  classicHref = "",
  onToast,
}) {
  const rows = React.useMemo(
    () => exportsFor(project, { productKey, saveId }),
    [project, productKey, saveId],
  );
  const reason = noExportsReason(project, { productKey, saveId });

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
        <span className="k">Nothing to export yet</span>
        <p className="hint">
          {reason === "rates-hidden"
            ? "This project's rates are not visible to you, so its documents cannot be exported. An active RateGen subscription lifts this."
            : reason === "no-bill"
              ? "There is no bill on this project yet. Measure or import one and every document below is built from it."
              : "This project is still loading."}
        </p>
      </div>
    );
  }

  const bill = rows.filter((r) => BILL_KEYS.has(r.key));
  const priced = rows.filter((r) => !BILL_KEYS.has(r.key));

  const Group = ({ title, list }) =>
    list.length ? (
      <div className="pn-sec">
        <span className="k">{title}</span>
        {list.map((r) => (
          <React.Fragment key={r.key}>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={!!busy}
              aria-busy={busy === r.key}
              onClick={() => take(r)}
            >
              {busy === r.key ? "Building…" : r.label}
            </button>
            <p className="hint">{failed[r.key] ? failed[r.key] : r.note}</p>
          </React.Fragment>
        ))}
      </div>
    ) : null;

  return (
    <>
      <Group title="The bill" list={bill} />
      <Group title="Payment documents" list={priced} />
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
