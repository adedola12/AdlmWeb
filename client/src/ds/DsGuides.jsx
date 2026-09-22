// Guides & docs (R04; Richard's dash-guides, 17 Sep 2026).
//
// Its own page, so the rail's "Guides & docs" no longer shares a route with
// Downloads (which lit both items up and landed on the wrong page). His
// layout and classes; the guides are ours, from data/guides.js — the same
// PDFs the What's New pages and the dashboard offer.
//
// Downloads are plain <a download> links to our own files (never a router
// Link, which is what sent the old Learn-page downloads to the 404).

import React from "react";
import { Link } from "react-router-dom";
import { GUIDES } from "../data/guides.js";
import { useFeedback } from "./feedback/feedbackContext.js";

// His order: the whole suite first, then the Hub, then each product.
const ORDER = ["suite", "installer-hub", "quiv", "rategen", "complete"];
const LIST = ORDER.map((id) => GUIDES.find((g) => g.id === id)).filter(Boolean);

const icon = (name) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#hi-${name}`} />
  </svg>
);

function mb(bytes) {
  return bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : "";
}

export default function DsGuides() {
  const fb = useFeedback();
  const [sizes, setSizes] = React.useState({});
  const [viewing, setViewing] = React.useState(null);

  // File sizes from the files themselves, so the page never states a size
  // that drifted from the PDF on disk.
  React.useEffect(() => {
    let live = true;
    Promise.all(
      LIST.map((g) =>
        fetch(g.file, { method: "HEAD" })
          .then((r) => [g.id, Number(r.headers.get("content-length")) || 0])
          .catch(() => [g.id, 0]),
      ),
    ).then((pairs) => live && setSizes(Object.fromEntries(pairs)));
    return () => {
      live = false;
    };
  }, []);

  React.useEffect(() => {
    if (!viewing) return undefined;
    const onKey = (e) => e.key === "Escape" && setViewing(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [viewing]);

  const started = (g) =>
    fb.toast({ tone: "success", title: "Download started", msg: `${g.title}${sizes[g.id] ? ` · ${mb(sizes[g.id])}` : ""}` });

  const suite = LIST[0];

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Guides &amp; docs</h1>
          <p>
            The user guides for every ADLM product, written for people doing the work. Read one here or
            keep a copy. They are the same files the tutors teach from.
          </p>
        </div>
        {suite && (
          <div className="dsh-acts">
            <a className="ds-btn btn-p ds-btn-sm" href={suite.file} download="" onClick={() => started(suite)}>
              Download everything
            </a>
          </div>
        )}
      </div>

      <div className="dsh-two">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>User guides</h2>
              <span className="when">{LIST.length} guides</span>
            </div>
            <div className="dsh-body">
              {LIST.map((g) => (
                <div className="dsh-dl" key={g.id}>
                  <span className="ic">{icon("doc")}</span>
                  <div className="nm">
                    <b>{g.title}</b>
                    <span>
                      PDF · {g.pages} pages{sizes[g.id] ? ` · ${mb(sizes[g.id])}` : ""}
                    </span>
                    <p className="gd-d">{g.blurb}</p>
                  </div>
                  <div className="gd-a">
                    <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setViewing(g)}>
                      Read
                    </button>
                    <a className="ds-btn btn-p ds-btn-sm" href={g.file} download="" onClick={() => started(g)}>
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Still stuck?</h2>
            </div>
            <div className="dsh-body">
              <p className="gd-p">
                Ada answers from these guides and your own account. If she cannot help, a person on support
                will.
              </p>
              <div className="gd-a" style={{ marginTop: 14 }}>
                <button type="button" className="ds-btn btn-o ds-btn-sm" data-ada-open="">
                  Ask Ada
                </button>
                <Link className="ds-btn btn-o ds-btn-sm" to="/manage/support">
                  Contact support
                </Link>
              </div>
            </div>
          </section>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Installers are elsewhere</h2>
            </div>
            <div className="dsh-body">
              <p className="gd-p">
                The Installer Hub and each product&apos;s standalone installer are on{" "}
                <Link to="/manage/downloads">Downloads</Link>, under Manage.
              </p>
            </div>
          </section>
        </div>
      </div>

      {viewing && (
        <div
          className="docviewer"
          onClick={(e) => e.target === e.currentTarget && setViewing(null)}
          role="dialog"
          aria-modal="true"
          aria-label={viewing.title}
        >
          <div className="dv-inner">
            <div className="dv-bar">
              <b>{viewing.title}</b>
              <button type="button" aria-label="Close preview" onClick={() => setViewing(null)}>
                ✕
              </button>
            </div>
            <iframe src={viewing.file} title={viewing.title} />
          </div>
        </div>
      )}
    </div>
  );
}
