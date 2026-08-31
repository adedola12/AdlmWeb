// His Certificates screen — the rail entry that used to land on /dashboard.
//
// Same tickets as the panel on My learning, plus his "What the certificate is"
// note, which is the part worth having its own page: it says plainly what the
// document does and does not claim.
//
// One line of his is not reproduced. He writes that each certificate "carries a
// reference an employer can check with us"; ours carries the name and the date
// and nothing else, and there is no verification desk behind a reference. The
// note says what is true instead.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import CertificateNameModal from "../components/CertificateNameModal.jsx";
import CertTicket from "./LxCertTicket.jsx";
import { certReady, certificateName, toRow } from "./lxCourses.js";

export default function DsCertificates() {
  const { accessToken, user } = useAuth();
  const [courses, setCourses] = React.useState(null);
  const [failed, setFailed] = React.useState("");
  const [certModal, setCertModal] = React.useState(null);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/courses", { token: accessToken })
      .then((d) => alive && setCourses(Array.isArray(d) ? d : []))
      .catch((e) => alive && setFailed(e?.message || "Could not load your certificates."));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">{failed}</p>
      </div>
    );
  }
  if (!courses) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Loading your certificates…</p>
      </div>
    );
  }

  // Issued first — those are the ones somebody came here to fetch.
  const rows = courses.map(toRow).sort((a, b) => Number(certReady(b)) - Number(certReady(a)));
  const certName = certificateName(user);

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Certificates</h1>
          <p>
            Issued to the account rather than to a laptop, so a change of machine or email does not
            lose them. Each one carries the name held on the account, which locks the first time a
            certificate is downloaded — check it under Account settings before the first download.
          </p>
        </div>
      </div>

      {rows.length ? (
        <div className="lx-certs">
          {rows.map((r) => (
            <CertTicket
              key={r.sku}
              row={r}
              certName={certName}
              onDownload={(row, opts) =>
                setCertModal({
                  sku: row.sku,
                  title: row.title,
                  description: row.blurb,
                  completionDate: row.issuedAt,
                  reference: row.certificateRef,
                  preview: !!opts?.preview,
                })
              }
            />
          ))}
        </div>
      ) : (
        <section className="wk-panel">
          <div className="wk-empty">
            <p>
              No certificates yet, because nothing is enrolled on this account. The courses are
              taught against real projects and each one ends in a marked capstone.
            </p>
            <Link className="ds-btn btn-p ds-btn-sm" to="/learn">
              See what is taught
            </Link>
          </div>
        </section>
      )}

      <section className="wk-panel">
        <div className="wk-ph">
          <h2>What the certificate is</h2>
        </div>
        <div className="lx-about">
          <p>
            It evidences the work you did on an ADLM course: the lessons watched and a capstone
            marked by the tutor. <b>It is not a professional accreditation, and we do not describe
            it as one.</b>
          </p>
          <ul>
            <li>Issued to the account, so it survives a change of laptop or email</li>
            <li>Carries a reference you can quote to us, and the date it was issued</li>
            <li>Downloadable at any time, as many times as you need</li>
          </ul>
        </div>
      </section>

      <CertificateNameModal
        open={!!certModal}
        onClose={() => setCertModal(null)}
        courseSku={certModal?.sku}
        courseTitle={certModal?.title}
        courseDescription={certModal?.description}
        completionDate={certModal?.completionDate}
        reference={certModal?.reference}
        preview={certModal?.preview}
      />
    </div>
  );
}
