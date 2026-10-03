// Where each public download is served from (R15, 2026-09-18).
//
// Every download comes from our own storage first: the private file store
// (util/fileStore.js: S3 once FILES_BUCKET is set, else the private R2
// installers bucket), at one fixed key per download, handed out as a
// short-lived signed URL. The Admin setting (a link pasted or uploaded in Site
// Settings) is the fail-safe while a file has not been uploaded to its key, so
// a button never goes dead. A Google Drive link in that setting still works,
// turned into Drive's direct-download form rather than its preview page.
//
// Upload a file to its key with scripts/upload-download.mjs.
//
// A `gated` download (the Installer Hub, R3) is only for some accounts, so its
// link, stored or fail-safe, comes back only when the caller passes
// `allowed: true` after checking the account. Anyone else gets the source but
// an empty url, so a caller that forgets the check leaks nothing.

import { headFile, presignDownload } from "./fileStore.js";

export const DOWNLOADS = {
  android: {
    key: "apps/adlm-android.apk",
    fileName: "ADLM-Studio.apk",
    setting: "mobileAppUrl",
  },
  "installer-hub": {
    key: "installers/ADLM-Installer-Hub-Setup.exe",
    fileName: "ADLM-Installer-Hub-Setup.exe",
    setting: "installerHubUrl",
    // Paid accounts only, so it is served as a signed link to private storage.
    // Builds used to be written to this PUBLIC prefix and the URL pasted into
    // the setting; such a link skips the licence check and must never be
    // served, however it got there.
    publicPrefix: "adlm/installer-hub",
    gated: true,
  },
};

/**
 * True when `url` is a public copy under a download's old public prefix.
 *
 * Lives here rather than in hubStorage.js because hubStorage imports DOWNLOADS
 * from this module, and the reverse import would close the circle — HUB_KEY is
 * read at module load, so a cycle would not merely be untidy, it would be
 * undefined.
 */
export function isPublicHubCopy(url, prefix = DOWNLOADS["installer-hub"].publicPrefix) {
  const s = String(url || "").trim();
  if (!s || !prefix) return false;
  let path = s;
  try {
    path = decodeURIComponent(new URL(s).pathname);
  } catch {
    /* not a URL: check the raw text */
  }
  return new RegExp(`(^|/)${prefix}/`, "i").test(path);
}

/** The file id of a Google Drive link, or "" for anything else. */
export function driveFileId(url) {
  const s = String(url || "");
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(s)) return "";
  const m = s.match(/\/file\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : "";
}

/** Drive's direct-download form of a Drive link; other links unchanged. */
export function directLink(url) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : String(url || "");
}

// A HEAD per request would put a storage round trip on every dashboard load;
// whether a file sits at its key changes once per release.
const present = new Map();
const PRESENT_TTL_MS = 5 * 60 * 1000;

/** Drop the cached answer for `key`, so a fresh upload is served at once. */
export function forgetStored(key) {
  present.delete(key);
}

async function storedAt(key, store, now) {
  const hit = present.get(key);
  if (hit && now - hit.at < PRESENT_TTL_MS) return hit.ok;
  let ok = false;
  try {
    ok = !!(await store.headFile({ key }));
  } catch {
    ok = false; // storage not configured or unreachable: fall back, never fail
  }
  present.set(key, { ok, at: now });
  return ok;
}

/**
 * @param {keyof DOWNLOADS} kind
 * @param {object} opts
 * @param {object} [opts.settings]   the global Setting document
 * @param {number} [opts.expiresIn]  seconds a signed URL lives
 * @param {boolean} [opts.allowed]   required for a gated download to carry a url
 * @returns {Promise<{ url: string, source: "store"|"setting"|"drive"|"none", fileName: string }>}
 */
export async function resolveDownload(kind, { settings, expiresIn = 300, allowed = false, store = { headFile, presignDownload }, now = Date.now() } = {}) {
  const d = DOWNLOADS[kind];
  if (!d) throw new Error(`Unknown download: ${kind}`);
  const locked = d.gated && allowed !== true;
  if (await storedAt(d.key, store, now)) {
    if (locked) return { url: "", source: "store", fileName: d.fileName };
    try {
      const url = await store.presignDownload({ key: d.key, fileName: d.fileName, expiresIn });
      return { url, source: "store", fileName: d.fileName };
    } catch {
      /* fall through to the setting */
    }
  }
  const configured = String(settings?.[d.setting] || "").trim();
  if (!configured) return { url: "", source: "none", fileName: d.fileName };
  // A LEGACY PUBLIC COPY IS NOT A FALLBACK, IT IS THE HOLE.
  //
  // The Hub is paid-accounts-only, handed out as a short-lived signed link to
  // private storage. Before that was tightened, each build was written to the
  // PUBLIC prefix adlm/installer-hub and its URL pasted into the setting —
  // anyone holding that link downloads the Hub with no licence check.
  // isPublicHubCopy() has refused new ones since, but only on the way IN, so a
  // value saved before that kept being served for ever: on 30 Sep 2026 this
  // path was still handing out
  // pub-….r2.dev/adlm/installer-hub/…-ADLMInstallerHub-v2.0.0.zip — public, and
  // a .zip while the gate told the customer it was ADLM-Installer-Hub-Setup.exe.
  //
  // Refusing it here reads as "no build available", which is true: there is no
  // build that may be served. The admin screen says what to upload.
  if (d.publicPrefix && isPublicHubCopy(configured, d.publicPrefix)) {
    return { url: "", source: "none", fileName: d.fileName, refused: "public-copy" };
  }
  return {
    url: locked ? "" : directLink(configured),
    source: driveFileId(configured) ? "drive" : "setting",
    fileName: d.fileName,
  };
}

/** For tests: forget what was seen in storage. */
export function _resetDownloadCache() {
  present.clear();
}
