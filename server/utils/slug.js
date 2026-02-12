// server/utils/slug.js
export function slugify(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function ensureUniqueSlug(Model, doc, title) {
  if (doc.slug) return doc.slug;

  const base = slugify(title) || "training";
  const tail = String(doc._id || "").slice(-8); // stable + unique-ish
  let candidate = tail ? `${base}-${tail}` : base;

  let i = 2;
  // ensure uniqueness
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Model.findOne({ slug: candidate })
      .select("_id")
      .lean();

    if (!exists || String(exists._id) === String(doc._id)) break;
    candidate = `${base}-${tail}-${i++}`;
  }

  doc.slug = candidate;
  return candidate;
}
