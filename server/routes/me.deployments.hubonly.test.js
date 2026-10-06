// Only the Installer Hub's own package may be downloaded from the website.
//
// The owner's rule, 3 Oct 2026: the one thing downloadable from the site is the
// Hub's .exe, and every other package is installed BY the Hub — which is what
// makes licence binding, version pinning and the update channel work.
//
// On 4 Oct a signed-in customer pulled `adlm-revit-mep-v2.0.0-r2.zip` straight
// out of the browser. GET /me/deployments is the Hub's update channel, and
// client/src/ds/DsDownloads.jsx calls the same endpoint and renders a plain
// <a href={pkg.packageUri}> for every entitled product.
//
// WHAT MUST NOT REGRESS, AND IT IS NOT THE OBVIOUS ONE
//
// The dangerous failure here is not "the browser can still download" — that is
// visible. It is breaking the HUB, which would stop paid customers installing
// anything at all, and would look like a licence fault rather than this change.
// So the first and longest test below is the one asserting the Hub is untouched.
import test from "node:test";
import assert from "node:assert/strict";

import { isBrowserCaller, withoutDirectDownloads } from "./me.deployments.js";

/** A stand-in for an Express request carrying the given headers. */
const reqWith = (headers = {}) => ({
  get(name) {
    const k = String(name).toLowerCase();
    const found = Object.keys(headers).find((h) => h.toLowerCase() === k);
    return found ? headers[found] : undefined;
  },
});

const ITEMS = [
  { productKey: "mep", version: "2.0.0-r2", packageUri: "https://r2.example/adlm-revit-mep-v2.0.0-r2.zip" },
  { productKey: "revit", version: "4.0.0", packageUri: "https://r2.example/quiv.zip" },
  { productKey: "installer-hub", version: "2.0.0", packageUri: "https://r2.example/ADLM-Installer-Hub-Setup.exe" },
];

test("the Installer Hub is not treated as a browser and keeps every link", () => {
  // THE ONE THAT MATTERS. If this ever fails, customers cannot install.
  const hub = reqWith({ "x-adlm-client": "installer-hub" });
  assert.equal(isBrowserCaller(hub), false);

  // Even if a future Hub build sends an Origin header, saying who it is wins.
  const hubWithOrigin = reqWith({
    "x-adlm-client": "installer-hub",
    origin: "https://adlmstudio.net",
    "sec-fetch-site": "cross-site",
  });
  assert.equal(
    isBrowserCaller(hubWithOrigin),
    false,
    "a caller that identifies itself must never be locked out by a header heuristic",
  );
});

test("the plugins are not treated as browsers either", () => {
  for (const c of ["revit-arch-plugin", "heron", "serviq", "ADLM-RevitPlugin"]) {
    assert.equal(isBrowserCaller(reqWith({ "x-adlm-client": c })), false, `${c} must be served`);
  }
});

test("an older client that sends no headers at all is still served", () => {
  // Deliberately fails OPEN. A Hub build predating the x-adlm-client header must
  // not lose its update channel because of a presentation rule.
  assert.equal(
    isBrowserCaller(reqWith({})),
    false,
    "no identifying headers means we cannot prove it is a browser, so serve it",
  );
  assert.equal(isBrowserCaller(reqWith({ "user-agent": "HttpClient/1.0" })), false);
});

test("a browser IS identified, by either signal", () => {
  assert.equal(isBrowserCaller(reqWith({ origin: "https://adlmstudio.net" })), true);
  assert.equal(isBrowserCaller(reqWith({ "sec-fetch-site": "cross-site" })), true);
  assert.equal(
    isBrowserCaller(
      reqWith({
        origin: "https://adlmstudio.net",
        "sec-fetch-site": "cross-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    ),
    true,
  );
});

test("the browser loses every package link except the Hub's own", () => {
  const out = withoutDirectDownloads(ITEMS);
  const by = Object.fromEntries(out.map((i) => [i.productKey, i]));

  // The actual file from the report.
  assert.equal(by.mep.packageUri, "", "the MEP plugin zip must not be handed to a browser");
  assert.equal(by.mep.viaHub, true);
  assert.equal(by.revit.packageUri, "");

  // And the one thing the site IS for.
  assert.equal(
    by["installer-hub"].packageUri,
    "https://r2.example/ADLM-Installer-Hub-Setup.exe",
    "the Hub installer is the one download the website must keep offering",
  );
  assert.equal(by["installer-hub"].viaHub, undefined);
});

test("the row survives, only the link goes", () => {
  // The customer is still entitled to see what they license and which version.
  const out = withoutDirectDownloads(ITEMS);
  const mep = out.find((i) => i.productKey === "mep");
  assert.equal(mep.version, "2.0.0-r2", "the page must still be able to show the version");
  assert.equal(mep.productKey, "mep");
  assert.equal(out.length, ITEMS.length, "nothing may be dropped from the list");
});

test("stripping does not mutate what the Hub was given", () => {
  // withSignedPackageUris runs first and its result is handed to the Hub on
  // other requests; a shared-reference mutation here would be a cross-request bug.
  const source = [{ productKey: "mep", packageUri: "https://r2.example/x.zip" }];
  withoutDirectDownloads(source);
  assert.equal(
    source[0].packageUri,
    "https://r2.example/x.zip",
    "the input array must not be mutated",
  );
});

test("a row with no package is passed through untouched", () => {
  const out = withoutDirectDownloads([{ productKey: "mep", version: "1.0" }]);
  assert.equal(out[0].viaHub, undefined, "nothing to strip means nothing to flag");
  assert.equal(out[0].version, "1.0");
});
