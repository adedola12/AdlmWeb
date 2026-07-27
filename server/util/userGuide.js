// Installer Hub user guide (PDF).
//
// The guide ships with the frontend at client/public/docs, so it is always
// reachable at <site>/docs/ADLM-Installer-Hub-User-Guide.pdf without any admin
// configuration. Admins can override the link (e.g. a Cloudflare R2 copy) from
// Admin → Settings → Installer Hub; that value wins when it is set.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const USER_GUIDE_PATH = "/docs/ADLM-Installer-Hub-User-Guide.pdf";
export const USER_GUIDE_FILENAME = "ADLM-Installer-Hub-User-Guide.pdf";

const WEB_URL =
  String(
    process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "",
  ).trim() || "https://adlmstudio.net";

export function resolveUserGuideUrl(configuredUrl) {
  const configured = String(configuredUrl || "").trim();
  if (configured) return configured;
  return `${WEB_URL.replace(/\/+$/, "")}${USER_GUIDE_PATH}`;
}

// Mail attachment. The server keeps its own copy under server/assets so the
// guide can be attached without reaching across to the separately-deployed
// frontend. Cached after the first read (~2.4 MB) and never fatal: if the file
// is missing the email still goes out with the download link.
const GUIDE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  USER_GUIDE_FILENAME,
);

let cachedAttachment;

export function getUserGuideAttachment() {
  if (cachedAttachment !== undefined) return cachedAttachment;
  try {
    cachedAttachment = {
      filename: USER_GUIDE_FILENAME,
      content: fs.readFileSync(GUIDE_FILE).toString("base64"),
    };
  } catch (e) {
    console.warn("[userGuide] guide PDF not attachable:", e?.message || e);
    cachedAttachment = null;
  }
  return cachedAttachment;
}
