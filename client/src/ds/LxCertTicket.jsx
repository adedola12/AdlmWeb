// His .lx-cert ticket, shared by My learning and Certificates.

import React from "react";
import { certReady, when } from "./lxCourses.js";

/**
 * His .lx-cert ticket (learn.js certCard, 17 Sep 2026). An issued certificate
 * is "Ready to claim" until the holder confirms the name to print; after that
 * it offers View and Download. A course still in progress shows what stands
 * between the holder and it.
 *
 * The Reference is the stored CERT-… one that the public check at
 * /certificate verifies, and the one the certificate itself prints.
 */
export default function CertTicket({ row, certName, claimed, onOpen }) {
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
          <span className="k">
            {!ready ? "Not yet issued" : claimed ? "Certificate of completion" : "Ready to claim"}
          </span>
          <b>{row.title}</b>
          {ready ? (
            <>
              <span className="who">{claimed ? certName : "Confirm the name to print on it"}</span>
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
              {row.pending
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
          {claimed ? (
            <>
              <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => onOpen(row, "view")}>
                View certificate
              </button>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onOpen(row, "download")}>
                Download
              </button>
            </>
          ) : (
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => onOpen(row, "claim")}>
              Claim your certificate
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
