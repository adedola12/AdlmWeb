// util/username.js (new file)
export function deriveUsernameFromEmail(email) {
  if (!email) return "";
  const local = String(email).split("@")[0];
  // split into letters/others then digits at the end
  const m = local.match(/^([A-Za-z._-]*?)(\d+)$/); // letters (and . _ -) + trailing digits
  if (!m) return local; // no trailing digits -> keep as-is
  const [, name, digits] = m;
  if (digits.length <= 2) return name + digits;
  return name + "*".repeat(digits.length - 2) + digits.slice(-2);
}

export async function ensureUniqueUsername(base, UserModel) {
  let candidate = base || "user";
  let n = 0;
  // try base, then base-xx until unique
  while (await UserModel.exists({ username: candidate })) {
    const suffix = Math.floor(Math.random() * 90 + 10); // 2 digits
    candidate = `${base}-${suffix}-${n++}`;
  }
  return candidate;
}
