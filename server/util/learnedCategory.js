// Self-learning category model.
//
// Each time a user explicitly picks a category for an item, we extract the
// significant tokens from that item's text (description / takeoffLine /
// materialName / type) and increment the (token → category) weight in the
// CategoryFeedback collection. Next time we see an item with overlapping
// tokens (and no explicit category yet), the highest-weight learned category
// wins over the rule-based default.

import { CategoryFeedback } from "../models/CategoryFeedback.js";

const STOPWORDS = new Set([
  "the","a","an","and","or","of","for","to","in","on","at","by","with",
  "from","as","is","are","be","not","this","that","these","those","item",
  "items","general","generally","all","any","each","one","two","three",
  "x","mm","cm","m","m2","m3","kg","ton","nr","no","unit","units","x",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function itemTokens(item) {
  const text = [
    item?.description,
    item?.takeoffLine,
    item?.materialName,
    item?.type,
  ]
    .map((v) => String(v || ""))
    .join(" ");
  return Array.from(new Set(tokenize(text)));
}

// Record one user's classification choice for an item. Increments per-token
// weights. `kind` defaults to "category" for backward compat; pass "trade"
// when learning from trade (work-section) overrides.
// Best-effort: never throws (a learning failure shouldn't break a save).
export async function recordCategoryFeedback({
  userId,
  productKey,
  item,
  category,
  kind = "category",
}) {
  try {
    if (!userId || !category) return;
    const tokens = itemTokens(item);
    if (!tokens.length) return;
    const productKeyNorm = String(productKey || "").toLowerCase();
    const kindNorm = String(kind || "category").toLowerCase();
    await Promise.all(
      tokens.map((token) =>
        CategoryFeedback.updateOne(
          { userId, productKey: productKeyNorm, kind: kindNorm, token, category },
          { $inc: { weight: 1 } },
          { upsert: true },
        ),
      ),
    );
  } catch (err) {
    console.warn("recordCategoryFeedback failed:", err?.message || err);
  }
}

// Returns a map from itemIndex -> category for items where the learned
// model has a clear preference. Items not in the map should fall back to
// the rule-based default.
// `kind` defaults to "category"; pass "trade" to look up learned trade
// assignments instead.
export async function applyLearnedCategoriesToItems({
  userId,
  productKey,
  items,
  itemsWithoutExplicitCategory, // Set<number> of indices to consider
  kind = "category",
}) {
  const result = new Map();
  if (!userId || !Array.isArray(items) || !items.length) return result;
  if (!itemsWithoutExplicitCategory?.size) return result;

  try {
    const allTokens = new Set();
    const itemTokenList = [];
    for (let i = 0; i < items.length; i++) {
      const toks = itemsWithoutExplicitCategory.has(i) ? itemTokens(items[i]) : [];
      itemTokenList.push(toks);
      for (const t of toks) allTokens.add(t);
    }
    if (!allTokens.size) return result;

    const productKeyNorm = String(productKey || "").toLowerCase();
    const kindNorm = String(kind || "category").toLowerCase();

    // Pull this user's feedback for the relevant tokens. Prefer entries
    // for the same product, but also consider global (productKey: "") rows.
    // For backward compat, rows missing `kind` are treated as "category".
    const kindFilter =
      kindNorm === "category"
        ? { $in: ["category", null, ""] }
        : kindNorm;
    const rows = await CategoryFeedback.find({
      userId,
      productKey: { $in: [productKeyNorm, ""] },
      kind: kindFilter,
      token: { $in: [...allTokens] },
    }).lean();
    if (!rows.length) return result;

    // Index: token -> { category -> weight }
    const tokenIndex = new Map();
    for (const r of rows) {
      const m = tokenIndex.get(r.token) || new Map();
      const prevW = m.get(r.category) || 0;
      // Same-product rows count double — prefer specific over global learning.
      const bonus = r.productKey === productKeyNorm ? 2 : 1;
      m.set(r.category, prevW + r.weight * bonus);
      tokenIndex.set(r.token, m);
    }

    for (let i = 0; i < items.length; i++) {
      if (!itemsWithoutExplicitCategory.has(i)) continue;
      const toks = itemTokenList[i];
      if (!toks.length) continue;
      const tally = new Map();
      for (const t of toks) {
        const m = tokenIndex.get(t);
        if (!m) continue;
        for (const [cat, w] of m.entries()) {
          tally.set(cat, (tally.get(cat) || 0) + w);
        }
      }
      if (!tally.size) continue;
      // Pick the highest-weighted category if it clearly beats the rest.
      const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const [topCat, topW] = ranked[0];
      // Lightweight confidence guard: at least weight 2, and more than 1.5x
      // the runner-up if any. Avoids one-off categorizations becoming sticky.
      const runnerUp = ranked[1]?.[1] || 0;
      if (topW < 2) continue;
      if (runnerUp && topW < runnerUp * 1.5) continue;
      result.set(i, topCat);
    }
  } catch (err) {
    console.warn("applyLearnedCategoriesToItems failed:", err?.message || err);
  }
  return result;
}
