// The version and build each product page states in its hero.
//
// His pages said "Latest v3.1.7", "v2.9.1" and so on: patch numbers typed into
// the markup. Under the owner's rule of 6/7 Oct 2026 every ADLM product keeps
// its launch version, written to two digits (QUIV 4.0, HERON 3.0, RateGen 3.0,
// SERVIQ 2.0, Time Pro 1.0), and a release changes only the build,
// Major.Minor.YYMM.N. So the hero reads "QUIV 4.0, build 4.0.2610.1".
//
// The build is never typed out. Each product records its version, the month
// of its latest release and which release that was within the month, and
// buildNumber() assembles the rest, so a build cannot be mistyped or drift
// from the version it belongs to. When a product ships, change `released`
// (and `n` if it is not the first that month) and every page follows.

export const PRODUCT_BUILDS = {
  quiv: { name: "QUIV", version: "4.0", released: "2026-10", n: 1 },
  heron: { name: "HERON", version: "3.0", released: "2026-10", n: 1 },
  rategen: { name: "RateGen", version: "3.0", released: "2026-10", n: 2 },
  mep: { name: "SERVIQ", version: "2.0", released: "2026-10", n: 1 },
  timepro: { name: "Time Pro", version: "1.0", released: "2026-10", n: 1 },
};

/**
 * Major.Minor.YYMM.N from a version, a "YYYY-MM" release month and the
 * release's number within that month: ("4.0", "2026-10", 1) -> "4.0.2610.1".
 */
export function buildNumber(version, released, n = 1) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(released || ""));
  if (!version || !m || !(n >= 1)) return "";
  return `${version}.${m[1].slice(2)}${m[2]}.${Math.trunc(n)}`;
}

/** "QUIV 4.0, build 4.0.2610.1", or the version alone if no build is known. */
export function latestLabel(slug) {
  const p = PRODUCT_BUILDS[slug];
  if (!p) return "";
  if (!p.version) return p.name;
  const build = buildNumber(p.version, p.released, p.n);
  return build ? `${p.name} ${p.version}, build ${build}` : `${p.name} ${p.version}`;
}

export default PRODUCT_BUILDS;
