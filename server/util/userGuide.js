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
//
// Two layouts. In the source tree this module is server/util/userGuide.js and
// the PDF is server/assets/<file>, one level up. On Lambda the whole API is
// ONE bundled file, /var/task/index.mjs, so import.meta.url is the bundle and
// "one level up" is /var/assets, which does not exist. The CDK stack
// (infra/lib/adlm-api-stack.ts, commandHooks.afterBundling) copies the PDF to
// assets/<file> beside the bundle, so the bundle looks in its own directory.
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const USER_GUIDE_CANDIDATES = [
  path.join(HERE, "..", "assets", USER_GUIDE_FILENAME), // source tree
  path.join(HERE, "assets", USER_GUIDE_FILENAME), // Lambda bundle
];

export function resolveUserGuideFile(
  candidates = USER_GUIDE_CANDIDATES,
  exists = fs.existsSync,
) {
  return candidates.find((p) => exists(p)) || null;
}

let cachedAttachment;

export function getUserGuideAttachment() {
  if (cachedAttachment !== undefined) return cachedAttachment;
  try {
    const file = resolveUserGuideFile();
    if (!file) {
      throw new Error(`not found at ${USER_GUIDE_CANDIDATES.join(" or ")}`);
    }
    cachedAttachment = {
      filename: USER_GUIDE_FILENAME,
      content: fs.readFileSync(file).toString("base64"),
    };
  } catch (e) {
    console.warn("[userGuide] guide PDF not attachable:", e?.message || e);
    cachedAttachment = null;
  }
  return cachedAttachment;
}
