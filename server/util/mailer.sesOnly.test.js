// server/util/mailer.sesOnly.test.js
//
// SES is the only way mail leaves the studio.
//
// Owner's rule, 6 Oct 2026: Resend is never used again, and nothing falls back
// to SMTP either. When SES refuses a message the send fails loudly - logged,
// recorded as failed, thrown to the caller - and no other provider is tried.
//
// No network and no database: the SES sender is swapped for a stub, the send
// log is captured in memory, and fetch is watched so any attempt to reach
// another provider over HTTP is caught.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Seeded with stale settings on purpose: none of them may route mail anywhere.
process.env.RESEND_API_KEY = "re_should_never_be_used";
process.env.SMTP_HOST = "smtp.example.com";
process.env.SMTP_USER = "someone@example.com";
process.env.SMTP_PASS = "not-a-real-password";
process.env.MAIL_FALLBACK = "on";

const { sendMail, _setSesSenderForTests } = await import("./mailer.js");
const { EmailSend } = await import("../models/EmailSend.js");

const here = path.dirname(fileURLToPath(import.meta.url));

// Capture the send log instead of writing to a database that is not there.
const logged = [];
EmailSend.create = async (doc) => {
  logged.push(doc);
  return doc;
};

// Any HTTP call out of the mailer is a call to another provider.
const fetchCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  fetchCalls.push(args);
  throw new Error("the mailer must not make HTTP calls of its own");
};

test.after(() => {
  globalThis.fetch = realFetch;
  _setSesSenderForTests(null);
});

function reset() {
  logged.length = 0;
  fetchCalls.length = 0;
}

test("a refused SES send throws, is logged loudly, and tries nothing else", async () => {
  reset();
  process.env.MAIL_TRANSPORT = "ses";
  let sesCalls = 0;
  const refusal = Object.assign(new Error("Email address is not verified."), {
    name: "MessageRejected",
  });
  _setSesSenderForTests(async () => {
    sesCalls += 1;
    throw refusal;
  });

  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    await assert.rejects(
      sendMail({ to: "customer@example.com", subject: "Hi", html: "<p>Hi</p>" }),
      (err) => err === refusal,
      "the caller must get SES's own error, not a quiet success",
    );
  } finally {
    console.error = realError;
  }

  assert.equal(sesCalls, 1, "SES is tried exactly once");
  assert.equal(fetchCalls.length, 0, "no HTTP provider (Resend) was tried");
  assert.ok(
    errors.some((e) => /SES refused/.test(e) && /MessageRejected/.test(e)),
    "the refusal must be logged",
  );
  assert.equal(logged.length, 1, "the failure is recorded in the send log");
  assert.equal(logged[0].ok, false);
  assert.equal(logged[0].via, "ses");
});

test("with MAIL_TRANSPORT unset, mail still goes out on SES", async () => {
  reset();
  delete process.env.MAIL_TRANSPORT;
  const seen = [];
  _setSesSenderForTests(async (msg) => {
    seen.push(msg);
    return "ses-message-id-1";
  });

  await sendMail({ to: "customer@example.com", subject: "Receipt", html: "<p>Paid</p>" });

  assert.equal(seen.length, 1, "SES carried the message");
  assert.deepEqual(seen[0].to, ["customer@example.com"]);
  assert.equal(seen[0].text, "Paid", "a text alternative is derived from the HTML");
  assert.match(seen[0].from, /^ADLM Studio </);
  assert.equal(fetchCalls.length, 0);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].ok, true);
  assert.equal(logged[0].via, "ses");
  assert.equal(logged[0].messageId, "ses-message-id-1");
});

test("a MAIL_TRANSPORT naming another provider is ignored: SES carries it", async () => {
  reset();
  process.env.MAIL_TRANSPORT = "resend";
  let sesCalls = 0;
  _setSesSenderForTests(async () => {
    sesCalls += 1;
    return "ses-message-id-2";
  });
  try {
    await sendMail({ to: ["a@example.com"], subject: "x", html: "<p>x</p>" });
  } finally {
    delete process.env.MAIL_TRANSPORT;
  }
  assert.equal(sesCalls, 1);
  assert.equal(fetchCalls.length, 0);
});

test("the mailer has no other provider left in it", () => {
  const src = fs.readFileSync(path.join(here, "mailer.js"), "utf8");
  // Code, not commentary: strip comments so the header explaining the rule
  // does not trip the check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const banned of [
    /RESEND_API_KEY/,
    /resend\.(com|dev)/i,
    /nodemailer/,
    /SMTP_(HOST|USER|PASS|PORT)/,
    /node-fetch/,
    /MAIL_FALLBACK/,
  ]) {
    assert.ok(!banned.test(code), `mailer.js still references ${banned}`);
  }
});
