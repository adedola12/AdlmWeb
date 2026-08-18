// Quotation — his page, with a working builder priced from the catalogue.
//
// The page is generated verbatim from his src/quote.html; the one edit swaps
// the static builder markup for DsQuoteBuilder, which reproduces it and does
// the arithmetic his assets/js/quote.js did — against GET /products rather
// than the price literal in that script.

import React from "react";
import DsQuotePage from "../pages/DsQuotePage.jsx";
import DsQuoteBuilder from "../DsQuoteBuilder.jsx";

export default function DsQuote() {
  return <DsQuotePage d={{ builder: <DsQuoteBuilder /> }} />;
}
