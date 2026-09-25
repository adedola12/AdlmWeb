// "Learning samples" row above a product's project grid: fully worked,
// read-only sample projects (bill, budget, valuations, programme, model) every
// subscriber can open to see how the cloud workspace is used on a real job.
// Served by GET /projects/:productKey/samples; hidden when there are none.
//
// Drawn in the design-system project pieces (.pj-note, .pj-grid, .pj-card,
// .pj-flag) so it sits the same in the classic /projects page and the /work
// gallery. With onOpenProject the cards are buttons (ProjectsGeneric opens the
// sample in place); without it they link to the product's workspace.

import React from "react";
import { Link } from "react-router-dom";
import { FaCube, FaEye } from "../../components/icons.jsx";
import { projectWorkspaceHref } from "../../lib/projectLinks.js";

// What the row says a sample is, per product. Anything unlisted gets the
// generic line.
const BLURBS = {
  revit: "Worked duplex projects, one per foundation type, each measured from its own 3D model.",
  planswift: "Worked duplex projects, one per foundation type, measured from PDF drawings.",
  mep: "Services for the worked duplexes: electrical, plumbing and drainage, and air conditioning.",
  civil3d: "Worked road and drainage jobs, measured chainage by chainage from the corridor.",
  archicad: "Worked duplex projects, one per foundation type, measured from the ArchiCAD model.",
};
const GENERIC = "Worked projects with every tab filled in on a real-looking job.";

function naira(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `₦${(v / 1e6).toFixed(1)}m`;
  return `₦${Math.round(v).toLocaleString()}`;
}

function CardBody({ s }) {
  return (
    <>
      <div className="top">
        <span className="pj-flag warn">{s.sample?.foundation || s.sample?.variant || "Sample"}</span>
        <span className="src" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <FaEye size={12} aria-hidden="true" /> Read-only
        </span>
      </div>
      <b className="nm">{String(s.name || "").replace(/^Sample:\s*/, "")}</b>
      <span className="cl">{s.sample?.location}</span>
      <span className="cl">{s.sample?.stage}</span>
      <div className="ft">
        <div>
          <span>Contract</span>
          <b>{naira(s.contractSum)}</b>
        </div>
        <div>
          <span>Lines</span>
          <b>{s.itemCount}</b>
        </div>
        <div>
          <span>Certificates</span>
          <b>{s.certificateCount}</b>
        </div>
      </div>
      {s.hasModel ? (
        <div className="fl">
          <span className="pj-flag mute" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <FaCube size={11} aria-hidden="true" /> 3D model
          </span>
        </div>
      ) : null}
    </>
  );
}

export default function SampleProjectsStrip({ samples = [], onOpenProject, productKey }) {
  const [open, setOpen] = React.useState(() => {
    try {
      return localStorage.getItem("adlm.samples.collapsed") !== "1";
    } catch {
      return true;
    }
  });
  if (!samples.length) return null;

  const key = String(productKey || samples[0]?.productKey || "").toLowerCase();
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem("adlm.samples.collapsed", v ? "1" : "0");
      } catch {
        /* storage unavailable: keep the in-memory state only */
      }
      return !v;
    });
  };

  return (
    <section style={{ margin: "0 0 20px" }}>
      <div className="pj-note warn" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <b>Learning samples</b>
          <br />
          {BLURBS[key] || GENERIC} Open one to see every tab filled in. Samples are read-only.
        </div>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={toggle} aria-expanded={open}>
          {open ? "Hide samples" : `Show ${samples.length} samples`}
        </button>
      </div>

      {open ? (
        <div className="pj-grid">
          {samples.map((s) =>
            onOpenProject ? (
              <button
                key={s.id}
                type="button"
                className="pj-card"
                style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
                onClick={() => onOpenProject(s.id)}
              >
                <CardBody s={s} />
              </button>
            ) : (
              <Link key={s.id} className="pj-card" to={projectWorkspaceHref(s)}>
                <CardBody s={s} />
              </Link>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
