// server/util/senders.test.js
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  senderFor,
  replyToAddress,
  DEFAULT_NOTIFY_FROM,
  DEFAULT_NEWS_FROM,
  DEFAULT_REPLY_TO,
} from "./senders.js";

const KEYS = ["EMAIL_FROM", "EMAIL_FROM_NOTIFY", "EMAIL_FROM_NEWS", "EMAIL_REPLY_TO"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const clear = () => KEYS.forEach((k) => delete process.env[k]);

test("receipts and announcements come from different addresses by default", () => {
  clear();
  assert.equal(senderFor(), "ADLM Studio <notifications@adlmstudio.net>");
  assert.equal(senderFor({ marketing: true }), "ADLM Studio <news@adlmstudio.net>");
  assert.notEqual(DEFAULT_NOTIFY_FROM, DEFAULT_NEWS_FROM);
});

test("replies go to the real inbox", () => {
  clear();
  assert.equal(replyToAddress(), "admin@adlmstudio.net");
  assert.equal(DEFAULT_REPLY_TO, "admin@adlmstudio.net");
});

test("the old EMAIL_FROM no longer decides the sender", () => {
  // It is still set to admin@ in production. Honouring it would keep
  // transactional mail on the personal inbox, which is what this replaced.
  clear();
  process.env.EMAIL_FROM = "ADLM Studio <admin@adlmstudio.net>";
  assert.equal(senderFor(), DEFAULT_NOTIFY_FROM);
});

test("each address can be overridden", () => {
  clear();
  process.env.EMAIL_FROM_NOTIFY = "ADLM Studio <receipts@adlmstudio.net>";
  process.env.EMAIL_FROM_NEWS = "ADLM Studio <updates@adlmstudio.net>";
  process.env.EMAIL_REPLY_TO = "support@adlmstudio.net";
  assert.equal(senderFor(), "ADLM Studio <receipts@adlmstudio.net>");
  assert.equal(senderFor({ marketing: true }), "ADLM Studio <updates@adlmstudio.net>");
  assert.equal(replyToAddress(), "support@adlmstudio.net");
});

test("every default stays on the verified domain", () => {
  for (const a of [DEFAULT_NOTIFY_FROM, DEFAULT_NEWS_FROM, DEFAULT_REPLY_TO]) {
    assert.match(a, /@adlmstudio\.net>?$/);
  }
});
