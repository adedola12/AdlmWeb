import test from "node:test";
import assert from "node:assert/strict";
import { resolveDownload, directLink, driveFileId, _resetDownloadCache } from "./downloadLinks.js";

const settings = {
  mobileAppUrl: "https://drive.google.com/file/d/1Pr16vXqTRAOgQrB2Fk3GzZnyMBPiHPRO/view?usp=sharing",
  installerHubUrl: "https://pub-abc.r2.dev/adlm/installer-hub/171-Setup.exe",
};

test("a file in our storage wins, as a short-lived signed link", async () => {
  _resetDownloadCache();
  const store = {
    headFile: async ({ key }) => (key === "apps/adlm-android.apk" ? { size: 5 } : null),
    presignDownload: async ({ key, fileName, expiresIn }) => `https://signed/${key}?n=${fileName}&e=${expiresIn}`,
  };
  const r = await resolveDownload("android", { settings, store });
  assert.equal(r.source, "store");
  assert.equal(r.url, "https://signed/apps/adlm-android.apk?n=ADLM-Studio.apk&e=300");
});

test("until a file is uploaded, the Admin setting is the fail-safe; Drive goes direct", async () => {
  _resetDownloadCache();
  const store = { headFile: async () => null, presignDownload: async () => assert.fail("not stored") };
  const a = await resolveDownload("android", { settings, store });
  assert.equal(a.source, "drive");
  assert.equal(a.url, "https://drive.google.com/uc?export=download&id=1Pr16vXqTRAOgQrB2Fk3GzZnyMBPiHPRO");
  const h = await resolveDownload("installer-hub", { settings, store });
  assert.equal(h.source, "setting");
  assert.equal(h.url, settings.installerHubUrl);
});

test("storage that is down or unconfigured never takes the button with it", async () => {
  _resetDownloadCache();
  const store = {
    headFile: async () => {
      throw new Error("No private file storage is configured");
    },
    presignDownload: async () => assert.fail("never reached"),
  };
  const r = await resolveDownload("installer-hub", { settings, store });
  assert.equal(r.source, "setting");
  assert.equal((await resolveDownload("android", { settings: {}, store })).source, "none");
});

test("Drive links are recognised in their usual shapes", () => {
  assert.equal(driveFileId("https://drive.google.com/open?id=1ZTS1-T2MVot0QoQSl-lyDXaDtbvmUTpg"), "1ZTS1-T2MVot0QoQSl-lyDXaDtbvmUTpg");
  assert.equal(driveFileId("https://example.com/file/d/1ZTS1-T2MVot0QoQSl"), "");
  assert.equal(directLink("https://cdn.adlmstudio.net/x.apk"), "https://cdn.adlmstudio.net/x.apk");
});
