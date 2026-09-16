import React from "react";
import { FaArrowRight, FaFileImport } from "../../../components/icons.jsx";
import { PmModalShell } from "./PmModals.jsx";

// PmMppHelperModal — appears when the server returns MPP_NOT_ENABLED
// after a .mpp upload. Walks the user through MS Project's XML export
// in three short steps and offers a "try another file" CTA so they can
// drop in the .xml without leaving the screen.
//
// The modal is intentionally task-focused (no "OK / Cancel" jargon) and
// uses the shared PM shell (his .wk-modal) so it reads as a guided
// handoff, not an error dialog.

export default function PmMppHelperModal({
  open,
  errorMessage = "",
  onClose,
  onPickXml, // optional: fires a file picker scoped to .xml
}) {
  const fileRef = React.useRef(null);

  // Scroll lock and Escape are handled by the shared PM modal shell.
  if (!open) return null;

  function handlePickXml(e) {
    const file = e.target.files?.[0];
    if (file && onPickXml) onPickXml(file);
    e.target.value = "";
  }

  const NOTE = { margin: 0 };
  return (
    <PmModalShell
      open={open}
      title="Convert your .mpp to XML. It takes 10 seconds"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="ds-btn ds-btn-sm btn-o">
            Dismiss
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xml"
            className="hidden"
            onChange={handlePickXml}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ds-btn ds-btn-sm btn-p"
          >
            <FaFileImport size={14} />
            Upload .xml now
            <FaArrowRight size={12} />
          </button>
        </>
      }
    >
      <p className="wk-locnote" style={{ margin: "-10px 0 18px", textAlign: "center", fontSize: 13.5 }}>
        Native .mpp parsing isn't enabled on this server yet. MS Project
        has a built-in XML export that gives us the same data with
        identical fidelity.
      </p>

      {/* Steps, as his use-lines */}
      <div className="wk-panel" style={{ marginBottom: 0 }}>
        <div className="wk-use">
          <Step
            n={1}
            title="Open the project in MS Project"
            body="Double-click your .mpp file. If you don't have Project on this machine, ask the original author to do this step and send you the .xml."
          />
          <Step
            n={2}
            title="File → Save As → choose “XML”"
            body={
              <>
                In the Save As dialog, click the <em>Save as type</em>{" "}
                dropdown and pick <code>XML Format (*.xml)</code>. Save next to
                your .mpp file.
              </>
            }
          />
          <Step
            n={3}
            title="Upload the .xml here"
            body="Click the button below (or use the “Import MS Project” action again) and select the new .xml file. We'll parse everything: tasks, dates, durations, WBS, predecessors, baseline costs."
          />
        </div>
      </div>

      {/* Privacy / fidelity note */}
      <p
        className="mk-note"
        style={{ ...NOTE, marginTop: 14, background: "var(--pal-light-wash)", color: "var(--pal-light-key)", borderColor: "var(--pal-light-line)" }}
      >
        <strong>Same data, no compromise.</strong> The XML export is
        Microsoft's documented Project XML schema, every field we use
        (tasks, predecessors, baseline cost, dates, % complete) is
        preserved 1:1.
      </p>

      {/* Server-provided error message (collapsible details) */}
      {errorMessage ? (
        <details className="mk-note" style={{ ...NOTE, marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--ink)" }}>
            Why this happened (technical detail)
          </summary>
          <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{errorMessage}</div>
          <div className="wk-locnote" style={{ marginTop: 8 }}>
            Admins: set <code>MPXJ_API_URL</code> (HTTPS endpoint of a
            Java MPXJ converter service) or <code>MPXJ_CLI_PATH</code>{" "}
            (local CLI) on the server to enable direct .mpp imports.
          </div>
        </details>
      ) : null}
    </PmModalShell>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="wk-useline" style={{ gridTemplateColumns: "34px 1fr", alignItems: "start" }}>
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 500,
          background: "var(--pal-light-wash)",
          color: "var(--pal-light-key)",
          border: "1px solid var(--pal-light-line)",
        }}
      >
        {n}
      </span>
      <span className="p" style={{ gridColumn: 2, gridRow: 1 }}>
        {title}
        <em>{body}</em>
      </span>
    </div>
  );
}
