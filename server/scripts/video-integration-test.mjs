// Run the video integration tests, whatever shell you are in.
//
//   node scripts/video-integration-test.mjs
//
// WHY THIS EXISTS RATHER THAN A DOCUMENTED ENV PREFIX
//
// The documented way to run these was
// `AUTH_DB=… VIDEO_IT=1 node --test …`, which is bash. In PowerShell 5.1 —
// which is what this machine actually runs — `&&` is a parse error and an
// inline `VAR=value` prefix is not a thing at all, so the documented command
// simply failed. A test you cannot run is a test that stops being run.
//
// Setting the variables here and spawning the runner means the command is the
// same everywhere and there is no shell syntax to get wrong.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Overridable, but never adlmWeb: the suite writes and deletes, and its own
// guard refuses production. This just means you have to mean it.
const db = process.env.AUTH_DB || "adlmWeb_videotest";
if (db === "adlmWeb") {
  console.error("AUTH_DB is adlmWeb. These tests write and delete. Refusing.");
  process.exit(1);
}

console.log(`Running video integration tests against database "${db}"…\n`);

const child = spawn(
  process.execPath,
  ["--test", "util/videoNotifier.integration.test.js"],
  {
    cwd: serverDir,
    stdio: "inherit",
    env: { ...process.env, AUTH_DB: db, VIDEO_IT: "1" },
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
