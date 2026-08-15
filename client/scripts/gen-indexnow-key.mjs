// Writes the IndexNow key file into dist/ at build time.
//
// The protocol needs a text file at https://www.adlmstudio.net/<key>.txt whose
// entire contents are the key. That is what proves domain ownership, and Bing
// rejects every submission with 422 until it matches.
//
// Generated from the env var rather than committed, because the two have to be
// identical and a committed file silently stops matching the moment the key is
// rotated. There is no secret being protected here — IndexNow keys are public
// by design — only a consistency problem being removed.
//
// No key set means no file and no error: the site does not depend on this.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(path.resolve(here, ".."), "dist");

const key = String(process.env.INDEXNOW_KEY || "").trim();

if (!key) {
  console.log("[indexnow] INDEXNOW_KEY not set — key file skipped.");
  process.exit(0);
}

// The spec allows 8 to 128 characters from [a-zA-Z0-9-]. Catching a malformed
// key here beats discovering it as a 422 from Bing days later.
if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
  console.error(
    "[indexnow] INDEXNOW_KEY must be 8-128 chars of a-z, A-Z, 0-9 or '-'. " +
      "Key file NOT written.",
  );
  process.exit(0);
}

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, `${key}.txt`), key, "utf8");

console.log(`[indexnow] wrote dist/${key}.txt`);
