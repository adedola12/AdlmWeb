// /certificate — the page a certificate's QR code opens (R14).
//
// Richard's certificate.html and cert-verify.js (17 Sep 2026), on the real
// register: GET /verify/:ref. Who lands here is an employer, a client or a
// school holding a certificate someone showed them. They are not signed in and
// never will be, so the page is public, and it answers one question with only
// what is printed on the certificate.
//
// States: idle → checking → valid, withdrawn or not found.
// Two differences from his, both deliberate:
//   - a withdrawn certificate says when, not why (routes/verify.js explains);
//   - there is no mark on the register, so "Result" reads Completed.

import React from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../config";
import { useFeedback } from "./feedback/feedbackContext.js";
import CertSheet from "./cert/CertSheet.jsx";
import { verifyUrl } from "../lib/certName.js";

// TODO(adlm): his page sends reports to verify@adlmstudio.net. Create that
// mailbox (or confirm another) and change this line; until then reports go to
// the studio's main address.
const REPORT_TO = "admin@adlmstudio.net";

const norm = (ref) => String(ref || "").trim().toUpperCase().replace(/\s+/g, "");

function stamp() {
  const d = new Date();
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const ICON = {
  valid: <path d="M5 12.5l4.2 4.2L19 7" />,
  revoked: <path d="M7 7l10 10M17 7L7 17" />,
  notfound: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
      <path d="M12 17h.01" />
    </>
  ),
};

function Status({ kind, k, title, children }) {
  return (
    <div className={`cv-status ${kind}`}>
      <i>
        <svg viewBox="0 0 24 24">{ICON[kind]}</svg>
      </i>
      <div>
        <span>{k}</span>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}

function Rows({ list }) {
  return (
    <dl className="cv-rows">
      {list.map(([dt, dd]) => (
        <div key={dt}>
          <dt>{dt}</dt>
          <dd>{dd}</dd>
        </div>
      ))}
    </dl>
  );
}

async function lookUp(ref) {
  const res = await fetch(`${API_BASE}/verify/${encodeURIComponent(ref)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error("The register could not be reached just now. Please try again.");
  return res.json();
}

export default function DsCertificateVerify() {
  const fb = useFeedback();
  const [params, setParams] = useSearchParams();
  const [value, setValue] = React.useState(norm(params.get("ref")));
  const [bad, setBad] = React.useState(false);
  const [state, setState] = React.useState({ phase: "idle" });
  const out = React.useRef(null);

  const check = React.useCallback(async (raw) => {
    const ref = norm(raw);
    setState({ phase: "checking", ref });
    // A real lookup is quick; showing that it happened is part of the answer.
    const [r] = await Promise.allSettled([lookUp(ref), new Promise((ok) => setTimeout(ok, 450))]);
    if (r.status === "rejected") setState({ phase: "error", ref, msg: r.reason?.message });
    else setState({ phase: r.value.found ? (r.value.valid ? "valid" : "revoked") : "notfound", ref, r: r.value });
    requestAnimationFrame(() => out.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
  }, []);

  React.useEffect(() => {
    const was = document.title;
    document.title = "Verify a certificate | ADLM Studio";
    return () => {
      document.title = was;
    };
  }, []);

  const q = params.get("ref");
  React.useEffect(() => {
    if (q) check(q);
  }, [q, check]);

  const submit = (e) => {
    e.preventDefault();
    const ref = norm(value);
    setBad(false);
    if (!ref) {
      setBad(true);
      fb.toast({ tone: "error", title: "Enter a certificate number", msg: "It is printed beside Cert. No. on the certificate." });
      return;
    }
    setValue(ref);
    if (ref === norm(q)) check(ref);
    else setParams({ ref }, { replace: true });
  };

  const { phase, ref, r } = state;
  const link = verifyUrl(ref);

  return (
    <section className="sec cv" style={{ paddingTop: 132 }}>
      <div className="shell">
        <div className="cv-head">
          <span className="eyebrow">Certificate verification</span>
          <h1>
            Is this certificate <span className="tone">genuine?</span>
          </h1>
          <p className="ds-lede">
            Every ADLM Studio certificate carries a number and a QR code. We check it against the register of
            certificates we have issued. Nothing else is needed.
          </p>
          <form className="cv-look" noValidate onSubmit={submit}>
            <label htmlFor="cv-ref" className="cv-sr">
              Certificate number
            </label>
            <input
              id="cv-ref"
              name="ref"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Certificate number, e.g. CERT-8E12F4"
              value={value}
              aria-invalid={bad ? "true" : undefined}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" className="ds-btn btn-p">
              Verify
            </button>
          </form>
          <p className="cv-hint">
            The number is printed beside <b>Cert. No.</b> on the certificate.
          </p>
        </div>

        <div id="cv-out" aria-live="polite" ref={out}>
          {phase === "idle" && (
            <>
              <div className="cv-how">
                <div>
                  <b>1</b>
                  <h3>Scan or type</h3>
                  <p>Point a phone camera at the QR code on the certificate, or enter its number above.</p>
                </div>
                <div>
                  <b>2</b>
                  <h3>We check the register</h3>
                  <p>Every certificate ADLM Studio issues is recorded, with its holder, programme and date.</p>
                </div>
                <div>
                  <b>3</b>
                  <h3>Compare</h3>
                  <p>We show what we issued. If the paper in front of you says something different, it was altered.</p>
                </div>
              </div>
              <p className="cv-safe">
                This check only ever runs at <b>adlmstudio.net/certificate</b>. A QR code that sends you anywhere
                else did not come from us.
              </p>
            </>
          )}

          {phase === "checking" && (
            <div className="cv-card cv-wait">
              <span className="cv-spin" />
              Checking the ADLM register…
            </div>
          )}

          {phase === "error" && (
            <div className="cv-card">
              <Status kind="notfound" k="Not checked" title="The register could not be reached">
                {state.msg || "Please try again in a moment."}
              </Status>
            </div>
          )}

          {phase === "notfound" && (
            <div className="cv-card">
              <Status kind="notfound" k="Not verified" title="We have no certificate with this number">
                ADLM Studio did not issue a certificate numbered <b>{ref}</b>.
              </Status>
              <div className="cv-body">
                <h3>Before you conclude it is fake</h3>
                <ul className="cv-list">
                  <li>
                    Check the number character by character: it reads <b>CERT-</b> followed by six letters and
                    numbers.
                  </li>
                  <li>If you typed it, scan the QR code instead. It carries the number exactly.</li>
                  <li>A certificate issued in the last 24 hours may not be on the register yet.</li>
                </ul>
                <div className="cv-acts">
                  <a
                    className="ds-btn btn-o ds-btn-sm"
                    href={`mailto:${REPORT_TO}?subject=${encodeURIComponent(`Suspected certificate: ${ref}`)}`}
                  >
                    Report a suspected fake
                  </a>
                  <a className="ds-btn btn-o ds-btn-sm" href="/support">
                    Contact ADLM
                  </a>
                </div>
              </div>
            </div>
          )}

          {phase === "revoked" && (
            <div className="cv-card">
              <Status kind="revoked" k="Withdrawn" title="This certificate is no longer valid">
                ADLM Studio issued it, then withdrew it on {r.withdrawn}.
              </Status>
              <div className="cv-body">
                <Rows
                  list={[
                    ["Certificate no.", r.ref],
                    ["Issued to", r.who],
                    ["Programme", r.course],
                    ["Issued", r.issued],
                    ["Withdrawn", r.withdrawn],
                  ]}
                />
                <p className="cv-note">
                  If this was presented to you as current, please tell us:{" "}
                  <a href={`mailto:${REPORT_TO}?subject=${encodeURIComponent(`Withdrawn certificate presented: ${r.ref}`)}`}>
                    {REPORT_TO}
                  </a>
                  .
                </p>
                <p className="cv-when">Checked against the ADLM register on {stamp()}</p>
              </div>
            </div>
          )}

          {phase === "valid" && (
            <div className="cv-card cv-grid">
              <div>
                <Status kind="valid" k="Verified" title="Genuine ADLM Studio certificate">
                  {r.claimed ? (
                    <>
                      Issued to <b>{r.who}</b> and in force.
                    </>
                  ) : (
                    "Issued and in force. The holder has not yet confirmed how their name is printed."
                  )}
                </Status>
                <div className="cv-body">
                  <Rows
                    list={[
                      [
                        "Issued to",
                        r.claimed ? (
                          r.who
                        ) : (
                          <>
                            {r.who} <em>· awaiting the holder’s confirmation</em>
                          </>
                        ),
                      ],
                      ["Programme", r.course],
                      ["Result", "Completed"],
                      ["Issued on", r.issued],
                      ["Certificate no.", r.ref],
                      ["Signed by", "Adedolapo Quasim, Chief Executive Officer"],
                    ]}
                  />
                  <p className="cv-note">
                    <b>Compare this with the certificate you were shown.</b> If the name, programme or date differ
                    from what is printed, the certificate was altered after we issued it.
                  </p>
                  <div className="cv-acts">
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(link)
                          .then(() => fb.toast({ title: "Link copied", msg: "Anyone who opens it sees this same check." }))
                          .catch(() => fb.toast({ tone: "error", title: "Could not copy the link", msg: link }))
                      }
                    >
                      Copy this verification link
                    </button>
                    <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => window.print()}>
                      Print this check
                    </button>
                  </div>
                  <p className="cv-when">Checked against the ADLM register on {stamp()}</p>
                </div>
              </div>
              <figure className="cv-sheet">
                <CertSheet
                  cert={{ ref: r.ref, title: r.course, issuedAt: r.issuedAt }}
                  name={r.who === "the holder" ? "" : r.who}
                  finish={r.finish}
                />
                <figcaption>How the certificate looks as issued.</figcaption>
              </figure>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
