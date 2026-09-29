// Where an Installer Hub build is stored (R3 follow-up, 2026-09-27).
//
// The Hub is for paid accounts only, handed out by /me/downloads/installer-hub
// as a short-lived signed link to the private file store (util/fileStore.js)
// at DOWNLOADS["installer-hub"].key (util/downloadLinks.js). Until this
// change, Admin → Site Settings and scripts/upload-hub-release.mjs wrote each
// new build to the PUBLIC R2 prefix adlm/installer-hub (and the Admin fallback
// to Cloudinary's adlm/installer-hub folder), then pasted that public URL into
// Setting.installerHubUrl. Anyone holding the URL skipped the gate.
//
// Now every Hub upload goes to the private store at the one fixed key, and the
// stored reference is that key, never a public URL. Pure, so it is tested
// without storage or a database.

import { DOWNLOADS } from "./downloadLinks.js";

/** The old public prefix, in R2 and in Cloudinary. Nothing new is written here. */
export const HUB_PUBLIC_PREFIX = "adlm/installer-hub";

/** The private-store key the gate serves the Hub from. */
export const HUB_KEY = DOWNLOADS["installer-hub"].key;

/** Signed into the PUT; the browser (or script) must send exactly this. */
export const HUB_CONTENT_TYPE = "application/octet-stream";

/** One PUT to S3 or R2 tops out at 5 GiB. */
export const HUB_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Why this file cannot be the Hub download, or null when it can. The gate
 * saves it as DOWNLOADS["installer-hub"].fileName (…Setup.exe), so anything
 * but an .exe would reach the customer under the wrong extension.
 */
export function hubUploadProblem({ filename, size } = {}) {
  const name = String(filename || "").trim();
  if (!name) return "filename is required";
  if (!/\.exe$/i.test(name)) {
    return `Choose the Installer Hub setup .exe: it is saved to customers as ${DOWNLOADS["installer-hub"].fileName}.`;
  }
  const n = Number(size || 0);
  if (n && n > HUB_MAX_BYTES) return "That file is over the 5 GB upload limit.";
  return null;
}

/**
 * True for a file name that reads as an Installer Hub build. The general
 * installer upload (course software, AdminCourses) writes to public storage,
 * so it refuses these and points at Site Settings instead.
 */
export function looksLikeHubInstaller(filename) {
  return /installer[\s._-]*hub/i.test(String(filename || ""));
}

export const PUBLIC_HUB_COPY_REFUSED =
  "That link is a public copy of the Installer Hub, which skips the paid-licence check. Use Upload installer instead: it puts the Hub in private storage and customers get a signed link.";

/**
 * True when `url` is a public copy under the old Hub prefix (R2's public
 * bucket or Cloudinary). Such a link skips the paid gate, so it must not be
 * saved as the Hub's download reference.
 */
export function isPublicHubCopy(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  let path = s;
  try {
    path = decodeURIComponent(new URL(s).pathname);
  } catch {
    /* not a URL: check the raw text */
  }
  return new RegExp(`(^|/)${HUB_PUBLIC_PREFIX}/`, "i").test(path);
}
