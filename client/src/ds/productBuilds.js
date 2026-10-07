// The version and build each product page states in its hero.
//
// His pages said "Latest v3.1.7", "v2.9.1" and so on: patch numbers typed into
// the markup. Under the owner's rule of 6/7 Oct 2026 every ADLM product keeps
// its launch version, written to two digits (QUIV 4.0, HERON 3.0, RateGen 3.0,
// SERVIQ 2.0), and a release changes only the build, Major.Minor.YYMM.N. So the
// hero reads "QUIV 4.0, build 4.0.2610.1", and this table is the one place to
// move when a build ships.
//
// `build` is left out where no build under the new scheme has been confirmed,
// and the line then states the version alone. Time Pro has no frozen version
// on record yet, so its line names no number at all rather than a guessed one.

export const PRODUCT_BUILDS = {
  quiv: { name: "QUIV", version: "4.0", build: "4.0.2610.1" },
  heron: { name: "HERON", version: "3.0", build: "3.0.2610.1" },
  rategen: { name: "RateGen", version: "3.0", build: "3.0.2610.1" },
  mep: { name: "SERVIQ", version: "2.0" },
  timepro: { name: "Time Pro" },
};

/** "QUIV 4.0, build 4.0.2610.1" / "SERVIQ 2.0" / "Time Pro" */
export function latestLabel(slug) {
  const p = PRODUCT_BUILDS[slug];
  if (!p) return "";
  if (!p.version) return p.name;
  return p.build ? `${p.name} ${p.version}, build ${p.build}` : `${p.name} ${p.version}`;
}

export default PRODUCT_BUILDS;
