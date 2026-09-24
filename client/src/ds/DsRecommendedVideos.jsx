// "Recommended videos" on his product pages, above the release history.
//
// The strip is drawn from the free library: the videos flagged `recommended`
// on the shelf that belongs to this catalogue product (QUIV's page gets the
// QUIV shelf, HERON's the HERON shelf), then the shared install walkthrough.
// Curation lives on the video records, so it changes from the admin Learn
// editor without touching his page.
//
// Rendered in his own vocabulary — a `sec-half` section, `sec-head`, and the
// `.lgrid`/`.ltile` tiles from his Learn page — through the @@d.videos@@ slot
// that port-ds-html.mjs places just before `#updates`. Nothing at all is
// rendered when the product has no videos yet, so no page carries an empty
// heading.

import React from "react";
import { Link } from "react-router-dom";
import { fetchRecommendedVideos } from "../lib/freeVideos.js";
import { DsVideoTile } from "./DsFreeLibrary.jsx";

export default function DsRecommendedVideos({ product, name, limit = 6 }) {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    if (!product) return undefined;
    const ac = new AbortController();
    fetchRecommendedVideos(product, limit, ac.signal)
      .then(setItems)
      .catch(() => setItems([]));
    return () => ac.abort();
  }, [product, limit]);

  if (!items.length) return null;

  return (
    <section className="sec-half blend" id="videos">
      <div className="shell">
        <div className="sec-head rise">
          <span className="eyebrow">Recommended videos</span>
          <h2>
            See {name || "it"} <span className="grad">at work</span>
          </h2>
          <p className="ds-lede">
            Free walkthroughs from the ADLM Studio channel. No sign-in, no trial clock.
          </p>
        </div>
        <div className="lgrid" data-ds-library>
          {items.map((v) => (
            <DsVideoTile key={v._id} v={v} />
          ))}
        </div>
        <div className="lmore">
          <Link className="ds-btn btn-o" to="/learn#library">
            Browse the whole library
          </Link>
        </div>
      </div>
    </section>
  );
}
