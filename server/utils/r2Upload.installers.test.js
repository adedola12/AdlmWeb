// server/utils/r2Upload.installers.test.js
// The installer packageUri is the only thing between a paying customer and a
// link that hands the proprietary payload to anybody, so the two functions
// that gate it are pinned here rather than trusted.
//
// Env has to be set before the module is imported: createClient() and
// normalizePublicBaseUrl() read process.env at call time, but isR2Configured()
// is consulted the moment a caller asks whether private storage is on.
process.env.R2_ACCOUNT_ID ||= "acct123";
process.env.R2_ACCESS_KEY_ID ||= "ak";
process.env.R2_SECRET_ACCESS_KEY ||= "sk";
process.env.R2_BUCKET ||= "adlm-public";
process.env.R2_PUBLIC_BASE_URL ||= "https://pub-testaccount.r2.dev";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPresignedGetUrl,
  isPrivateInstallerStorageEnabled,
  objectKeyFromPackageUri,
} from "./r2Upload.js";

const BASE = "https://pub-testaccount.r2.dev";
const LIVE = `${BASE}/adlm/installers/planswift-plugin-v2-9-5/planswift-plugin-v2.9.5.zip`;
const KEY = "adlm/installers/planswift-plugin-v2-9-5/planswift-plugin-v2.9.5.zip";

function withInstallersBucket(bucket, fn) {
  const previous = process.env.R2_INSTALLERS_BUCKET;
  if (bucket === undefined) delete process.env.R2_INSTALLERS_BUCKET;
  else process.env.R2_INSTALLERS_BUCKET = bucket;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.R2_INSTALLERS_BUCKET;
    else process.env.R2_INSTALLERS_BUCKET = previous;
  }
}

test("a stored packageUri resolves back to its object key", () => {
  assert.equal(objectKeyFromPackageUri(LIVE), KEY);
  assert.equal(objectKeyFromPackageUri(`${LIVE}?cache=1`), KEY);
  assert.equal(
    objectKeyFromPackageUri(`${BASE}/adlm/installers/x/ADLM%20TakeOff%20Package.zip`),
    "adlm/installers/x/ADLM TakeOff Package.zip",
    "percent-escapes must decode or the signature names a different object",
  );
});

test("a packageUri we do not own is left alone", () => {
  // Returning "" is what makes the caller pass the URI through untouched.
  // Rewriting one of these would break installs for products still on the
  // pre-R2 storage.
  for (const uri of [
    "https://res.cloudinary.com/demo/raw/upload/v1/adlm/installers/foo.zip",
    "https://evil.example.com/adlm/installers/foo.zip",
    `${BASE}/`,
    `${BASE}/adlm/%ZZ`, // malformed escape: cannot be named safely
    "",
    null,
    undefined,
  ]) {
    assert.equal(objectKeyFromPackageUri(uri), "", `should not claim ${uri}`);
  }
});

test("a base-url prefix match is not a path-segment match", () => {
  // "https://pub-testaccount.r2.dev.evil.com/..." starts with the base string
  // but is a different host. The separator in the startsWith guard is what
  // rejects it.
  assert.equal(
    objectKeyFromPackageUri("https://pub-testaccount.r2.devil/adlm/installers/x.zip"),
    "",
  );
});

test("private storage stays off until the bucket is named", () => {
  withInstallersBucket(undefined, () => {
    assert.equal(isPrivateInstallerStorageEnabled(), false);
  });
  withInstallersBucket("   ", () => {
    assert.equal(isPrivateInstallerStorageEnabled(), false, "whitespace is not a bucket");
  });
  withInstallersBucket("adlm-installers-private", () => {
    assert.equal(isPrivateInstallerStorageEnabled(), true);
  });
});

test("signing refuses rather than silently returning a public link", async () => {
  await withInstallersBucket(undefined, async () => {
    await assert.rejects(
      () => createPresignedGetUrl({ key: KEY }),
      /not configured/,
    );
  });
});

test("a signed url keeps the filename InstallerHub caches on", async () => {
  await withInstallersBucket("adlm-installers-private", async () => {
    const signed = await createPresignedGetUrl({ key: KEY });
    const url = new URL(signed);

    assert.ok(url.searchParams.get("X-Amz-Signature"), "must be signed");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "21600", "default 6h TTL");
    assert.ok(
      url.host.startsWith("adlm-installers-private."),
      `signed against the private bucket, got ${url.host}`,
    );

    // The whole no-client-update claim rests on this: InstallerHub derives its
    // cache filename from Path.GetFileName(packageUri.LocalPath), and
    // Uri.LocalPath excludes the query string. Node's URL.pathname is the same
    // slice, so this asserts the exact value the shipped Hub will compute.
    assert.equal(
      decodeURIComponent(url.pathname).split("/").pop(),
      "planswift-plugin-v2.9.5.zip",
    );
  });
});
