// Richard's certificate claim card and viewer (learn.js claim() and view(),
// 17 Sep 2026), on the account's real name lock and the enrolment's finish.
//
// Claim, three steps: write the name (live preview beside it) → tick that it
// is right (it locks; only ADLM can reopen it) → pick light or dark. If the
// account's name is already locked, the claim starts at the finish.
// View: the certificate, the finish switch, download as an A4 PDF (the
// browser's Save as PDF, full bleed), and the verification link.

import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { apiAuthed } from "../../api.js";
import { useFeedback } from "../feedback/feedbackContext.js";
import CertSheet from "./CertSheet.jsx";
import { certNameProblem, splitName, tidyName, verifyUrl } from "../../lib/certName.js";

const CloseX = ({ onClick }) => (
  <button type="button" className="wk-modal-x" aria-label="Close" onClick={onClick}>
    <svg viewBox="0 0 24 24">
      <use href="#hi-close" />
    </svg>
  </button>
);

function useOnFrame() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    const t = setTimeout(() => setOn(true), 80);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);
  return on;
}

async function saveFinish(token, sku, finish) {
  return apiAuthed(`/me/courses/${encodeURIComponent(sku)}/certificate-finish`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finish }),
  });
}

/**
 * @param {object} p
 * @param {object} p.cert      { sku, ref, title, length, issuedAt, finish }
 * @param {string} p.name      the account's name as it stands
 * @param {boolean} p.locked   the account's certificate name is already set
 */
export function CertClaim({ cert, name: startName, locked, token, onLocked, onDone, onClose }) {
  const fb = useFeedback();
  const on = useOnFrame();
  const [step, setStep] = React.useState(locked ? 3 : 1);
  const [name, setName] = React.useState(tidyName(startName));
  const [problem, setProblem] = React.useState("");
  const [ok, setOk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [finish, setFinish] = React.useState(cert.finish || "dark");

  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function close() {
    if (step < 3) {
      fb.toast({ tone: "info", title: "Certificate not claimed yet", msg: "Nothing was saved. Claim it from Certificates whenever you are ready." });
    }
    onClose();
  }

  const dots = (
    <div className="cx-dots" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i === step ? "on" : i < step ? "done" : undefined} />
      ))}
    </div>
  );

  const lockName = async () => {
    setBusy(true);
    try {
      await apiAuthed("/me/certificate-name", {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(splitName(name)),
      });
      // The page learns the name is locked now, not only when the claim
      // finishes: closing at step 3 must not leave a later claim to hit the
      // server's "already locked" refusal (review, 2026-09-22).
      onLocked?.(name);
      fb.toast({ tone: "success", title: "Name confirmed", msg: `Your certificates are issued to ${name}.` });
      setStep(3);
    } catch (e) {
      if (e?.status === 403 && e?.data?.locked) {
        const was = [e.data.certificateFirstName, e.data.certificateLastName].filter(Boolean).join(" ") || name;
        onLocked?.(was);
        setName(was);
        fb.toast({ tone: "info", title: "Your name was already confirmed", msg: `Certificates are issued to ${was}.` });
        setStep(3);
      } else {
        fb.toast({ tone: "error", title: e.message || "The name could not be saved." });
      }
    } finally {
      setBusy(false);
    }
  };

  const finishUp = async () => {
    setBusy(true);
    try {
      await saveFinish(token, cert.sku, finish);
      onDone({ name, finish });
    } catch (e) {
      fb.toast({ tone: "error", title: e.message || "That could not be saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={on ? "wk-modal cx-modal on" : "wk-modal cx-modal"}>
      <div className="wk-modal-c" role="dialog" aria-modal="true" aria-label="Claim your certificate">
        <CloseX onClick={close} />
        <div className="cx-prev" aria-hidden="true">
          <CertSheet cert={cert} name={name} finish={finish} noQr={step < 3} />
        </div>
        <div className="cx-step">
          {step === 1 && (
            <>
              {dots}
              <span className="k">Step 1 of 3 · Your name</span>
              <h2>How should your name appear?</h2>
              <p>
                You completed <b>{cert.title}</b>. Write your name exactly as you want it printed on the
                certificate: this is what an employer will see when they verify it.
              </p>
              <div className="cx-f">
                <label htmlFor="cx-name">Name on the certificate</label>
                <input
                  id="cx-name"
                  type="text"
                  maxLength={40}
                  autoComplete="name"
                  spellCheck={false}
                  value={name}
                  aria-invalid={problem ? "true" : undefined}
                  autoFocus
                  onChange={(e) => {
                    setName(e.target.value);
                    setProblem("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && document.getElementById("cx-next")?.click()}
                />
                <div className="meta">
                  <span className={problem ? "msg bad" : "msg"} aria-live="polite">
                    {problem}
                  </span>
                  <span className="ct">{tidyName(name).length} / 40</span>
                </div>
              </div>
              <ul className="cx-tips">
                <li>Use the name on your ID, in the order you use it</li>
                <li>Check capital letters and accents: they print as typed</li>
                <li>Leave out titles such as QS or Arc. unless you want them printed</li>
              </ul>
              <div className="cx-go">
                <button type="button" className="ds-btn btn-o" onClick={close}>
                  Not now
                </button>
                <button
                  id="cx-next"
                  type="button"
                  className="ds-btn btn-p"
                  onClick={() => {
                    const bad = certNameProblem(name);
                    if (bad) return setProblem(bad);
                    setName(tidyName(name));
                    setStep(2);
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {dots}
              <span className="k">Step 2 of 3 · Check it</span>
              <h2>Is this exactly right?</h2>
              <p>Read it letter by letter. This is the name the certificate is issued in.</p>
              <div className="cx-big">{name}</div>
              <div className="cx-warn">
                <svg viewBox="0 0 24 24">
                  <path d="M12 7.5v6" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9L2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
                </svg>
                <span>
                  <b>You set this once.</b> After you confirm, the name is locked on this account. A correction
                  later goes through ADLM support.
                </span>
              </div>
              <label className="cx-check">
                <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} autoFocus />
                <span>I have checked the spelling and this is how my name should appear.</span>
              </label>
              <div className="cx-go">
                <button type="button" className="ds-btn btn-o" onClick={() => setStep(1)}>
                  Edit the name
                </button>
                <button type="button" className="ds-btn btn-p" disabled={!ok || busy} onClick={lockName}>
                  {busy ? "Saving…" : "Confirm the name"}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {dots}
              <span className="k">Step 3 of 3 · The finish</span>
              <h2>Light or dark?</h2>
              <p>
                Pick the one you would rather frame or share. It does not change the certificate, and you can
                switch it whenever you like.
              </p>
              <div className="cx-styles" role="radiogroup" aria-label="Certificate finish">
                {[
                  ["dark", "Dark", "Navy marble, gold rules"],
                  ["light", "Light", "White marble, navy type"],
                ].map(([k, label, note]) => (
                  <button
                    key={k}
                    type="button"
                    className="cx-style"
                    role="radio"
                    aria-checked={finish === k}
                    onClick={() => setFinish(k)}
                  >
                    <img src={`/ds/cert-${k}.jpg`} alt="" />
                    <b>{label}</b>
                    <span>{note}</span>
                  </button>
                ))}
              </div>
              <div className="cx-go">
                <button type="button" className="ds-btn btn-p" disabled={busy} onClick={finishUp}>
                  Show my certificate
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Print one A4 page of the certificate: the browser's Save as PDF. */
export function PrintSheet({ cert, name, finish, onDone }) {
  const fb = useFeedback();
  // Held in refs so a parent re-render cannot start a second print.
  const ctx = React.useRef({ fb, onDone });
  ctx.current = { fb, onDone };
  React.useEffect(() => {
    const { fb } = ctx.current;
    document.documentElement.classList.add("cx-printing");
    const wrap = document.querySelector(".cx-print.ds");
    const imgs = [...(wrap?.querySelectorAll("img") || [])];
    let left = imgs.length;
    const go = () => {
      if (--left > 0) return;
      fb.toast({ tone: "info", title: "Choose “Save as PDF”", msg: "Your browser’s print dialogue is open. Set margins to None for a full-bleed A4." });
      setTimeout(() => {
        window.print();
        document.documentElement.classList.remove("cx-printing");
        ctx.current.onDone();
      }, 150);
    };
    if (!left) {
      left = 1;
      go();
    }
    imgs.forEach((im) => {
      if (im.complete) go();
      else {
        im.onload = go;
        im.onerror = go;
      }
    });
    return () => document.documentElement.classList.remove("cx-printing");
  }, []);
  return createPortal(
    <div className="cx-print ds">
      <CertSheet cert={cert} name={name} finish={finish} />
    </div>,
    document.body,
  );
}

export function CertView({ cert, name, token, onFinish, onClose }) {
  const fb = useFeedback();
  const on = useOnFrame();
  const [finish, setFinish] = React.useState(cert.finish || "dark");
  const [printing, setPrinting] = React.useState(false);
  const url = verifyUrl(cert.ref);

  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = async (k) => {
    if (k === finish) return;
    setFinish(k);
    try {
      await saveFinish(token, cert.sku, k);
      onFinish?.(k);
      fb.toast({ tone: "success", title: `Showing the ${k} finish`, msg: "Downloads use it from now on.", ms: 2800 });
    } catch (e) {
      fb.toast({ tone: "error", title: e.message || "The finish could not be saved." });
    }
  };

  return (
    <div className={on ? "wk-modal cx-view on" : "wk-modal cx-view"}>
      <div className="wk-modal-c" role="dialog" aria-modal="true" aria-label="Your certificate">
        <CloseX onClick={onClose} />
        <div className="cx-prev">
          <CertSheet cert={cert} name={name} finish={finish} />
        </div>
        <div className="cx-side">
          <div>
            <h2>{cert.title}</h2>
            <p className="sub">{name}</p>
          </div>
          <div>
            <div className="lbl">Finish</div>
            <div className="cx-seg">
              {["dark", "light"].map((k) => (
                <button key={k} type="button" aria-pressed={finish === k} onClick={() => pick(k)}>
                  {k === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => setPrinting(true)}>
              Download PDF
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(url)
                  .then(() => fb.toast({ title: "Verification link copied", msg: "Paste it into an application or a message." }))
                  .catch(() => fb.toast({ tone: "error", title: "Copy the link from the box below instead." }))
              }
            >
              Copy verification link
            </button>
          </div>
          <div className="cx-ver">
            <b>Verifiable</b>Anyone who scans the QR code, or opens this link, sees that ADLM Studio issued this
            certificate, and nothing about your account.
            <code>{url.replace(/^https?:\/\//, "")}</code>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, color: "var(--action)", textDecoration: "none", fontWeight: 500 }}>
              Open the verification page ↗
            </a>
          </div>
          <p className="fine">
            Name wrong? It was set when you claimed the certificate.{" "}
            <Link to="/manage/support#ticket" style={{ color: "var(--action)" }}>
              Ask support
            </Link>{" "}
            to reissue it.
          </p>
        </div>
      </div>
      {printing && <PrintSheet cert={cert} name={name} finish={finish} onDone={() => setPrinting(false)} />}
    </div>
  );
}
