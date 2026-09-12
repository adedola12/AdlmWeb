// server/util/campaigns.unsubscribe.test.js
//
// Which HOST the unsubscribe link points at.
//
// It pointed at PUBLIC_SITE_URL, and that was wrong in the way that only shows
// up in production: the route is served by the API on api.adlmstudio.net, while
// adlmstudio.net is the Vercel front end whose config rewrites `/(.*)` to
// index.html. Curling the real URL returned 200 and the React shell — so the
// link worked, looked fine, and did nothing.
//
// That is not a broken link. It is a bulk mailing with no working opt-out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { videoUnsubscribeUrl, readTopicUnsubscribeToken } from "./campaigns.js";

const ID = "68ef815ed84af5b5c7c783ad";

test("the link is built from the API host, never the marketing site", () => {
  process.env.API_BASE_URL = "https://api.adlmstudio.net";
  const url = videoUnsubscribeUrl(ID);

  assert.match(url, /^https:\/\/api\.adlmstudio\.net\/api\/email\/unsubscribe\//);
  // The specific failure, named: the front end must never be the host.
  assert.ok(
    !/^https?:\/\/(www\.)?adlmstudio\.net/.test(url),
    `points at the front end, which rewrites everything to index.html: ${url}`,
  );
});

test("a trailing slash on the configured host does not double up", () => {
  process.env.API_BASE_URL = "https://api.adlmstudio.net/";
  assert.ok(!videoUnsubscribeUrl(ID).includes("net//"), videoUnsubscribeUrl(ID));
});

test("with nothing configured it is localhost, not a wrong production host", () => {
  // Falling back to the site URL is what caused this. Falling back to localhost
  // is obviously wrong in an email, which is the point — it fails where
  // somebody will see it rather than in a customer's inbox.
  delete process.env.API_BASE_URL;
  assert.match(videoUnsubscribeUrl(ID), /^http:\/\/localhost:\d+\//);
});

test("the token in the finished URL still verifies", () => {
  // The whole URL is useless if the encoding step mangles what it carries.
  process.env.API_BASE_URL = "https://api.adlmstudio.net";
  const token = decodeURIComponent(videoUnsubscribeUrl(ID).split("/").pop());
  assert.equal(readTopicUnsubscribeToken("videos", token), ID);
  assert.equal(readTopicUnsubscribeToken("marketing", token), null);
});

test("in production, an unset API_BASE_URL refuses the send rather than mailing localhost", async () => {
  // API_BASE_URL is NOT in SSM today (checked, 12 Sep 2026). Unset on Lambda,
  // the localhost fallback would have put http://localhost:4000/... into every
  // message of a 485-person mailshot — the same dead-opt-out failure this file
  // exists to prevent, only harder to spot.
  const { assertUnsubscribeLinksWork } = await import("./campaigns.js");
  const before = { env: process.env.NODE_ENV, api: process.env.API_BASE_URL };

  try {
    delete process.env.API_BASE_URL;

    process.env.NODE_ENV = "production";
    assert.throws(() => assertUnsubscribeLinksWork(), /API_BASE_URL is not set/);

    // Lambda does not always set NODE_ENV, so the function name counts too.
    process.env.NODE_ENV = "";
    process.env.AWS_LAMBDA_FUNCTION_NAME = "AdlmApi-VideoPollFn";
    assert.throws(() => assertUnsubscribeLinksWork(), /Refusing to send/);
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;

    // A laptop is allowed the localhost link — that is what it is for.
    process.env.NODE_ENV = "development";
    assert.doesNotThrow(() => assertUnsubscribeLinksWork());

    // And configured, it never complains wherever it runs.
    process.env.NODE_ENV = "production";
    process.env.API_BASE_URL = "https://api.adlmstudio.net";
    assert.doesNotThrow(() => assertUnsubscribeLinksWork());
  } finally {
    process.env.NODE_ENV = before.env;
    if (before.api) process.env.API_BASE_URL = before.api;
  }
});
