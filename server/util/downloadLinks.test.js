import test from "node:test";
import assert from "node:assert/strict";
import { resolveDownload, directLink, driveFileId, isPublicHubCopy, _resetDownloadCache, forgetStored } from "./downloadLinks.js";

const settings = {
  mobileAppUrl: "https://drive.google.com/file/d/1Pr16vXqTRAOgQrB2Fk3GzZnyMBPiHPRO/view?usp=sharing",
  // NOT a public copy under adlm/installer-hub. The fail-safe is a real idea —
  // storage being down should not take the button with it — but this fixture
  // used to be exactly the shape that skips the paid gate, so the tests below
  // were asserting that the hole stayed open.
  installerHubUrl: "https://cdn.adlmstudio.net/hub/ADLM-Installer-Hub-Setup.exe",
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

test("an app uploaded from Site Settings is served at once, not after the cache runs out", async () => {
  _resetDownloadCache();
  let stored = false;
  const store = {
    headFile: async () => (stored ? { size: 70739646 } : null),
    presignDownload: async ({ key }) => `https://signed/${key}`,
  };
  const t = 1_000_000;
  assert.equal((await resolveDownload("android", { settings, store, now: t })).source, "drive");
  stored = true;
  // Still cached as absent a minute later...
  assert.equal((await resolveDownload("android", { settings, store, now: t + 60_000 })).source, "drive");
  // ...until /admin/media/apk-uploaded forgets it.
  forgetStored("apps/adlm-android.apk");
  const r = await resolveDownload("android", { settings, store, now: t + 60_000 });
  assert.equal(r.source, "store");
  assert.equal(r.url, "https://signed/apps/adlm-android.apk");
});

test("a public copy of the Hub is refused on the way out, not just on the way in", async () => {
  // The Hub is paid-accounts-only. Builds used to be written to the public
  // prefix adlm/installer-hub and the URL pasted into the setting; anyone with
  // that link downloaded the Hub with no licence check. New ones have been
  // refused for a while, but only on SAVE — so a value stored before that guard
  // was still being served. On 30 Sep 2026 the live gate was handing out
  // pub-….r2.dev/adlm/installer-hub/…-ADLMInstallerHub-v2.0.0.zip while telling
  // the customer the file was ADLM-Installer-Hub-Setup.exe.
  _resetDownloadCache();
  const store = { headFile: async () => null, presignDownload: async () => assert.fail("not stored") };
  const leaky = { installerHubUrl: "https://pub-abc.r2.dev/adlm/installer-hub/171-Setup.exe" };
  const r = await resolveDownload("installer-hub", { settings: leaky, store });
  assert.equal(r.url, "", "a gate-skipping link was served");
  assert.equal(r.source, "none");
  assert.equal(r.refused, "public-copy");
  // It still names the file it WOULD serve, so the screen can say what to upload.
  assert.equal(r.fileName, "ADLM-Installer-Hub-Setup.exe");
});

test("a zip is refused the same way — the gate promises a Setup.exe", async () => {
  _resetDownloadCache();
  const store = { headFile: async () => null, presignDownload: async () => assert.fail("not stored") };
  const zip = { installerHubUrl: "https://pub-abc.r2.dev/adlm/installer-hub/1790559616492-ADLMInstallerHub-v2.0.0.zip" };
  assert.equal((await resolveDownload("installer-hub", { settings: zip, store })).url, "");
});

test("the android download is untouched — only the Hub has a public prefix", async () => {
  _resetDownloadCache();
  const store = { headFile: async () => null, presignDownload: async () => assert.fail("not stored") };
  const r = await resolveDownload("android", { settings, store });
  assert.equal(r.source, "drive");
});

test("isPublicHubCopy reads the path, not the host", () => {
  assert.equal(isPublicHubCopy("https://pub-abc.r2.dev/adlm/installer-hub/x.exe"), true);
  assert.equal(isPublicHubCopy("https://res.cloudinary.com/y/raw/upload/adlm/installer-hub/x.exe"), true);
  assert.equal(isPublicHubCopy("https://pub-abc.r2.dev/adlm%2Finstaller-hub/x.exe"), true);
  assert.equal(isPublicHubCopy("https://cdn.adlmstudio.net/hub/ADLM-Installer-Hub-Setup.exe"), false);
  assert.equal(isPublicHubCopy(""), false);
  assert.equal(isPublicHubCopy(null), false);
});
