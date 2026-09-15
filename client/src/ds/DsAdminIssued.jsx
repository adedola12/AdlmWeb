// Issued — every document that has left the studio, newest first.
//
// Ported from the second half of his site/assets/js/admin-docs.js. His note is
// the design: it answers the question that actually gets asked — "you never
// sent it" — and it is assembled from the records that already know, rather
// than a second list somebody has to remember to write.
//
// WHY OPEN RENDERS THE DOCUMENT RATHER THAN DESCRIBING IT
//
// His preview mounts the same renderer the composer and the customer's own
// exports use, so what is on screen here is what was sent. Ours fetches the
// figures back from the record rather than reading them off a list, for the
// same reason: an invoice is rebuilt from its own captured line items and its
// own VAT rate, so last March's reprints as last March's. Changing the rate
// today cannot rewrite what went out.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";
import { AdmDrawer } from "./adminForm.jsx";
import { mount } from "./adlmDoc.js";
import { parseDocument } from "./docParser.js";

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

/**
 * Scale a 210mm sheet down to the width of the drawer.
 *
 * His, including both catches he hit. A transform does not change layout, so
 * the wrapper has to be told how tall the scaled result is or the box is
 * either far too tall or clips the page. And the drawer is measured before it
 * has been laid out, so clientWidth reads 0, the scale comes out negative and
 * the height ends up an invalid string the browser throws away — which looks
 * exactly like "nothing happened". So the width is taken from whatever is
 * actually measurable, never trusted blindly, and the fit is run again once
 * the drawer has settled and on any resize.
 */
function fitSheets(stage) {
  const sheets = stage.querySelectorAll(".doc-sheet");
  if (!sheets.length) return;

  let avail = stage.clientWidth - 24;
  if (!(avail > 80)) {
    const box = stage.closest(".adm-drawer");
    avail = (box ? box.clientWidth : 0) - 60;
  }
  if (!(avail > 80)) avail = 560;

  const natural = sheets[0].offsetWidth || 794;
  let k = Math.min(1, avail / natural);
  if (!(k > 0.1)) k = 0.6;

  // Measure while the sheets are still in normal flow — once they are
  // absolutely positioned their offsetHeight reads zero.
  stage.classList.remove("scaled");
  sheets.forEach((sh) => {
    sh.style.transform = "";
  });
  const heights = [...sheets].map((sh) => sh.offsetHeight || 1123);

  stage.classList.add("scaled");
  let top = 12;
  sheets.forEach((sh, i) => {
    sh.style.transform = `scale(${k})`;
    sh.style.transformOrigin = "top left";
    sh.style.top = `${top}px`;
    top += heights[i] * k + 12;
  });
  stage.style.height = `${Math.max(120, Math.ceil(top))}px`;
}

/** The rendered document inside the drawer. */
function Sheet({ doc }) {
  const stage = React.useRef(null);

  React.useEffect(() => {
    const host = stage.current;
    if (!host || !doc?.spec) return undefined;

    const spec = { ...doc.spec };
    // A saved document keeps its source rather than its blocks, so it is
    // parsed here with the same parser the composer uses — one renderer, one
    // parser, one document.
    if (doc.source && !spec.blocks) spec.blocks = parseDocument(doc.source);

    try {
      mount(host, spec);
    } catch (err) {
      host.innerHTML = "";
      const p = document.createElement("p");
      p.className = "adm-foot-note";
      p.textContent = `The engine could not render this one: ${err.message}`;
      host.appendChild(p);
      return undefined;
    }

    const fit = () => fitSheets(host);
    fit();
    const t0 = setTimeout(fit, 0);
    const t1 = setTimeout(fit, 260); // after the drawer finishes sliding in
    window.addEventListener("resize", fit);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      window.removeEventListener("resize", fit);
    };
  }, [doc]);

  return <div className="doc-stage adm-issued-stage" ref={stage} />;
}

export default function DsAdminIssued() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(null); // { row, doc, error }
  const [sending, setSending] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    // The register spans four collections, so the search runs on the server:
    // filtering the page in the browser would only search whatever had already
    // been fetched, which is exactly the document somebody cannot find.
    const t = setTimeout(
      () => {
        apiAuthed("/admin/docs/issued", { token: accessToken, params: q ? { q } : {} })
          .then((r) => alive && setD(r))
          .catch(() => alive && setFailed(true));
      },
      q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, q]);

  async function show(row) {
    setOpen({ row, doc: null, error: "" });
    try {
      const doc = await apiAuthed(`/admin/docs/issued/${encodeURIComponent(row.id)}`, {
        token: accessToken,
      });
      setOpen((o) => (o && o.row.id === row.id ? { ...o, doc } : o));
    } catch (err) {
      setOpen((o) =>
        o && o.row.id === row.id
          ? { ...o, error: err?.message || "That one could not be opened." }
          : o,
      );
    }
  }

  async function sendAgain(row) {
    const to = row.email || open?.doc?.to || "";
    if (!to) {
      say(`There is no email address on ${row.ref || row.kind}, so there is nowhere to send it.`);
      return;
    }
    setSending(row.id);
    try {
      const r = await apiAuthed(`/admin/docs/issued/${encodeURIComponent(row.id)}/send-again`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, ref: row.ref, kind: row.kind, on: row.on }),
      });
      // His wording, and the point of it: the answer to "you never sent it" is
      // that it has gone again AND that you can see when it went the first
      // time.
      say(
        `Sent to ${r?.to || to}.` +
          (r?.when ? ` They said they never received it — it first went on ${r.when}.` : ""),
      );
    } catch (err) {
      say(err?.message || "That did not send.");
    } finally {
      setSending("");
    }
  }

  if (failed) {
    return <p className="adm-note">Issued could not be loaded just now. Please refresh.</p>;
  }

  const all = d?.items || [];
  const items = view === "all" ? all : all.filter((r) => r.kind === view);
  const counts = d?.counts || {};

  // His tabs are built from the kinds actually present, so a register with no
  // certificates in it does not offer a Certificate tab that finds nothing.
  const kinds = [...new Set(all.map((r) => r.kind))];
  const tabs = [["all", "Everything", counts.all ?? all.length]].concat(
    kinds.map((k) => [k, k, counts[k]]),
  );

  const cols = [
    { h: "Document", w: "18%", cell: (r) => <AdmTwo top={r.ref || r.kind} under={r.kind} /> },
    { h: "To", w: "24%", cell: (r) => <AdmTwo top={r.to} under={r.org || r.email} /> },
    { h: "Sent", cell: (r) => when(r.on) },
    { h: "For", num: true, cell: (r) => r.worth || <AdmDim>—</AdmDim> },
    {
      h: "",
      cell: (r) => (
        <span className="adm-rowacts">
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => show(r)}>
            Open
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={sending === r.id}
            onClick={() => sendAgain(r)}
          >
            {sending === r.id ? "Sending…" : "Send again"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Issued</h1>
          <p className="adm-lede">
            Every document that has left the studio, newest first. It answers the question that
            actually gets asked — <i>you never sent it</i> — and it is assembled from what the panel
            already knows it issued rather than a second list to keep in step.
          </p>
        </div>
      </div>

      <AdmFilters current={view} onPick={setView} options={tabs} />

      <label className="adm-find">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by reference, name, firm or address"
          aria-label="Search by reference, name, firm or address"
        />
        {d?.total > all.length ? (
          <span className="adm-f-h">
            Showing {all.length} of {d.total} — narrow it with a search.
          </span>
        ) : null}
      </label>

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={items}
          rowKey={(r) => r.id}
          onRow={show}
          empty={["Nothing issued", "No invoice, receipt, quotation or certificate has gone out."]}
        />
      )}

      {open ? (
        <AdmDrawer
          peek
          wide
          title={open.row.ref || open.row.kind}
          intro={
            `${open.row.kind} · ${open.row.to}` +
            (open.row.org ? ` · ${open.row.org}` : "") +
            (open.row.on ? ` · sent ${when(open.row.on)}` : "")
          }
          note={open.doc?.note || ""}
          onClose={() => setOpen(null)}
          foot={
            <>
              {open.doc?.href ? (
                <a
                  className="ds-btn btn-o ds-btn-sm"
                  href={open.doc.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the original
                </a>
              ) : null}
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                disabled={sending === open.row.id}
                onClick={() => sendAgain(open.row)}
              >
                {sending === open.row.id ? "Sending…" : "Send again"}
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                onClick={() => window.print()}
              >
                Print or save as PDF
              </button>
            </>
          }
        >
          {open.error ? (
            <p className="adm-note">{open.error}</p>
          ) : !open.doc ? (
            <p className="adm-note">Reading…</p>
          ) : (
            <Sheet doc={open.doc} />
          )}
        </AdmDrawer>
      ) : null}

      {toast}
    </>
  );
}
