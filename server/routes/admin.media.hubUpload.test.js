// server/routes/admin.media.hubUpload.test.js
//
// R3 follow-up (2026-09-27): an Installer Hub upload must never produce a
// public URL or a key under the public adlm/installer-hub prefix. The Hub is
// served only by /me/downloads/installer-hub, as a signed link to the private
// file store, so a public copy would skip the paid-licence check.
//
// The routes run over real HTTP with a real admin token; Mongo is stubbed and
// the presigned URLs are signed offline with fake credentials, so nothing
// reaches storage.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.R2_ACCOUNT_ID = "acct123";
process.env.R2_ACCESS_KEY_ID = "ak";
process.env.R2_SECRET_ACCESS_KEY = "sk";
process.env.R2_BUCKET = "adlm-public";
process.env.R2_PUBLIC_BASE_URL = "https://pub-testaccount.r2.dev";
process.env.R2_INSTALLERS_BUCKET = "adlm-private-installers";
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "AKIATESTTESTTESTTEST";
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test-secret";
process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-1";
delete process.env.FILES_BUCKET;

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { Setting } = await import("../models/Setting.js");
const { default: mediaRouter } = await import("./admin.media.js");
const { default: settingsRouter } = await import("./admin.settings.js");
const { DOWNLOADS } = await import("../util/downloadLinks.js");
const { HUB_KEY, HUB_PUBLIC_PREFIX, isPublicHubCopy, hubUploadProblem, looksLikeHubInstaller } =
  await import("../util/hubStorage.js");

const ADMIN_ID = new mongoose.Types.ObjectId();
User.findById = () => ({ select: () => ({ lean: async () => ({ role: "admin", disabled: false }) }) });

let storedHubUrl = "";
let saved = null;
Setting.findOne = () => {
  const doc = { installerHubUrl: storedHubUrl };
  return { select: () => ({ lean: async () => doc }), lean: async () => doc };
};
Setting.findOneAndUpdate = async (_q, update) => {
  saved = update;
  return { installerHubUrl: update.installerHubUrl ?? storedHubUrl };
};

const PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL;

async function call(path, body) {
  const app = express();
  app.use(express.json());
  app.use("/admin/media", mediaRouter);
  app.use("/admin/settings", settingsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const token = signAccess({ _id: String(ADMIN_ID), email: "admin@adlmstudio.net", role: "admin", emailVerified: true });
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    return { status: res.status, text, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function assertNothingPublic(text) {
  assert.doesNotMatch(text, /adlm\/installer-hub|adlm%2Finstaller-hub/i, "no public Hub prefix");
  assert.ok(!text.includes(PUBLIC_BASE), "no public base URL");
  assert.ok(!text.includes("pub-testaccount"), "no public host");
  assert.doesNotMatch(text, /cloudinary/i, "no Cloudinary");
  assert.doesNotMatch(text, /publicUrl|secure_url/, "no public URL field");
}

test("the Hub key the upload writes to is the one the gate serves", () => {
  assert.equal(HUB_KEY, DOWNLOADS["installer-hub"].key);
  assert.ok(!HUB_KEY.startsWith(HUB_PUBLIC_PREFIX));
});

test("Site Settings upload (R2 fallback): a presigned PUT to the PRIVATE bucket at the gate's key, no public URL", async () => {
  const r = await call("/admin/media/installer-upload-url", { filename: "ADLM Installer Hub Setup.exe", size: 90_000_000 });
  assert.equal(r.status, 200, r.text);
  assertNothingPublic(r.text);
  assert.equal(r.body.key, HUB_KEY);
  assert.equal(r.body.storage, "r2");
  const put = new URL(r.body.uploadUrl);
  assert.match(put.host + put.pathname, /adlm-private-installers/, "signed for the private installers bucket");
  assert.doesNotMatch(put.host + put.pathname, /adlm-public/, "never the public bucket");
  assert.ok(decodeURIComponent(put.pathname).endsWith(`/${HUB_KEY}`));
  assert.ok(put.searchParams.get("X-Amz-Signature"), "a presigned PUT");
  assert.equal(r.body.contentType, "application/octet-stream");
});

test("Site Settings upload (S3, once FILES_BUCKET is set): the private files bucket at the gate's key", async () => {
  process.env.FILES_BUCKET = "adlm-files-test-bucket";
  try {
    const r = await call("/admin/media/installer-upload-url", { filename: "Setup.exe" });
    assert.equal(r.status, 200, r.text);
    assertNothingPublic(r.text);
    assert.equal(r.body.storage, "s3");
    assert.equal(r.body.key, HUB_KEY);
    const put = new URL(r.body.uploadUrl);
    assert.match(put.host + put.pathname, /adlm-files-test-bucket/);
    assert.ok(decodeURIComponent(put.pathname).endsWith(`/${HUB_KEY}`));
  } finally {
    delete process.env.FILES_BUCKET;
  }
});

test("no private store configured: refused, never falls back to public storage", async () => {
  const prev = process.env.R2_INSTALLERS_BUCKET;
  delete process.env.R2_INSTALLERS_BUCKET;
  try {
    const r = await call("/admin/media/installer-upload-url", { filename: "Setup.exe" });
    assert.equal(r.status, 503);
    assertNothingPublic(r.text);
    const done = await call("/admin/media/installer-uploaded");
    assert.equal(done.status, 404);
    assertNothingPublic(done.text);
  } finally {
    process.env.R2_INSTALLERS_BUCKET = prev;
  }
});

test("only a setup .exe can be the Hub (the gate saves it as …Setup.exe)", async () => {
  for (const filename of ["ADLMInstallerHub-v1.0.2.zip", "hub.msi", "", "Setup.exe.zip"]) {
    const r = await call("/admin/media/installer-upload-url", { filename });
    assert.equal(r.status, 400, filename);
    assert.equal(r.body.uploadUrl, undefined);
  }
  assert.equal(hubUploadProblem({ filename: "Setup.EXE" }), null);
  assert.match(hubUploadProblem({ filename: "Setup.exe", size: 6 * 1024 ** 3 }), /5 GB/);
});

test("the public course-software upload refuses a Hub build", async () => {
  const app = express();
  app.use("/admin/media", mediaRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const token = signAccess({ _id: String(ADMIN_ID), email: "admin@adlmstudio.net", role: "admin", emailVerified: true });
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("MZ fake")]), "ADLM-Installer-Hub-Setup.exe");
    const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/media/upload-installer`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    const text = await res.text();
    assert.equal(res.status, 400);
    assert.match(text, /Site Settings/);
    assertNothingPublic(text);
  } finally {
    await new Promise((r) => server.close(r));
  }
  assert.ok(looksLikeHubInstaller("ADLMInstallerHub-v1.0.2.zip"));
  assert.ok(looksLikeHubInstaller("installer_hub.exe"));
  assert.ok(!looksLikeHubInstaller("Revit-2024-trial.exe"));
});

test("a public Hub copy is recognised wherever it is hosted", () => {
  assert.ok(isPublicHubCopy(`${PUBLIC_BASE}/adlm/installer-hub/1758000000000-Setup.exe`));
  assert.ok(isPublicHubCopy("https://res.cloudinary.com/demo/raw/upload/v17/adlm/installer-hub/Setup"));
  assert.ok(isPublicHubCopy(`${PUBLIC_BASE}/adlm%2Finstaller-hub/x.exe`));
  assert.ok(!isPublicHubCopy("https://drive.google.com/file/d/1abcdefghijk/view"));
  assert.ok(!isPublicHubCopy(`${PUBLIC_BASE}/adlm/installers/x.zip`));
  assert.ok(!isPublicHubCopy(""));
});

test("Site Settings refuses to save a NEW public Hub copy as the download link", async () => {
  storedHubUrl = "";
  saved = null;
  const r = await call("/admin/settings/installer-hub", {
    installerHubUrl: `${PUBLIC_BASE}/adlm/installer-hub/1758000000000-Setup.exe`,
  });
  assert.equal(r.status, 400);
  assert.equal(saved, null, "nothing written");
});

test("an existing value is kept as it stands, so saving the video link does not drop the fail-safe", async () => {
  storedHubUrl = `${PUBLIC_BASE}/adlm/installer-hub/1700000000000-Setup.exe`;
  saved = null;
  const r = await call("/admin/settings/installer-hub", {
    installerHubUrl: storedHubUrl,
    installerHubVideoUrl: "https://youtu.be/abc",
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(saved.installerHubVideoUrl, "https://youtu.be/abc");

  // Clearing it, or a non-public link, is always allowed.
  assert.equal((await call("/admin/settings/installer-hub", { installerHubUrl: "" })).status, 200);
  assert.equal(
    (await call("/admin/settings/installer-hub", { installerHubUrl: "https://drive.google.com/file/d/1abcdefghijk/view" })).status,
    200,
  );
  storedHubUrl = "";
});
