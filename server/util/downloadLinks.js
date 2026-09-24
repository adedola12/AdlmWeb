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
  },
};

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
 * @returns {Promise<{ url: string, source: "store"|"setting"|"drive"|"none", fileName: string }>}
 */
export async function resolveDownload(kind, { settings, expiresIn = 300, store = { headFile, presignDownload }, now = Date.now() } = {}) {
  const d = DOWNLOADS[kind];
  if (!d) throw new Error(`Unknown download: ${kind}`);
  if (await storedAt(d.key, store, now)) {
    try {
      const url = await store.presignDownload({ key: d.key, fileName: d.fileName, expiresIn });
      return { url, source: "store", fileName: d.fileName };
    } catch {
      /* fall through to the setting */
    }
  }
  const configured = String(settings?.[d.setting] || "").trim();
  if (!configured) return { url: "", source: "none", fileName: d.fileName };
  return {
    url: directLink(configured),
    source: driveFileId(configured) ? "drive" : "setting",
    fileName: d.fileName,
  };
}

/** For tests: forget what was seen in storage. */
export function _resetDownloadCache() {
  present.clear();
}
