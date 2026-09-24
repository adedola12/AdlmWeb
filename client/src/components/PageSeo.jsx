// <Seo> for a route whose title and description live in lib/pageMeta.js.
//
// Most marketing pages need the same three things: the shared title and
// description for their path, a self-referencing canonical, and a breadcrumb
// trail. Spelling that out on every page invites the copy to drift from the
// server's table, which is the exact problem pageMeta.js was created to end.
//
// Pages with something extra to say — a product's own name and price, a
// changelog's product line — still use <Seo> directly and pass their own values.
import React from "react";

import Seo from "./Seo.jsx";
import { metaFor } from "../lib/pageMeta.js";
import { breadcrumbSchema } from "../lib/schema.js";

/**
 * @param {string} path      the route's own path, e.g. "/trainings"
 * @param {string} crumb     label for this page in the breadcrumb trail.
 *                           Omit on top-level pages that need no trail.
 * @param {object|array} jsonLd  extra schema blocks for this page
 */
export default function PageSeo({ path, crumb, jsonLd }) {
  const meta = metaFor(path);

  // Breadcrumbs only where there is a trail to describe. A BreadcrumbList
  // containing nothing but "Home" describes no hierarchy and is noise.
  const blocks = [];
  if (crumb) {
    blocks.push(
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: crumb, path },
      ]),
    );
  }
  if (jsonLd) blocks.push(...(Array.isArray(jsonLd) ? jsonLd : [jsonLd]));

  return (
    <Seo
      title={meta?.title}
      description={meta?.description}
      path={path}
      jsonLd={blocks.length ? blocks : undefined}
    />
  );
}
