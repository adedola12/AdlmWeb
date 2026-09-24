// "Latest across the toolkit" — his table, filled from the changelog.
//
// His whats-new.html states each product's latest build in the markup, and it
// had already drifted: HERON showed v2.9.1 when v2.9.2 had shipped, RateGen
// v2.5.0 against v2.8.1, Time Pro v1.1.0 against v1.1.1 — and three of the
// descriptions belonged to releases other than the one named beside them.
//
// The row markup is his, unchanged (.ctable / .rowhead with its <small>
// descender / .num / .vz-chip). Only the contents come from
// src/data/changelogs.js, the same source the What's New pages use, so the
// table cannot fall behind a release again.

import React from "react";
import { Link } from "react-router-dom";
import { products as CHANGELOG_PRODUCTS } from "../data/changelogs.js";
import { PRODUCT_KEY } from "../lib/dsRoutes.js";

// His row order and his labels. Products with a marketing page link to it;
// ADLM Cloud and the Installer Hub have none, which is why his markup links
// the first five and leaves the last two as plain text.
const ROWS = [
  { slug: "quiv", label: "QUIV" },
  { slug: "heron", label: "HERON" },
  { slug: "mep", label: "Revit MEP" },
  { slug: "rategen", label: "RateGen" },
  { slug: "timepro", label: "Time Pro" },
  { slug: "cloud", label: "ADLM Cloud" },
  { slug: "hub", label: "Installer Hub" },
];

export default function DsLatestTable() {
  const rows = ROWS.map((r) => {
    const p = CHANGELOG_PRODUCTS.find((x) => x.slug === r.slug);
    const latest = p?.releases?.[0] || null;
    return { ...r, product: p, latest };
  }).filter((r) => r.latest); // a product with nothing shipped is not "shipping"

  return (
    <tbody>
      {rows.map(({ slug, label, latest }) => {
        const key = PRODUCT_KEY[slug];
        return (
          <tr key={slug}>
            <th className="rowhead" scope="row">
              {key ? (
                <Link to={`/product/${key}`} style={{ color: "var(--action)", textDecoration: "none" }}>
                  {label}
                </Link>
              ) : (
                label
              )}
              <small>{latest.title}</small>
            </th>
            <td className="num">
              <span className="vz-chip on">v{latest.version}</span>
            </td>
            <td className="num">{latest.date}</td>
            <td>{latest.highlight}</td>
          </tr>
        );
      })}
    </tbody>
  );
}
