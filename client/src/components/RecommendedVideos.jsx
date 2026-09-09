// The "Recommended videos" strip on a product page.
//
// Draws from the free library: the videos flagged `recommended` on the shelf
// that belongs to this catalogue product (QUIV's page gets the QUIV shelf,
// HERON's the HERON shelf), then the shared getting-started walkthroughs.
// The curation lives on the video records, so the strip changes from the
// admin Learn editor without a deploy.
//
// Renders nothing at all when there is nothing to show: a product with no
// videos yet should not carry an empty heading.

import React from "react";
import { Link } from "react-router-dom";
import { fetchRecommendedVideos } from "../lib/freeVideos.js";
import FreeVideoCard from "./FreeVideoCard.jsx";
import { Reveal, Stagger, StaggerItem } from "./effects.jsx";
import { Eyebrow } from "./brand.jsx";
import { IconPlaySquare } from "./icons.jsx";

export default function RecommendedVideos({ productKey, productName, limit = 6 }) {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    if (!productKey) return undefined;
    const ac = new AbortController();
    fetchRecommendedVideos(productKey, limit, ac.signal)
      .then((list) => setItems(list))
      .catch(() => {
        // The product page must not fail because the library did.
        setItems([]);
      });
    return () => ac.abort();
  }, [productKey, limit]);

  if (!items.length) return null;

  const shortName = String(productName || "").split(":")[0].trim();

  return (
    <section>
      <Reveal>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow tone="blue">Recommended videos</Eyebrow>
            <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-adlm-dark-text">
              {shortName ? `See ${shortName} at work` : "See it at work"}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-adlm-dark-muted max-w-2xl">
              Free walkthroughs from the ADLM Studio channel. Hover to preview, click to watch.
            </p>
          </div>
          <Link
            to="/learn#free"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline"
          >
            <IconPlaySquare className="w-4 h-4" />
            Browse the whole library
          </Link>
        </div>
      </Reveal>
      <Stagger className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((v) => (
          <StaggerItem key={v._id}>
            <FreeVideoCard v={v} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
