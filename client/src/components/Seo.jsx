// Per-route head management for a client-rendered app.
//
// WHY THIS EXISTS
// index.html ships one title, one description and — the damaging part — one
// canonical, `https://www.adlmstudio.net/`. Because Vercel rewrites every path
// to that same file, every route in the site was telling Google it is a
// duplicate of the homepage. That is not a missing optimisation; it is an
// instruction to drop the page from the index.
//
// Deliberately dependency-free. react-helmet-async would do this too, but the
// whole job is "write some tags into <head> and put them back on unmount", and
// this repo already hand-rolls its primitives.
//
// Google executes JavaScript, so tags written on mount are seen. They are not
// seen by every social scraper, though — most read the raw HTML and never run
// the app. If link previews on WhatsApp or LinkedIn matter for a given page,
// that page needs real server-rendered meta, which is what
// server/routes/meta.dynamic.js was built for.

import React from "react";
import { useLocation } from "react-router-dom";

const SITE = "https://www.adlmstudio.net";
const SITE_NAME = "ADLM Studio";
const DEFAULT_IMAGE = `${SITE}/Logo.png`;

/** Everything this component writes is tagged, so cleanup never guesses. */
const OWNED = "data-seo";

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(OWNED, "1");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute(OWNED, "1");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

/**
 * @param {string}  title        page title, without the site suffix
 * @param {string}  description  ~150-160 chars; longer is truncated by Google
 * @param {string}  path         canonical path. Defaults to the current route.
 * @param {string}  image        absolute or site-relative share image
 * @param {string}  type         og:type — "website", "article", "product"
 * @param {boolean} noindex      keep this page out of the index
 * @param {object|array} jsonLd  schema.org payload(s) for this page
 */
export default function Seo({
  title,
  description,
  path,
  image,
  type = "website",
  noindex = false,
  jsonLd,
}) {
  const location = useLocation();

  // Query strings and hashes are not separate pages. Canonicalising with them
  // attached would split one page's signals across every filter combination
  // the product grid can produce.
  const canonicalPath = path ?? location.pathname;

  React.useEffect(() => {
    // "About ADLM Studio | ADLM Studio" reads as a mistake and wastes the ~60
    // characters Google actually shows.
    const fullTitle = !title
      ? SITE_NAME
      : title.includes(SITE_NAME)
        ? title
        : `${title} | ${SITE_NAME}`;
    const url = `${SITE}${canonicalPath === "/" ? "/" : canonicalPath.replace(/\/+$/, "")}`;
    const img = image
      ? image.startsWith("http")
        ? image
        : `${SITE}${image}`
      : DEFAULT_IMAGE;

    const previousTitle = document.title;
    document.title = fullTitle;

    upsertLink("canonical", url);

    if (description) {
      upsertMeta('meta[name="description"]', { name: "description", content: description });
      upsertMeta('meta[property="og:description"]', {
        property: "og:description",
        content: description,
      });
      upsertMeta('meta[name="twitter:description"]', {
        name: "twitter:description",
        content: description,
      });
    }

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: img });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: img });
    // summary_large_image only renders if the image is big enough; the default
    // in index.html is "summary", which is right for a bare logo.
    if (image) {
      upsertMeta('meta[name="twitter:card"]', {
        name: "twitter:card",
        content: "summary_large_image",
      });
    }

    // Always written, never removed. index.html ships a default robots tag, so
    // "remove it when the page is indexable" would leave a noindex behind after
    // navigating away from a private page — the tag would survive, and the next
    // public page would quietly inherit it. Setting the value outright on every
    // route makes the state depend only on the route you are on.
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex,nofollow" : "index,follow",
    });

    // Structured data is replaced wholesale per route rather than merged: two
    // routes' worth of schema on one page describes a page that does not exist.
    document.head
      .querySelectorAll(`script[type="application/ld+json"][${OWNED}]`)
      .forEach((n) => n.remove());

    if (jsonLd) {
      for (const block of Array.isArray(jsonLd) ? jsonLd : [jsonLd]) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute(OWNED, "1");
        script.textContent = JSON.stringify(block);
        document.head.appendChild(script);
      }
    }

    return () => {
      document.title = previousTitle;
      document.head
        .querySelectorAll(`script[type="application/ld+json"][${OWNED}]`)
        .forEach((n) => n.remove());
    };
  }, [title, description, canonicalPath, image, type, noindex, jsonLd]);

  return null;
}
