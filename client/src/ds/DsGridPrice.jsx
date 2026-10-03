// The monthly figure on a /products card, read from the live catalogue.
//
// WHY THIS EXISTS
//
// ds/pages/DsProducts.jsx is a verbatim port of his products.html, so its six
// cards carry the prices he typed into the markup. That was fine while the page
// was a design; it is not fine now that it is the page customers land on, next
// to a Purchase button that charges whatever the catalogue says.
//
// useProductPricing already solves this for the individual product pages
// (DsQuiv, DsHeron, DsMep, DsRateGen, DsTimePro). Its own comment records what
// happens when markup and catalogue drift: his MEP page said "No install fee"
// while the catalogue charged NGN 20,000, and the customer met that only at
// checkout. The grid had the same exposure across five products at once.
//
// THE FALLBACK IS HIS FIGURE, DELIBERATELY
//
// Same contract as useProductPricing: the design's number renders until the
// fetch lands, and stays if it fails. A price card must never be blank or show
// a spinner — an empty price reads as "free" or as broken, and both cost more
// than a figure that is a few days stale.

import React from "react";
import useProductPricing from "./useProductPricing.js";

/**
 * @param {object}  props
 * @param {string}  props.productKey  catalogue key: revit, planswift, rategen,
 *                                    mep, qs-takeoff, civil3d
 * @param {number}  props.fallback    his monthly figure, in naira
 */
export default function DsGridPrice({ productKey, fallback }) {
  // yearly/install are not shown on a grid card; they are supplied because the
  // hook needs a complete fallback shape, and derived from the monthly figure
  // rather than invented — a wrong yearly here would never be seen, but a
  // NaN would reach the saving arithmetic inside the hook.
  const { monthly } = useProductPricing(productKey, {
    monthly: fallback,
    yearly: fallback * 12,
    install: 0,
  });
  return <b>{monthly}</b>;
}
