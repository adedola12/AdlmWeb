// The Installer Hub guide is attached to every purchase-approval email. It is
// read from disk, so it must exist where the code looks: server/assets in the
// source tree, and assets/ beside index.mjs in the Lambda bundle (copied there
// by commandHooks in infra/lib/adlm-api-stack.ts). Production ran for weeks
// with ENOENT on /var/assets/... because only the source-tree path was tried.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  USER_GUIDE_CANDIDATES,
  USER_GUIDE_FILENAME,
  getUserGuideAttachment,
  resolveUserGuideFile,
} from "./userGuide.js";

test("the guide PDF resolves to an existing file in the source tree", () => {
  const file = resolveUserGuideFile();
  assert.ok(file, `no guide at ${USER_GUIDE_CANDIDATES.join(" or ")}`);
  assert.ok(fs.statSync(file).size > 100_000, "guide PDF looks truncated");
  assert.equal(fs.readFileSync(file).subarray(0, 5).toString(), "%PDF-");
});

test("inside the bundle the guide is looked for in assets/ beside the bundle", () => {
  // Simulate /var/task: only <bundleDir>/assets/<file> exists.
  const bundleDir = path.join(path.sep, "var", "task");
  const bundled = path.join(bundleDir, "assets", USER_GUIDE_FILENAME);
  const candidates = [
    path.join(bundleDir, "..", "assets", USER_GUIDE_FILENAME),
    bundled,
  ];
  assert.equal(
    resolveUserGuideFile(candidates, (p) => p === bundled),
    bundled,
  );
  assert.equal(resolveUserGuideFile(candidates, () => false), null);
});

test("the candidate list covers the bundle layout", () => {
  const expected = path.join("assets", USER_GUIDE_FILENAME);
  const bundleShaped = USER_GUIDE_CANDIDATES.filter(
    (p) => path.basename(path.dirname(path.dirname(p))) === "util" && p.endsWith(expected),
  );
  assert.equal(bundleShaped.length, 1, "no <moduleDir>/assets/<file> candidate");
});

test("the CDK stack copies the guide to the path the bundle reads", () => {
  const stack = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "infra", "lib", "adlm-api-stack.ts",
  );
  if (!fs.existsSync(stack)) return; // server deployed without infra/
  const src = fs.readFileSync(stack, "utf8");
  assert.ok(
    src.includes(`"assets/${USER_GUIDE_FILENAME}"`),
    "LAMBDA_DISK_ASSETS no longer ships the guide PDF",
  );
});

test("the attachment is the base64 PDF under its public filename", () => {
  const att = getUserGuideAttachment();
  assert.ok(att);
  assert.equal(att.filename, USER_GUIDE_FILENAME);
  assert.equal(Buffer.from(att.content, "base64").subarray(0, 5).toString(), "%PDF-");
});
