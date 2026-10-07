// server/util/releaseVersion.js
//
// Is this deployment a newer version than the last one?
//
// The answer decides whether several hundred customers get an email, so it is
// deliberately strict: anything that cannot be read as a version compares as
// "unknown", and unknown never sends. A release script that PUTs "latest" or a
// date by mistake should produce silence, not a mailshot.
//
// Semver-shaped, not semver-exact. The products ship "3.1.11", "2.9.0",
// "1.8.3", and HERON once shipped "2.5", so a missing part reads as zero
// ("2.5" equals "2.5.0"), a leading "v" is ignored, and any number of numeric
// parts is allowed. A pre-release tag sorts BELOW its release ("3.2.0-beta.1"
// is older than "3.2.0"), as semver says, and build metadata ("+abc") is
// ignored entirely.

/** Trimmed, without a leading "v" or "version". Empty for nothing. */
export function normalizeVersion(v) {
  return String(v ?? "")
    .trim()
    .replace(/^(?:version\s*|v(?=\d))/i, "")
    .trim();
}

/**
 * { parts: [3, 1, 11], pre: ["beta", 1] } or null when it is not a version.
 */
export function parseVersion(v) {
  const s = normalizeVersion(v).replace(/\+.*$/, "");
  const m = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(s);
  if (!m) return null;
  const parts = m[1].split(".").map((n) => Number(n));
  if (parts.some((n) => !Number.isSafeInteger(n))) return null;
  const pre = m[2]
    ? m[2].split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p.toLowerCase()))
    : [];
  return { parts, pre };
}

/**
 * -1, 0 or 1 like a sort comparator, or null when either side is not a
 * version. Callers must treat null as "do not send".
 */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;

  const len = Math.max(x.parts.length, y.parts.length);
  for (let i = 0; i < len; i += 1) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }

  // Same numbers. A release outranks any of its own pre-releases.
  if (!x.pre.length && !y.pre.length) return 0;
  if (!x.pre.length) return 1;
  if (!y.pre.length) return -1;

  const plen = Math.max(x.pre.length, y.pre.length);
  for (let i = 0; i < plen; i += 1) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1; // fewer identifiers sorts first
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = typeof p === "number";
    const qn = typeof q === "number";
    if (pn && qn) return p < q ? -1 : 1;
    if (pn) return -1; // numeric identifiers sort below alphanumeric ones
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** The same version, however it was written ("v3.1" and "3.1.0" match). */
export const sameVersion = (a, b) => compareVersions(a, b) === 0;

/**
 * One spelling per version, for anything that has to be unique per version
 * (the release notice's key). "3.2", "v3.2.0", "3.2.0.0" and "3.2.0+build.7"
 * are all "3.2.0": at least three numeric parts, zeros past the third dropped,
 * leading zeros read as numbers, a pre-release tag kept the way
 * compareVersions reads it (lower case, "beta.01" as "beta.1"), build metadata
 * dropped. Two versions get the same canonical form exactly when
 * compareVersions calls them equal. "" when it is not a version.
 */
export function canonicalVersion(v) {
  const p = parseVersion(v);
  if (!p) return "";
  const parts = [...p.parts];
  while (parts.length > 3 && parts[parts.length - 1] === 0) parts.pop();
  while (parts.length < 3) parts.push(0);
  return parts.join(".") + (p.pre.length ? `-${p.pre.join(".")}` : "");
}

/** The highest of a list, ignoring anything that is not a version. "" when none. */
export function maxVersion(list = []) {
  let best = "";
  for (const v of list) {
    if (!parseVersion(v)) continue;
    if (!best || compareVersions(v, best) > 0) best = normalizeVersion(v);
  }
  return best;
}
