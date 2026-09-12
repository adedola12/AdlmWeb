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
