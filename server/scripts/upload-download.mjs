// Put a public download into ADLM's own storage, at the key the site serves it
// from (R15, util/downloadLinks.js). Once it is there the site stops using the
// link in Admin → Site Settings for that download.
//
//   node --env-file=.env scripts/upload-download.mjs android       path/to/app.apk
//   node --env-file=.env scripts/upload-download.mjs installer-hub path/to/Setup.exe
//
// Goes to the private file store (S3 when FILES_BUCKET is set, else the R2
// installers bucket). Prints the size and SHA-256 so the file can be checked
// against the build. Up to 5 GiB (one PUT).

import fs from "node:fs";
import crypto from "node:crypto";
import { DOWNLOADS } from "../util/downloadLinks.js";
import { presignUpload, headFile, fileStoreBackend } from "../util/fileStore.js";

const [kind, file] = process.argv.slice(2);
const d = DOWNLOADS[kind];
if (!d || !file) {
  console.error(`Usage: upload-download.mjs <${Object.keys(DOWNLOADS).join("|")}> <file>`);
  process.exit(1);
}
const body = fs.readFileSync(file);
const sha256 = crypto.createHash("sha256").update(body).digest("hex");
const contentType = kind === "android" ? "application/vnd.android.package-archive" : "application/octet-stream";

const { uploadUrl } = await presignUpload({ key: d.key, contentType, expiresIn: 3600 });
const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body });
if (!put.ok) {
  console.error(`Upload refused: ${put.status} ${await put.text()}`);
  process.exit(1);
}
const landed = await headFile({ key: d.key });
console.log(`${kind}: ${d.key} on ${fileStoreBackend()}, ${landed?.size ?? "?"} bytes, sha256 ${sha256}`);
console.log("The site serves it from here within five minutes.");
