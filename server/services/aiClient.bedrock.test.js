// Tests for the Bedrock request body.
//
// These exist because moving Ada onto Bedrock is a response to an outage, and
// the failure mode being fixed — every message dying at the provider — is
// exactly the failure mode a malformed request reproduces. From the widget,
// "your credit balance is too low" and "ValidationException: extraneous key
// [model]" look the same: Ada says she hit a snag.
//
// Bedrock speaks the Anthropic Messages API with two inversions of the direct
// API, and each is asserted below because each is silent until it 400s:
//   - `anthropic_version` is REQUIRED, in the body, as a Bedrock-specific
//     string that is not the date the direct API uses;
//   - `model` is FORBIDDEN in the body — it is the InvokeModel target.
//
// The client itself is not exercised: it needs real AWS credentials, and a
// test that mocks the transport would only assert that the mock was called.

import test from "node:test";
import assert from "node:assert/strict";

import { bedrockRequestBody } from "./aiClient.js";
import { priceForModel, billingAccountFor } from "../config/aiPricing.js";

const MESSAGES = [{ role: "user", content: "what does RateGen cost?" }];
const TOOLS = [
  { name: "get_my_projects", description: "…", input_schema: { type: "object", properties: {} } },
];

test("the body pins Bedrock's own anthropic_version", () => {
  const b = bedrockRequestBody({ system: "s", messages: MESSAGES });
  // Not "2023-06-01" — that is the direct API's header value, and Bedrock
  // rejects it.
  assert.equal(b.anthropic_version, "bedrock-2023-05-31");
});

test("the body carries no model key", () => {
  const b = bedrockRequestBody({ system: "s", messages: MESSAGES });
  assert.ok(!("model" in b), "model belongs in the InvokeModel target, not the body");
});

test("max_tokens is capped, never raised, by the caller", () => {
  // The cap bounds spend on a public endpoint, so a caller asking for more
  // must not get more.
  assert.ok(bedrockRequestBody({ messages: MESSAGES, maxTokens: 999_999 }).max_tokens <= 700);
  assert.equal(bedrockRequestBody({ messages: MESSAGES, maxTokens: 200 }).max_tokens, 200);
  assert.equal(bedrockRequestBody({ messages: MESSAGES }).max_tokens, 700);
});

test("tools are passed through, and omitted entirely when there are none", () => {
  // An empty `tools: []` is not the same as no key: it is a validation error.
  assert.deepEqual(bedrockRequestBody({ messages: MESSAGES, tools: TOOLS }).tools, TOOLS);
  assert.ok(!("tools" in bedrockRequestBody({ messages: MESSAGES, tools: [] })));
  assert.ok(!("tools" in bedrockRequestBody({ messages: MESSAGES })));
});

test("the cacheable half of the prompt is marked, without a 1h ttl", () => {
  const b = bedrockRequestBody({
    system: { cacheable: "the catalogue", dynamic: "this visitor" },
    messages: MESSAGES,
    useCache: true,
  });

  assert.ok(Array.isArray(b.system));
  assert.equal(b.system[0].text, "the catalogue");
  assert.deepEqual(b.system[0].cache_control, { type: "ephemeral" });
  // The 1h TTL is an anthropic-beta feature and there is no way to send that
  // header through InvokeModel, so asking for it here would be a hard error.
  assert.ok(!("ttl" in b.system[0].cache_control));
  // Per-visitor text stays outside the cached prefix or nothing ever hits.
  assert.equal(b.system[1].text, "this visitor");
});

test("caching off flattens the prompt to a plain string", () => {
  // The fallback path, taken when Bedrock objects to cache_control at all.
  const b = bedrockRequestBody({
    system: { cacheable: "the catalogue", dynamic: "this visitor" },
    messages: MESSAGES,
    useCache: false,
  });

  assert.equal(typeof b.system, "string");
  assert.match(b.system, /the catalogue/);
  assert.match(b.system, /this visitor/);
});

test("messages pass through untouched", () => {
  // salesAgent echoes assistant content blocks back verbatim on tool turns;
  // rewriting them here would break the tool-result exchange.
  assert.deepEqual(bedrockRequestBody({ messages: MESSAGES }).messages, MESSAGES);
});

/* ------------------------- metering ------------------------- */
// Switching provider must not silently blind the AI-spend dashboard.

test("a Bedrock inference-profile id still prices as the model it runs", () => {
  // The id is decorated at both ends — a regional routing prefix and a version
  // suffix — around the name the price table is keyed on.
  const p = priceForModel("eu.anthropic.claude-haiku-4-5-20251001-v1:0");
  assert.equal(p.matched, true, "must not fall through to the placeholder rate");
  assert.equal(p.key, "claude-haiku-4-5");

  // The same rates the direct API is costed at, so the dashboard stays
  // comparable across the migration.
  assert.deepEqual(
    [p.in, p.out],
    [priceForModel("claude-haiku-4-5-20251001").in, priceForModel("claude-haiku-4-5-20251001").out],
  );
});

test("Bedrock spend is attributed to AWS, not to the Anthropic account", () => {
  assert.equal(billingAccountFor("bedrock"), "aws");
});
