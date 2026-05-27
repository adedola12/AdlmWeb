// Fuzzy-match utility for auto-linking MS Project tasks to BoQ items.
//
// Use-case: a user imports a 300-task .mpp file into a project whose BoQ
// has 500 items. Manually linking every task to its corresponding BoQ
// row(s) is infeasible. This module scores each task name against the
// catalogue of BoQ items (measured + prelim + PC + variations) and
// returns the best-confidence match(es), so the importer can attach them
// as `linkedBoqIdentities` automatically.
//
// Algorithm — token-set scoring:
//   1. Tokenise both strings: lowercase, strip punctuation, drop short
//      tokens and stopwords.
//   2. Compute three scores and take the max:
//        • Jaccard       = |A ∩ B| / |A ∪ B|  (set overlap)
//        • Containment   = |A ∩ B| / min(|A|, |B|)  (one is subset of other)
//        • Sorted token  = exact-match of sorted token strings = 1.0 or 0
//   3. Bonus for measured items (heaviest weight in cost terms).
//
// Result is a normalised score in [0, 1]. The caller decides a threshold;
// 0.45 is a reasonable default — generous enough to auto-link common
// substring matches like "Excavation" ↔ "Excavation for foundation",
// strict enough to avoid linking "Roofing" to "Concrete works".

// English construction-jargon stopwords. Deliberately small — we want
// most words to be informative.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at",
  "by", "with", "from", "as", "is", "are", "be", "this", "that",
  "all", "any", "etc", "etc.",
  // Construction filler that adds no discriminating power:
  "works", "work", "item", "items", "general",
]);

function tokenize(value) {
  if (!value) return [];
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ") // strip punctuation
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function containment(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? inter / minSize : 0;
}

function sortedTokenExact(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const a = [...tokensA].sort().join(" ");
  const b = [...tokensB].sort().join(" ");
  return a === b ? 1 : 0;
}

// Build a normalised string key the learning store can use as a stable
// match key — same as tokenize → sort → join. Insensitive to word order
// and punctuation so "Setting Out" and "OUT, setting" land in the same
// bucket.
export function normalizeTaskName(name) {
  const tokens = tokenize(name);
  if (tokens.length === 0) return String(name || "").toLowerCase().trim();
  return [...tokens].sort().join(" ");
}

// Single pairwise score. Returns 0-1.
export function similarityScore(taskName, candidateText) {
  const tokensA = tokenize(taskName);
  const tokensB = tokenize(candidateText);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const j = jaccard(setA, setB);
  const c = containment(setA, setB);
  const s = sortedTokenExact(tokensA, tokensB);
  // Weight: containment matters most (catches "Setting Out" inside
  // longer descriptions), Jaccard balances false positives, sorted-token
  // exact match is a tie-breaker for perfect rewordings.
  return Math.max(s, 0.5 * j + 0.5 * c);
}

// Score `taskName` against an array of candidate items. Each candidate
// must have at least { identity, description, kind?, category? }.
// Returns ranked array of { identity, score, kind, description }, best
// first. Caller applies a threshold.
export function rankCandidates(taskName, candidates, opts = {}) {
  const { threshold = 0.45, maxResults = 5 } = opts;
  const ranked = [];
  for (const c of candidates) {
    // Compose the search text from description + extra context (category,
    // trade, takeoffLine) so partial matches against any of those count.
    const text = [c.description, c.category, c.trade, c.takeoffLine]
      .filter(Boolean)
      .join(" ");
    const score = similarityScore(taskName, text);
    if (score >= threshold) {
      ranked.push({
        identity: c.identity,
        score,
        kind: c.kind || "measured",
        description: c.description || "",
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, maxResults);
}

// Pick the single best match, or null if no candidate clears the
// threshold. The score is also returned so the caller can decide how
// confidently to auto-link versus surface for user review.
export function bestMatch(taskName, candidates, opts = {}) {
  const ranked = rankCandidates(taskName, candidates, { ...opts, maxResults: 1 });
  return ranked[0] || null;
}
