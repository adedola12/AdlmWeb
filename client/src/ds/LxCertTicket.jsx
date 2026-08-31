// His .lx-cert ticket, shared by My learning and Certificates.

import React from "react";
import { certReady, when } from "./lxCourses.js";

/**
 * His .lx-cert ticket. Issued and pending are the same card with a different
 * face, which is why they share a component rather than a branch at the top.
 *
 * The Reference is the enrolment's own id, formatted so it can be read aloud —
 * see certificateRef() in routes/meCourses.js. The PDF stamps the same string,
 * so the card never names something the document does not carry.
 */
export default function CertTicket({ row, certName, onDownload }) {
  const ready = certReady(row);
  return (
    <div className={`lx-cert${ready ? "" : " pending"}`}>
      <div className="lx-ticket">
        <img
          className="badge"
          src="/ds/cert-badge.png"
          alt={ready ? "ADLM Studio training certificate" : ""}
        />
        <div className="in">
          <span className="k">{ready ? "Certificate of completion" : "Not yet issued"}</span>
          <b>{row.title}</b>
          {ready ? (
            <>
              <span className="who">{certName}</span>
              <div className="rw">
                <span>Issued</span>
                <span>{when(row.issuedAt)}</span>
              </div>
              <div className="rw">
                <span>Reference</span>
                <span className="ref">{row.certificateRef}</span>
              </div>
            </>
          ) : (
            <p>
              {row.completed
                ? "Marked complete. The certificate appears here once the template for this course is uploaded."
                : row.pending
                  ? `${row.pending} submission${row.pending === 1 ? " is" : "s are"} with the tutor. The certificate is issued once they are marked.`
                  : row.total
                    ? `${row.total - row.done} lesson${row.total - row.done === 1 ? "" : "s"} and the marked submissions stand between here and it.`
                    : "Issued once the course is finished and the submissions are marked."}
            </p>
          )}
        </div>
      </div>
      {ready ? (
        <div className="lx-cert-a">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() => onDownload(row, { preview: true })}
          >
            Preview
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => onDownload(row)}
          >
            Download
          </button>
        </div>
      ) : null}
    </div>
  );
}
