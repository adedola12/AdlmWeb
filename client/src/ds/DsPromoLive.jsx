// "Latest from ADLM" — his band, filled from the admin.
//
// His version has four items typed into index.html, which means keeping the
// band current takes a code change and a deploy. This renders his exact markup
// (.promo / .promo-fr / .promo-track / .promo-item.on / .promo-art /
// .promo-copy / .tag / .promo-dots) from GET /latest, so whoever runs
// marketing can change what a visitor sees from Admin → Latest from ADLM.
//
// If the endpoint is empty or unreachable it renders HIS four items instead.
// The band sits on 25 pages; a blank strip on all of them would be a worse
// failure than slightly stale copy.

import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config.js";
import DsPromo from "./chrome/DsPromo.jsx";

// How long each item holds. His site uses 6000ms; this is deliberately
// quicker — four items at six seconds means twenty-four seconds to see the
// band, which is longer than most visitors stay on the page.
const INTERVAL_MS = 4000;

function Item({ item, active }) {
  const external = /^https?:\/\//i.test(item.ctaHref || "");
  const cta = item.ctaHref ? (
    external ? (
      <a href={item.ctaHref} className="ds-btn btn-o" target="_blank" rel="noreferrer">
        {item.ctaLabel || "Read more"}
      </a>
    ) : (
      <Link to={item.ctaHref} className="ds-btn btn-o">
        {item.ctaLabel || "Read more"}
      </Link>
    )
  ) : null;

  return (
    <article className={active ? "promo-item on" : "promo-item"}>
      <div className="promo-art">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : null}
      </div>
      <div className="promo-copy">
        {item.tag ? <span className="tag">{item.tag}</span> : null}
        <h3>{item.title}</h3>
        {item.blurb ? <p>{item.blurb}</p> : null}
        {cta}
      </div>
    </article>
  );
}

export default function DsPromoLive() {
  const [items, setItems] = React.useState(null); // null = still deciding
  const [at, setAt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/latest?limit=6`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const out = await res.json();
        // An empty list means nobody has curated the band yet — fall back to
        // his items rather than showing an empty strip.
        if (alive) setItems(out.items?.length ? out.items : []);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const count = items?.length || 0;

  React.useEffect(() => {
    if (count < 2) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setInterval(() => setAt((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [count]);

  // Not loaded yet, or nothing curated: his static band, behaviours and all.
  if (!items || count === 0) return <DsPromo />;

  return (
    <section className="promo" id="promo">
      <div className="shell">
        <span className="host">Latest from ADLM</span>
        <div className="promo-fr">
          <div className="promo-track">
            {items.map((item, i) => (
              <Item key={item.id} item={item} active={i === at} />
            ))}
          </div>
          <div className="promo-dots">
            {items.map((item, i) => (
              <i
                key={item.id}
                className={i === at ? "on" : ""}
                onClick={() => setAt(i)}
                aria-label={`Show update ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
