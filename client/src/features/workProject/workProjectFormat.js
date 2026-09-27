// The project page's formatters, in one place.
//
// The Overview tab had these inline. The Bill tab needs the same ones, and two
// copies of a money formatter is how two tabs end up printing the same figure
// differently — which on a bill is not a cosmetic problem.
//
// Components live next door in workProjectBits.jsx, because a file that exports
// a component may export nothing else (react-refresh/only-export-components).

import { EN_DASH, safeNum } from "../projects/lib/projectTotals.js";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export const money = (n) => NGN.format(safeNum(n));

/** His compact figure for the section bars (work-proj.js:34). */
export function compact(n) {
  const v = safeNum(n);
  if (v >= 1e9) return `₦${(v / 1e9).toFixed(1)}b`;
  if (v >= 1e6) return `₦${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `₦${Math.round(v / 1e3)}k`;
  return money(v);
}

/** A quantity: his num(). Kept plain so 0.35 m³ of concrete survives. */
export function num(n) {
  const v = safeNum(n);
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-NG", { maximumFractionDigits: 2 });
  return String(Number(v.toFixed(3)));
}

/**
 * His initials() (work-proj.js:119), exactly as the Overview tab had it —
 * including the "?" for an avatar with no name behind it.
 */
export const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "?";

// Our house placeholder, re-exported rather than redeclared — projectTotals.js
// has owned it since the restyle, and a second copy of a character is exactly
// how an em-dash sweep broke fourteen of them in the 15 September release.
//
// His design prints an EM dash for an absent figure. The en dash is the one
// deliberate departure from his markup on this page.
export { EN_DASH };
