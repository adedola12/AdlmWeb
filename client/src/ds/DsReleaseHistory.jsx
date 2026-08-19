// Release history, rendered from the real changelog.
//
// Every product page of his carries a hand-written release list — QUIV's had
// five entries typed into the markup. Those are a copy of the truth that goes
// stale the moment a release ships, and they already disagreed with the
// changelog in places.
//
// This renders his exact markup (.rel / .rel-item / .rel-head / .ver / .when /
// .rel-body / .rel-tags, first item un-dimmed and the rest `.minor`) from
// src/data/changelogs.js — the same source the What's New pages use, generated
// from src/data/changelogs/*.md. Ship a release, run `npm run gen:changelogs`,
// and every product page updates with it.

import React from "react";
import { Link } from "react-router-dom";
import { products as CHANGELOG_PRODUCTS } from "../data/changelogs.js";

// His tag styling: `new` is the accent chip, `fix` the muted one, and
// "Improved" carries no modifier class at all.
const TAG = {
  new: { cls: "new", label: "New" },
  improved: { cls: "", label: "Improved" },
  fixed: { cls: "fix", label: "Fixed" },
};

// His <p> is a prose summary, and the changelog's `highlight` is exactly that
// — one or two sentences on what the release means for the reader.
//
// The per-change bullets are deliberately NOT published: they are our internal
// record and name file paths, environment variables and the shape of past
// defects. See the note in scripts/gen-changelogs.mjs. The change TYPES still
// ship, which is what these pills render from.
function ReleaseBody({ release }) {
  const tags = (release.changes || []).map((g) => TAG[g.type]).filter(Boolean);

  return (
    <div className="rel-body">
      {release.highlight && <p>{release.highlight}</p>}
      {tags.length > 0 && (
        <div className="rel-tags">
          {tags.map((t) => (
            <span key={t.label} className={t.cls}>
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.slug        changelog slug — quiv, heron, rategen, mep, timepro, civiq
 * @param {number} [props.limit]     how many releases a product page shows before
 *   linking out. Three: a product page is a sales page, and the full history
 *   belongs on What's New.
 */
export default function DsReleaseHistory({ slug, limit = 3 }) {
  const product = CHANGELOG_PRODUCTS.find((p) => p.slug === slug);
  const releases = product?.releases || [];

  // Nothing shipped yet — CIVIQ's case. His own civiq page words this well, so
  // the same shape is reused rather than showing an empty list.
  if (!releases.length) {
    return (
      <div
        className="ds-card tilt rise"
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          textAlign: "center",
          padding: "40px 48px",
        }}
      >
        <h4>Nothing shipped yet</h4>
        <p style={{ marginBottom: "22px", maxWidth: "52ch", marginLeft: "auto", marginRight: "auto" }}>
          {product?.name || "This product"} is in active development. Release notes will appear here
          the day the first build lands. Join the waitlist and we&apos;ll tell you.
        </p>
        <a className="ds-btn btn-p" href="#waitlist">
          Join the waitlist
        </a>
      </div>
    );
  }

  const shown = releases.slice(0, limit);

  return (
    <>
      <div className="rel rise">
        {shown.map((r, i) => (
          <div className={i === 0 ? "rel-item" : "rel-item minor"} key={r.version}>
            <div className="rel-head">
              <b>{r.title}</b>
              <span className="ver">v{r.version}</span>
              <span className="when">{r.date}</span>
            </div>
            <ReleaseBody release={r} />
          </div>
        ))}
      </div>
      {/* His wording and his target: one What's New page for the whole
          toolkit, not a per-product one. Pointing this at /whats-new/<slug>
          dropped the reader out of the redesign and onto the current site's
          page, because only /whats-new has a staged counterpart. */}
      <p className="small" style={{ textAlign: "center", marginTop: "26px" }}>
        <Link to="/whats-new" style={{ color: "var(--action)" }}>
          See updates across every product →
        </Link>
      </p>
    </>
  );
}
