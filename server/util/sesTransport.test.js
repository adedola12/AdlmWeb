// SES request-shape tests.
//
// None of this touches SES. What it covers is the half of the transport that
// can be wrong without anything throwing: a BCC that lands in a header instead
// of the envelope, an attachment handed over still base64-encoded so the
// recipient gets a file full of letters, an unsubscribe header that is present
// but malformed. Every one of those sends successfully and is wrong in
// somebody's inbox, which is the worst place to find out.
//
// The base64 case is the one with history. The rest of the app passes
// attachment bodies as base64 strings because that is what Resend's JSON API
// wanted; the SDK wants bytes and does its own encoding. Passing the string
// through unchanged double-encodes it, and a double-encoded PDF opens as
// garbage rather than failing.

import test from "node:test";
import assert from "node:assert/strict";

import { sesSendInput, isRetryableSesError } from "./sesTransport.js";

const base = {
  from: "ADLM Services <admin@adlmstudio.net>",
  to: "customer@example.com",
  subject: "Your licence",
  html: "<p>Hello</p>",
  text: "Hello",
};

test("the recipient and sender land where SES expects them", () => {
  const input = sesSendInput(base);

  assert.equal(input.FromEmailAddress, base.from);
  assert.deepEqual(input.Destination.ToAddresses, ["customer@example.com"]);
  assert.equal(input.Content.Simple.Subject.Data, "Your licence");
  assert.equal(input.Content.Simple.Body.Html.Data, "<p>Hello</p>");
  assert.equal(input.Content.Simple.Body.Text.Data, "Hello");
});

test("a single recipient and a list of them are both accepted", () => {
  const many = sesSendInput({ ...base, to: ["a@example.com", "b@example.com"] });
  assert.deepEqual(many.Destination.ToAddresses, ["a@example.com", "b@example.com"]);
});

test("BCC goes in the envelope, never into a header the recipient can read", () => {
  const input = sesSendInput({ ...base, bcc: "studio@adlmstudio.net" });

  assert.deepEqual(input.Destination.BccAddresses, ["studio@adlmstudio.net"]);
  const headers = input.Content.Simple.Headers || [];
  assert.equal(
    headers.find((h) => /^bcc$/i.test(h.Name)),
    undefined,
    "the internal address must not be written into the message",
  );
});

test("no BCC means no BccAddresses key at all", () => {
  assert.equal("BccAddresses" in sesSendInput(base).Destination, false);
});

test("attachments are decoded to bytes, not passed on as base64", () => {
  const content = Buffer.from("%PDF-1.4 pretend invoice").toString("base64");
  const input = sesSendInput({
    ...base,
    attachments: [{ filename: "invoice.pdf", content }],
  });

  const [att] = input.Content.Simple.Attachments;
  assert.equal(att.FileName, "invoice.pdf");
  assert.equal(att.ContentDisposition, "ATTACHMENT");
  assert.ok(Buffer.isBuffer(att.RawContent) || att.RawContent instanceof Uint8Array);
  assert.equal(
    Buffer.from(att.RawContent).toString("utf8"),
    "%PDF-1.4 pretend invoice",
    "double-encoding here produces a file that opens as gibberish",
  );
});

test("an unsubscribe URL becomes the pair of headers Gmail asks bulk senders for", () => {
  const url = "https://adlmstudio.net/unsubscribe?t=abc.def";
  const headers = sesSendInput({ ...base, listUnsubscribe: url }).Content.Simple.Headers;

  const byName = Object.fromEntries(headers.map((h) => [h.Name, h.Value]));
  // The angle brackets are required by RFC 2369 — a bare URL is ignored.
  assert.equal(byName["List-Unsubscribe"], `<${url}>`);
  assert.equal(byName["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("transactional mail carries no unsubscribe headers", () => {
  assert.equal(sesSendInput(base).Content.Simple.Headers, undefined);
});

test("a configuration set is attached only when there is one", () => {
  assert.equal("ConfigurationSetName" in sesSendInput(base), false);
  assert.equal(
    sesSendInput({ ...base, configurationSetName: "adlm-prod" }).ConfigurationSetName,
    "adlm-prod",
  );
});

test("a message with no text part does not invent an empty one", () => {
  const input = sesSendInput({ ...base, text: undefined });
  assert.equal("Text" in input.Content.Simple.Body, false);
});

/* ─────────────────────────────────────────────────── retry classification ── */

test("throttling and 5xx are worth another turn", () => {
  assert.equal(isRetryableSesError({ name: "ThrottlingException" }), true);
  assert.equal(isRetryableSesError({ name: "TooManyRequestsException" }), true);
  assert.equal(isRetryableSesError({ name: "LimitExceededException" }), true);
  assert.equal(isRetryableSesError({ $metadata: { httpStatusCode: 503 } }), true);
});

test("a rejected message is not — it will be rejected identically next time", () => {
  assert.equal(isRetryableSesError({ name: "MessageRejected" }), false);
  assert.equal(
    isRetryableSesError({ name: "MailFromDomainNotVerifiedException" }),
    false,
    "an unverified domain is a DNS problem, and retrying it just delays the queue",
  );
  assert.equal(isRetryableSesError({ $metadata: { httpStatusCode: 400 } }), false);
  assert.equal(isRetryableSesError(undefined), false);
});
