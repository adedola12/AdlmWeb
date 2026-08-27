// His Downloads screen, on the real installer hub and the real packages.
//
// Three sources feed it, all of which already existed:
//
//   * summary.installerHub — the Hub download, its walkthrough video and the
//     user guide, all admin-configured under Settings.
//   * GET /me/deployments — the packages this account is allowed to fetch.
//     That endpoint already does the entitlement work: it returns a package
//     for anything licensed or pending, and strips the secret envVars from
//     anything not yet active. It is the same list the Hub itself installs
//     from, which is the point — a person and their Hub should not disagree
//     about what they can have.
//   * the catalogue, for the products not on the account.
//
// His "Before you install" accordion is kept as written: it is guidance about
// how activation works, and every line of it is still true of our licensing.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { useAuth } from "../store.jsx";

const ICONS = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  mep: "/ds/ic-mep.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  civil3d: "/ds/ic-civiq.png",
};

const icon = (name) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#hi-${name}`} />
  </svg>
);

// His accordion, with his hooks.
//
// Every rule that makes this work is scoped to the attributes rather than to a
// class: `.ds button[data-acc-h]` is what makes the row a flex line, and
// `.ds [data-acc] .acc-car` is what gives the chevron its 16px. Writing the
// markup without them left the button as a block and the chevron at an SVG's
// default size, which is how four compact rows became four enormous ones with
// a giant arrow under each.
//
// The body is his too. It collapses by animating grid-template-rows from 0fr
// to 1fr, so it must stay in the layout — the `display:none` I had instead
// killed the transition and fought the mechanism.
function Accordion({ title, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div
      data-acc=""
      className={open ? "open" : ""}
      style={{ borderBottom: "1px solid var(--line)", padding: "13px 0" }}
    >
      <button
        type="button"
        data-acc-h=""
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          style={{
            width: 15,
            height: 15,
            flex: "none",
            fill: "none",
            stroke: "var(--pal-light-key)",
            strokeWidth: 2.2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }}
        >
          <use href="#hi-check" />
        </svg>
        <span style={{ fontSize: 13, color: "var(--ink)" }}>{title}</span>
        <svg className="acc-car" viewBox="0 0 24 24">
          <use href="#hi-chevron" />
        </svg>
      </button>
      <div className="acc-body">
        <div>
          <p style={{ paddingLeft: 27 }}>{children}</p>
        </div>
      </div>
    </div>
  );
}

export default function DsDownloads() {
  const { accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [deployments, setDeployments] = React.useState(null);
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/deployments", { token: accessToken })
      .then((d) => alive && setDeployments(d.items || []))
      // No packages published is a normal state, and so is an endpoint that
      // will not answer — neither should blank the Hub download above it.
      .catch(() => alive && setDeployments([]));

    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!alive || !raw) return;
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        setCatalogue(all.filter((p) => !p.isCourse));
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const view = React.useMemo(() => {
    if (!summary || !deployments || !catalogue) return null;

    const byKey = Object.fromEntries(catalogue.map((p) => [p.key, p]));
    const held = new Set(
      (summary.entitlements || [])
        .filter((e) => !e.isCourse && byKey[e.productKey])
        .map((e) => e.productKey),
    );

    const packageFor = new Map();
    for (const d of deployments) {
      const k = String(d.productKey || "").toLowerCase();
      if (!packageFor.has(k)) packageFor.set(k, d);
    }

    const mine = catalogue
      .filter((p) => held.has(p.key))
      .map((p) => ({ product: p, pkg: packageFor.get(p.key) || null }));

    const rest = catalogue.filter((p) => !held.has(p.key));

    return { mine, rest, hub: summary.installerHub || {} };
  }, [summary, deployments, catalogue]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your downloads could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your downloads…</p>
      </div>
    );
  }

  const { hub } = view;

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Downloads</h1>
          <p>
            The Installer Hub is the short way: it signs in with this account and installs only
            what your licences cover. Individual packages are listed below for machines that
            cannot run it.
          </p>
        </div>
        {hub.downloadUrl && (
          <div className="dsh-acts">
            <a className="ds-btn btn-p ds-btn-sm" href={hub.downloadUrl}>
              Download the Installer Hub
            </a>
          </div>
        )}
      </div>

      <div className="dsh-hub" style={{ marginBottom: 20 }}>
        <h3>ADLM Installer Hub</h3>
        <p>
          One signed-in app that installs and updates everything on this account, shows what your
          subscription covers, and keeps each product on its current build.
        </p>
        {hub.downloadUrl ? (
          <a className="ds-btn btn-p ds-btn-sm" href={hub.downloadUrl}>
            Download for Windows {icon("downloads")}
          </a>
        ) : (
          <p className="meta">
            The Hub download is not published yet. The packages below install without it.
          </p>
        )}
        <p className="meta">
          Windows 64-bit · requires an ADLM account
          {hub.videoUrl ? (
            <>
              {" · "}
              <a href={hub.videoUrl} target="_blank" rel="noreferrer">
                Watch the walkthrough
              </a>
            </>
          ) : null}
        </p>
      </div>

      <div className="dsh-two">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Your products</h2>
              <span className="when">
                {view.mine.length} licensed
              </span>
            </div>
            <div className="dsh-body">
              {view.mine.length ? (
                view.mine.map(({ product, pkg }) => (
                  <div className="dsh-dl" key={product.key}>
                    {ICONS[product.key] ? (
                      <img src={ICONS[product.key]} alt="" />
                    ) : (
                      <span className="ic">{icon("computer")}</span>
                    )}
                    <div className="nm">
                      <b>
                        {product.name}
                        {pkg?.version ? ` ${pkg.version}` : ""}
                      </b>
                      <span>
                        {pkg
                          ? `Windows 64-bit${pkg.displayName ? ` · ${pkg.displayName}` : ""}`
                          : "Installed through the Hub"}
                      </span>
                    </div>
                    {pkg?.packageUri ? (
                      <a className="ds-btn btn-o ds-btn-sm" href={pkg.packageUri}>
                        Installer
                      </a>
                    ) : (
                      <Link className="ds-btn btn-o ds-btn-sm" to="/support">
                        Get help
                      </Link>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  Nothing is licensed on this account yet, so there is nothing to install.{" "}
                  <Link to="/manage/products">See what ADLM makes</Link>.
                </p>
              )}
            </div>
          </section>

          {view.rest.length > 0 && (
            <section className="dsh-panel">
              <div className="dsh-ph">
                <h2>Not in the subscription</h2>
                <Link className="more" to="/products">
                  See pricing
                </Link>
              </div>
              <div className="dsh-body">
                {view.rest.map((p) => (
                  <div className="dsh-dl" key={p.key}>
                    {ICONS[p.key] ? (
                      <img
                        src={ICONS[p.key]}
                        alt=""
                        style={{ filter: "grayscale(1)", opacity: 0.5 }}
                      />
                    ) : (
                      <span className="ic">{icon("computer")}</span>
                    )}
                    <div className="nm">
                      <b>{p.name}</b>
                      <span>
                        {p.isComingSoon
                          ? "In development, not available to install"
                          : "Add it to the subscription to download"}
                      </span>
                    </div>
                    <Link className="ds-btn btn-o ds-btn-sm" to={`/product/${p.key}`}>
                      Details
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Guides</h2>
            </div>
            <div className="dsh-body">
              {hub.guideUrl ? (
                <div className="dsh-dl">
                  <span className="ic">{icon("doc")}</span>
                  <div className="nm">
                    <b>Installer Hub user guide</b>
                    <span>PDF · installing, updating and activation</span>
                  </div>
                  <a className="ds-btn btn-o ds-btn-sm" href={hub.guideUrl} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                </div>
              ) : null}
              <div className="dsh-dl">
                <span className="ic">{icon("doc")}</span>
                <div className="nm">
                  <b>What&apos;s New</b>
                  <span>Every change that has shipped, product by product</span>
                </div>
                <Link className="ds-btn btn-o ds-btn-sm" to="/whats-new">
                  Read
                </Link>
              </div>
              <div className="dsh-dl">
                <span className="ic">{icon("doc")}</span>
                <div className="nm">
                  <b>Support</b>
                  <span>Raise a ticket, or get a remote session</span>
                </div>
                <Link className="ds-btn btn-o ds-btn-sm" to="/support">
                  Open
                </Link>
              </div>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Before you install</h2>
            </div>
            <div className="dsh-body">
              <Accordion title="Close Revit or PlanSwift first">
                The panel registers itself with the host application during install. If Revit is
                open, the registration is written but not picked up until the next launch, which
                is what most missing-panel tickets turn out to be.
              </Accordion>
              <Accordion title="A seat activates against this machine, not this person">
                Signing in on a second machine takes a second activation. Your free activations
                are shown under Team &amp; seats.
              </Accordion>
              <Accordion title="Moving a seat is done here, not by reinstalling">
                Free the seat under Team &amp; seats, then install on the new machine.
                Reinstalling without freeing it uses up an activation that then has to be
                released by support.
              </Accordion>
              <Accordion title="Windows 64-bit only">
                Revit and PlanSwift are Windows-only, so the plugins follow. The mobile app covers
                iOS and Android and needs no seat.
              </Accordion>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
