// What's New — his page, with the latest-builds table from the changelog.
//
// Generated verbatim from his src/whats-new.html apart from two edits (see
// PAGE_EDITS in scripts/port-ds-html.mjs): the table body, which had fallen
// behind on three of seven products, and the hero lede, which promised "what
// was broken before".
//
// `d.latest` is the <tbody>, rendered from src/data/changelogs.js — the same
// source the per-product release lists use, so the hub and the product pages
// can never disagree about what shipped.

import React from "react";
import DsWhatsNewPage from "../pages/DsWhatsNewPage.jsx";
import DsLatestTable from "../DsLatestTable.jsx";

export default function DsWhatsNew() {
  return <DsWhatsNewPage d={{ latest: <DsLatestTable /> }} />;
}
