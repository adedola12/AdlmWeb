// Profile photos must be a square photo of a human face (R08).
//
// The brief called this an existing check; there was none — only the hint
// "square works best" under the upload field. This makes it real, on the
// server, where it cannot be skipped:
//
//   * the URL must be an image we signed into our own avatars folder
//     (never an arbitrary link stored as someone's face);
//   * Cloudinary, which already stores the photo, reports its real width and
//     height and the faces it detects (Admin API `resource` with faces:true);
//   * square means width and height within 2% of each other, at least 200px.
//
// Every refusal says exactly what is wrong and how to fix it.

export const AVATAR_MIN_PX = 200;
export const AVATAR_SQUARE_TOLERANCE = 0.02;

export const AVATAR_ERRORS = {
  notOurs:
    "That photo was not uploaded through ADLM. Choose the photo again with the Upload button.",
  notSquare: (w, h) =>
    `Your profile photo must be square. This one is ${w} × ${h} pixels. Crop it so the width and height are the same, then upload it again.`,
  tooSmall: (w, h) =>
    `Your profile photo must be at least ${AVATAR_MIN_PX} × ${AVATAR_MIN_PX} pixels. This one is ${w} × ${h}.`,
  noFace:
    "We could not find a face in this photo. Use a clear, well-lit photo of your face, looking at the camera.",
  unchecked:
    "We could not check this photo just now, so it was not saved. Please try again in a minute.",
};

/**
 * The Cloudinary public id of an avatar URL, or null when the URL is not an
 * image upload in our cloud and avatars folder.
 *   https://res.cloudinary.com/<cloud>/image/upload/v169/adlm/avatars/abc.jpg
 *   → adlm/avatars/abc
 */
export function avatarPublicId(url, { cloudName, folder = "adlm/avatars" } = {}) {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  // [cloud, "image", "upload", ...transforms/version..., ...folder, file]
  if (parts[0] !== cloudName || parts[1] !== "image" || parts[2] !== "upload") return null;
  const rest = parts.slice(3).filter((p) => !/^v\d+$/.test(p));
  const path = rest.join("/");
  if (!path.startsWith(`${folder}/`)) return null;
  return decodeURIComponent(path.replace(/\.[a-z0-9]+$/i, ""));
}

/**
 * Judge an uploaded photo from Cloudinary's own description of it.
 * @returns {string|null} the refusal message, or null when it passes
 */
export function judgeAvatar({ width, height, faces }) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (Math.min(w, h) < AVATAR_MIN_PX) return AVATAR_ERRORS.tooSmall(w, h);
  if (Math.abs(w - h) / Math.max(w, h) > AVATAR_SQUARE_TOLERANCE) {
    return AVATAR_ERRORS.notSquare(w, h);
  }
  if (!Array.isArray(faces) || faces.length === 0) return AVATAR_ERRORS.noFace;
  return null;
}

/**
 * Check an avatar URL end to end. `lookup(publicId)` returns Cloudinary's
 * resource description ({ width, height, faces }); injected so it can be
 * tested without the network.
 * @returns {Promise<string|null>} the refusal message, or null when it passes
 */
export async function checkAvatarUrl(url, { cloudName, lookup }) {
  const publicId = avatarPublicId(url, { cloudName });
  if (!publicId) return AVATAR_ERRORS.notOurs;
  let info;
  try {
    info = await lookup(publicId);
  } catch {
    return AVATAR_ERRORS.unchecked;
  }
  return judgeAvatar(info || {});
}
