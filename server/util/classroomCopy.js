// Rewrites the Google Classroom references left in product and course copy.
//
// The code stopped linking out to Google Classroom, but the sales copy did
// not: feature bullets like "100% Online (Google Classroom)" live in
// Product.features in the database, not in the repo, so they still render on
// the product page after the integration is gone.
//
// These functions are pure so the ruleset can be tested without a database;
// scripts/retire-classroom-product-copy.mjs drives them over the collections.
//
// The design rule throughout: never guess. A line the ruleset cannot rewrite
// into something Classroom-free is returned untouched and reported, because a
// mangled sales bullet on a live product page is worse than one a human still
// has to edit.

export const MENTIONS_CLASSROOM = /classroom/i;

// A bullet that exists only to advertise Classroom access carries nothing once
// Classroom is gone, so it is dropped rather than reworded.
export const DROP_BULLET =
  /^\s*(?:full\s+|lifetime\s+|unlimited\s+)?(?:access\s+to\s+(?:the\s+)?)?(?:google\s+)?classroom(?:\s+access)?\s*$/i;

// Ordered — the first rule that matches a fragment wins. Each is written to be
// a no-op on text it has already rewritten, so the whole set is idempotent.
const RULES = [
  // "100% Online (Google Classroom)" — the shape the admin placeholder used to
  // suggest, so it is the one most likely to be sitting in the data.
  [/\((?:via\s+|on\s+|through\s+|in\s+)?google\s+classroom\)/gi, "(self-paced)"],
  [/\((?:via\s+|on\s+|through\s+|in\s+)?classroom\)/gi, "(self-paced)"],

  // "delivered via/on/through Google Classroom"
  [
    /\s+(?:via|on|through|in)\s+(?:the\s+)?google\s+classroom\b/gi,
    " on the ADLM Studio platform",
  ],

  // Bare mentions left over after the above.
  [/\bgoogle\s+classroom\b/gi, "the ADLM Studio platform"],
];

export function rewriteLine(line) {
  let out = String(line);
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
  }
  // Tidy the double spaces a substitution can leave behind.
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Rewrite a feature bullet list.
 *
 * Returns { features, unresolved, changed } — the new list, the bullets that
 * still mention Classroom afterwards (left in the list verbatim, for a human
 * to handle), and whether anything actually moved.
 */
export function rewriteFeatures(features) {
  const before = (features || []).map(String);
  const out = [];
  const unresolved = [];

  for (const line of before) {
    if (!MENTIONS_CLASSROOM.test(line)) {
      out.push(line);
      continue;
    }
    if (DROP_BULLET.test(line)) continue; // the bullet was only about Classroom

    const next = rewriteLine(line);
    if (MENTIONS_CLASSROOM.test(next)) {
      unresolved.push(line);
      out.push(line); // leave it alone rather than guess
      continue;
    }
    out.push(next);
  }

  return {
    features: out,
    unresolved,
    changed: JSON.stringify(out) !== JSON.stringify(before),
  };
}

/**
 * Rewrite a free-text field (blurb, description).
 *
 * Returns { text, unresolved, changed }. When the rules cannot clear the
 * mention, the original text comes back unchanged and `unresolved` holds it.
 */
export function rewriteText(text) {
  const value = String(text || "");
  if (!MENTIONS_CLASSROOM.test(value)) {
    return { text: value, unresolved: null, changed: false };
  }

  const next = rewriteLine(value);
  if (MENTIONS_CLASSROOM.test(next)) {
    return { text: value, unresolved: value, changed: false };
  }
  return { text: next, unresolved: null, changed: next !== value };
}
