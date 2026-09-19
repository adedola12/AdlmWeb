// server/routes/unsubscribe.productUpdates.test.js
//
// The opt-out link in every "new version is ready" email, over real HTTP.
//
// Three things are pinned. The token round-trips and is bound to its topic, so
// a link out of a release email cannot be edited into the video list or the
// newsletter, and vice versa. GET changes nothing, because mail scanners open
// links. And POST — which is also what Gmail's one-click unsubscribe sends —
// switches off exactly notifications.productUpdates. The two database calls
// are stand-ins; everything else is the real router.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import { apiOrigin, buildCorsOptions, corsWhitelist } from "../util/corsPolicy.js";
import {
  productUpdatesUnsubscribeUrl,
  readTopicUnsubscribeToken,
  topicUnsubscribeToken,
  PRODUCT_UPDATES_TOPIC,
  VIDEO_TOPIC,
} from "../util/campaigns.js";
import { makeProductUpdatesUnsubscribeRouter } from "./unsubscribe.js";

const ID = "68ef815ed84af5b5c7c783ad";

const optOuts = [];
let server;
let base;

before(async () => {
  const app = express();
  app.use(
    "/api/email/unsubscribe/product-updates",
    makeProductUpdatesUnsubscribeRouter({
      findUser: async (id) =>
        id === ID ? { _id: id, email: "qs@firm.test", notifications: { productUpdates: true } } : null,
      optOut: async (id) => {
        optOuts.push(id);
        return id === ID ? { email: "qs@firm.test" } : null;
      },
    }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/email/unsubscribe/product-updates`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test("the link is on the API host and its token round-trips for this topic only", () => {
  process.env.API_BASE_URL = "https://api.adlmstudio.net";
  const url = productUpdatesUnsubscribeUrl(ID);
  assert.match(url, /^https:\/\/api\.adlmstudio\.net\/api\/email\/unsubscribe\/product-updates\//);

  const token = decodeURIComponent(url.split("/").pop());
  assert.equal(readTopicUnsubscribeToken(PRODUCT_UPDATES_TOPIC, token), ID);
  assert.equal(readTopicUnsubscribeToken(VIDEO_TOPIC, token), null, "not a video unsubscribe");
  assert.equal(readTopicUnsubscribeToken("marketing", token), null, "not a newsletter unsubscribe");

  // Edited into somebody else's id, the signature no longer matches.
  const forged = token.replace(ID, "68ef815ed84af5b5c7c783ae");
  assert.equal(readTopicUnsubscribeToken(PRODUCT_UPDATES_TOPIC, forged), null);
  // A video token relabelled as product-updates is refused too.
  const relabelled = topicUnsubscribeToken(VIDEO_TOPIC, ID).replace(/^videos\./, "product-updates.");
  assert.equal(readTopicUnsubscribeToken(PRODUCT_UPDATES_TOPIC, relabelled), null);
});

test("GET shows a button and changes nothing", async () => {
  const before = optOuts.length;
  const token = topicUnsubscribeToken(PRODUCT_UPDATES_TOPIC, ID);
  const res = await fetch(`${base}/${encodeURIComponent(token)}`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Stop emails about new versions\?/);
  assert.match(html, /method="POST"/);
  assert.match(html, /qs@firm\.test/);
  assert.equal(optOuts.length, before, "a link scanner opening the page opts nobody out");
});

test("the one-click POST switches product updates off for that account", async () => {
  const token = topicUnsubscribeToken(PRODUCT_UPDATES_TOPIC, ID);
  const res = await fetch(`${base}/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /will not get emails about new versions again/);
  assert.equal(optOuts.at(-1), ID);
});

test("the page's own button gets through the real CORS policy, whatever the CORS_ORIGINS parameter says", async () => {
  // The same policy index.js builds, in production, with nothing in
  // CORS_ORIGINS: the case where the API host was never added to SSM.
  const env = { NODE_ENV: "production", API_BASE_URL: "https://api.adlmstudio.net/", CORS_ORIGINS: "" };
  assert.equal(apiOrigin(env), "https://api.adlmstudio.net");
  assert.ok(corsWhitelist(env).includes("https://api.adlmstudio.net"));
  assert.ok(!corsWhitelist({ NODE_ENV: "production" }).includes("https://api.adlmstudio.net"), "only from API_BASE_URL");
  assert.equal(apiOrigin({ API_BASE_URL: "not a url" }), "");

  const app = express();
  app.use(cors(buildCorsOptions(env)));
  app.use(
    "/api/email/unsubscribe/product-updates",
    makeProductUpdatesUnsubscribeRouter({
      findUser: async () => null,
      optOut: async (id) => (id === ID ? { email: "qs@firm.test" } : null),
    }),
  );
  // index.js answers a CORS refusal with this.
  app.use((err, _req, res, next) =>
    err && /Not allowed by CORS/.test(err.message) ? res.status(403).json({ error: err.message }) : next(err),
  );
  let srv;
  await new Promise((resolve) => {
    srv = app.listen(0, "127.0.0.1", resolve);
  });
  try {
    const url = `http://127.0.0.1:${srv.address().port}/api/email/unsubscribe/product-updates/${encodeURIComponent(
      topicUnsubscribeToken(PRODUCT_UPDATES_TOPIC, ID),
    )}`;
    const form = { "content-type": "application/x-www-form-urlencoded" };

    // The "Stop product update emails" button: a browser form POST to the
    // API host, which carries the API host's Origin.
    const button = await fetch(url, { method: "POST", headers: { ...form, origin: "https://api.adlmstudio.net" }, body: "" });
    assert.equal(button.status, 200);
    assert.match(await button.text(), /will not get emails about new versions again/);

    // A mailbox provider's one-click POST sends no Origin at all.
    const oneClick = await fetch(url, { method: "POST", headers: form, body: "List-Unsubscribe=One-Click" });
    assert.equal(oneClick.status, 200);

    // Anybody else's site is still refused.
    const other = await fetch(url, { method: "POST", headers: { ...form, origin: "https://evil.example" }, body: "" });
    assert.equal(other.status, 403);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test("a token for another list, or a mangled one, is refused without touching anything", async () => {
  const before = optOuts.length;
  for (const bad of [
    topicUnsubscribeToken(VIDEO_TOPIC, ID),
    `${PRODUCT_UPDATES_TOPIC}.${ID}.deadbeef`,
    "nonsense",
  ]) {
    const get = await fetch(`${base}/${encodeURIComponent(bad)}`);
    assert.equal(get.status, 400, bad);
    const post = await fetch(`${base}/${encodeURIComponent(bad)}`, { method: "POST" });
    assert.equal(post.status, 400, bad);
  }
  assert.equal(optOuts.length, before);
});
