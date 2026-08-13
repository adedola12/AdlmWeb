// Tests for the agent health record.
//
// These exist because of a specific outage: every message to Ada returned the
// same generic 500, and the only thing that named the cause lived in a
// CloudWatch log group. From outside, an agent whose API key had been rejected
// was indistinguishable from a healthy one — GET /agent/health cheerfully
// reported `{ok:true, enabled:true, provider:"anthropic"}` throughout.
//
// So the classifier is the thing under test: it is what turns "something threw"
// into "the card was declined" without an operator reading logs. The wordings
// asserted below are the providers' own. Nothing here touches the network or
// the database — the module is deliberately dependency-free.
//
// The module keeps process-wide state by design, so these tests share it and
// run in order: fresh container, then failing, then recovered.

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAgentError,
  recordAgentFailure,
  recordAgentSuccess,
  agentHealthSnapshot,
} from "./agentHealth.js";

/* ------------------------- classification ------------------------- */

test("a spent credit balance is billing, not a generic failure", () => {
  assert.equal(
    classifyAgentError(new Error("Your credit balance is too low to access the Anthropic API")).code,
    "provider_billing",
  );
});

test("a rejected key is auth, however the provider words it", () => {
  for (const msg of [
    "invalid x-api-key",
    "Anthropic API 401",
    "authentication_error: invalid API key",
    "Anthropic API 403",
  ]) {
    assert.equal(classifyAgentError(new Error(msg)).code, "provider_auth", msg);
  }
});

test("throttling and overload are called out as transient", () => {
  for (const msg of ["Anthropic API 429", "Overloaded", "Anthropic API 529"]) {
    assert.equal(classifyAgentError(new Error(msg)).code, "provider_rate_limit", msg);
  }
});

test("a mongoose buffering timeout is the database, not the provider", () => {
  // Ordering matters here: this message also contains "timed out", which would
  // otherwise class it as an unreachable provider and send someone to check
  // the wrong system entirely.
  assert.equal(
    classifyAgentError(new Error("Operation `products.find()` buffering timed out after 10000ms")).code,
    "database",
  );
});

test("a dead connection is an unreachable provider", () => {
  for (const msg of ["The operation was aborted", "fetch failed", "ECONNRESET"]) {
    assert.equal(classifyAgentError(new Error(msg)).code, "provider_unreachable", msg);
  }
});

test("a bad model or malformed request is a rejection we caused", () => {
  for (const msg of ["model: claude-x is not supported", "Anthropic API 400", "invalid_request"]) {
    assert.equal(classifyAgentError(new Error(msg)).code, "provider_rejected", msg);
  }
});

test("anything unrecognised still points at the logs rather than guessing", () => {
  const { code, hint } = classifyAgentError(new Error("something nobody predicted"));
  assert.equal(code, "unknown");
  assert.match(hint, /POST \/agent\/chat error/);
});

/* ------------------------- snapshot ------------------------- */

test("a container that has served nothing yet does not claim to be broken", () => {
  const s = agentHealthSnapshot();
  assert.equal(s.healthy, true);
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.lastErrorCode, null);
});

test("the raw provider message is withheld unless an admin asks", () => {
  recordAgentFailure(new Error("Your credit balance is too low to access the Anthropic API"));

  // /agent/health is unauthenticated, and upstream errors can quote request
  // details back, so the public shape must never carry the message.
  assert.ok(!("lastErrorMessage" in agentHealthSnapshot()));
  assert.match(
    agentHealthSnapshot({ includeMessage: true }).lastErrorMessage,
    /credit balance/,
  );
});

test("a repeated failure reads as an outage, with a cause and a hint", () => {
  recordAgentFailure(new Error("Your credit balance is too low to access the Anthropic API"));

  const s = agentHealthSnapshot();
  assert.equal(s.healthy, false);
  assert.equal(s.consecutiveFailures, 2); // this one and the test above
  assert.equal(s.lastErrorCode, "provider_billing");
  assert.match(s.lastErrorHint, /credit balance/);
  assert.ok(s.lastErrorAt);
});

test("a success clears the streak but keeps the history", () => {
  recordAgentSuccess();

  const s = agentHealthSnapshot();
  assert.equal(s.healthy, true);
  assert.equal(s.consecutiveFailures, 0);
  assert.ok(s.lastOkAt);
  // Still worth knowing what went wrong an hour ago once it has recovered.
  assert.equal(s.lastErrorCode, "provider_billing");
});

/* ------------------------- robustness ------------------------- */

test("recording never throws, whatever it is handed", () => {
  // It runs inside the catch block of the failing request. If it can throw,
  // it turns a handled 500 into an unhandled one.
  for (const bad of [undefined, null, "a bare string", { nope: true }, 42]) {
    assert.doesNotThrow(() => recordAgentFailure(bad));
  }
});

test("a huge upstream body cannot bloat the health response", () => {
  recordAgentFailure(new Error("x".repeat(5000)));
  assert.equal(agentHealthSnapshot({ includeMessage: true }).lastErrorMessage.length, 300);
});
