// His Certificates screen — the rail entry that used to land on /dashboard.
//
// Same tickets as the panel on My learning, plus his "What the certificate is"
// note, which is the part worth having its own page: it says plainly what the
// document does and does not claim.
//
// R14: claimed through his three-step card, viewed and downloaded on his
// light or dark template, and checkable by anyone at /certificate.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import CertTicket from "./LxCertTicket.jsx";
import CertHost from "./cert/CertHost.jsx";
import { useCertName } from "./cert/useCertName.js";
import { certReady, toRow } from "./lxCourses.js";

export default function DsCertificates() {
  const { accessToken, user } = useAuth();
  const [courses, setCourses] = React.useState(null);
  const [failed, setFailed] = React.useState("");
  const [certOpen, setCertOpen] = React.useState(null);
  const [finishOf, setFinishOf] = React.useState({});
  const cn = useCertName(accessToken, user);

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
  const rows = courses
    .map(toRow)
    .map((r) => (finishOf[r.sku] ? { ...r, finish: finishOf[r.sku] } : r))
    .sort((a, b) => Number(certReady(b)) - Number(certReady(a)));

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Certificates</h1>
          <p>
            Issued to the account rather than to a laptop, so a change of machine or email does not
            lose them. You confirm the name to print once, when you claim the first one; each
            carries a QR code anyone can use to check it.
          </p>
        </div>
      </div>

      {rows.length ? (
        <div className="lx-certs">
          {rows.map((r) => (
            <CertTicket
              key={r.sku}
              row={r}
              certName={cn.name}
              claimed={cn.locked}
              onOpen={(row, action) => setCertOpen({ row, action })}
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
            <li>
              Carries a QR code and a reference anyone can verify at{" "}
              <Link to="/certificate" style={{ color: "var(--action)" }}>
                adlmstudio.net/certificate
              </Link>
            </li>
            <li>Your name is confirmed once, by you; the light or dark finish can change any time</li>
          </ul>
        </div>
      </section>

      <CertHost
        open={certOpen}
        cn={cn}
        token={accessToken}
        onFinish={(sku, finish) => setFinishOf((m) => ({ ...m, [sku]: finish }))}
        onClose={() => setCertOpen(null)}
      />
    </div>
  );
}
