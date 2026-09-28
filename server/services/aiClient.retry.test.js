// Tests for the transient-error retry around createMessage().
//
// Ada failed visitors' messages outright when Bedrock answered a brief 503
// ("Bedrock is unable to process your request"). createMessage() now retries
// transient failures a bounded number of times inside its time budget, and
// these tests pin the parts that matter from outside:
//   - a transient error is retried and the visitor never sees it;
//   - a 4xx (validation, auth) is NOT retried;
//   - the retry gives up inside the budget and surfaces the same error, so the
//     route still answers with its usual friendly failure;
//   - metering records ONE row per call: the attempt that succeeded, or the
//     final failure, never each failed attempt.
//
// The Bedrock client is a fake with a `send()` we script; no AWS call is made.

import test from "node:test";
import assert from "node:assert/strict";

// The provider is read at import time, so pin it before importing.
delete process.env.AGENT_PROVIDER;
delete process.env.AGENT_MAX_RETRIES;
delete process.env.AGENT_TIMEOUT_MS;

const { createMessage, isTransientModelError, retryDelayMs, __setAiClientTestHooks } =
  await import("./aiClient.js");
const { classifyAgentError } = await import("./agentHealth.js");

/* ------------------------- fakes ------------------------- */

function sdkError(name, status, extra = {}) {
  const e = new Error(extra.message || `${name} from the fake`);
  e.name = name;
  e.$metadata = { httpStatusCode: status };
  e.$fault = status >= 500 ? "server" : "client";
  return Object.assign(e, extra);
}

const OK_BODY = {
  content: [{ type: "text", text: "RateGen is on the pricing page." }],
  stop_reason: "end_turn",
  usage: { input_tokens: 120, output_tokens: 30 },
};

/**
 * Wire createMessage to a scripted client. Each script step is either an
 * Error (thrown by send) or "ok" (a normal response).
 */
function harness(script) {
  const calls = { send: 0, sleeps: [], meter: [] };
  const steps = [...script];
  __setAiClientTestHooks({
    bedrockClient: {
      async send() {
        calls.send += 1;
        const step = steps.shift();
        if (step instanceof Error) throw step;
        return { body: new TextEncoder().encode(JSON.stringify(OK_BODY)) };
      },
    },
    meter: (row) => calls.meter.push(row),
    sleep: async (ms) => {
      calls.sleeps.push(ms);
    },
    random: () => 0.5,
  });
  return calls;
}

const ARGS = {
  system: "you are Ada",
  messages: [{ role: "user", content: "what does RateGen cost?" }],
  meta: { feature: "ada-chat", sessionId: "s1" },
};

test.afterEach(() => __setAiClientTestHooks());

/* ------------------------- behaviour ------------------------- */

test("success on the first attempt: one call, one metered row, no wait", async () => {
  const calls = harness(["ok"]);
  const out = await createMessage(ARGS);

  assert.equal(out.text, "RateGen is on the pricing page.");
  assert.equal(calls.send, 1);
  assert.deepEqual(calls.sleeps, []);
  assert.equal(calls.meter.length, 1);
  assert.equal(calls.meter[0].ok, true);
  assert.equal(calls.meter[0].usage.inputTokens, 120);
});

test("a 500 then success: retried once, the visitor gets the answer", async () => {
  const calls = harness([sdkError("InternalServerException", 500), "ok"]);
  const out = await createMessage(ARGS);

  assert.equal(out.text, "RateGen is on the pricing page.");
  assert.equal(calls.send, 2);
  assert.equal(calls.sleeps.length, 1);
  // Metered once, as a success: the failed attempt is not a row of its own.
  assert.equal(calls.meter.length, 1);
  assert.equal(calls.meter[0].ok, true);
});

test("the 503 seen in production is retried", async () => {
  const calls = harness([
    sdkError("ServiceUnavailableException", 503, {
      message: "Bedrock is unable to process your request.",
    }),
    "ok",
  ]);
  await createMessage(ARGS);
  assert.equal(calls.send, 2);
});

test("throttled on every attempt: gives up after 2 retries with the same error", async () => {
  const calls = harness([
    sdkError("ThrottlingException", 429),
    sdkError("ThrottlingException", 429),
    sdkError("ThrottlingException", 429),
    "ok", // never reached
  ]);

  await assert.rejects(createMessage(ARGS), (err) => {
    // Same message shape as before retries existed, so the route's friendly
    // failure and /agent/health's classification are unchanged.
    assert.match(err.message, /^Bedrock ThrottlingException:/);
    assert.equal(classifyAgentError(err).code, "provider_rate_limit");
    return true;
  });

  assert.equal(calls.send, 3, "1 attempt + 2 retries");
  // Exponential backoff: with random pinned at 0.5 the jitter factor is 0.75.
  assert.deepEqual(calls.sleeps, [375, 750]);
  // One failure row for the call, not three.
  assert.equal(calls.meter.length, 1);
  assert.equal(calls.meter[0].ok, false);
});

test("throttled twice then success: 3 attempts, still one metered row", async () => {
  const calls = harness([
    sdkError("ThrottlingException", 429),
    sdkError("ThrottlingException", 429),
    "ok",
  ]);
  await createMessage(ARGS);

  assert.equal(calls.send, 3);
  assert.equal(calls.meter.length, 1);
  assert.equal(calls.meter[0].ok, true);
});

test("a 400 validation error is not retried", async () => {
  const calls = harness([sdkError("ValidationException", 400, { message: "extraneous key [model]" }), "ok"]);

  await assert.rejects(createMessage(ARGS), /Bedrock ValidationException/);
  assert.equal(calls.send, 1);
  assert.deepEqual(calls.sleeps, []);
  assert.equal(calls.meter.length, 1);
  assert.equal(calls.meter[0].ok, false);
});

test("an auth refusal (403) is not retried", async () => {
  const calls = harness([sdkError("AccessDeniedException", 403), "ok"]);
  await assert.rejects(createMessage(ARGS), /AccessDeniedException/);
  assert.equal(calls.send, 1);
});

test("no retry once the time budget is nearly spent", async (t) => {
  // The first attempt burns 27 of the 30 seconds before failing. A retry could
  // not finish inside the budget, so it is not started.
  let clock = 1_000_000;
  t.mock.method(Date, "now", () => clock);
  const calls = harness([]);
  __setAiClientTestHooks({
    bedrockClient: {
      async send() {
        calls.send += 1;
        clock += 27_000;
        throw sdkError("ServiceUnavailableException", 503);
      },
    },
    meter: (row) => calls.meter.push(row),
    sleep: async (ms) => calls.sleeps.push(ms),
    random: () => 0.5,
  });

  await assert.rejects(createMessage(ARGS), /ServiceUnavailableException/);
  assert.equal(calls.send, 1);
  assert.equal(calls.meter.length, 1);
});

/* ------------------------- classification ------------------------- */

test("transient: 5xx, throttles, overloaded, model-not-ready, socket resets", () => {
  const wrap = (cause) => Object.assign(new Error("Bedrock x: y", { cause }), { status: cause.$metadata?.httpStatusCode });
  assert.ok(isTransientModelError(wrap(sdkError("InternalServerException", 500))));
  assert.ok(isTransientModelError(wrap(sdkError("ServiceUnavailableException", 503))));
  assert.ok(isTransientModelError(wrap(sdkError("ThrottlingException", 429))));
  assert.ok(isTransientModelError(wrap(sdkError("ModelNotReadyException", 429))));
  // The direct API's overloaded response.
  assert.ok(isTransientModelError(Object.assign(new Error("Overloaded"), { status: 529, type: "overloaded_error" })));
  // Network failures carry no status at all.
  assert.ok(isTransientModelError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })));
  assert.ok(isTransientModelError(new Error("socket hang up")));
});

test("not transient: 4xx refusals and our own timeout", () => {
  assert.ok(!isTransientModelError(Object.assign(new Error("bad"), { status: 400 })));
  assert.ok(!isTransientModelError(Object.assign(new Error("credit balance is too low"), { status: 400 })));
  assert.ok(!isTransientModelError(Object.assign(new Error("no"), { status: 401 })));
  assert.ok(!isTransientModelError(sdkError("AccessDeniedException", 403)));
  assert.ok(!isTransientModelError(sdkError("ResourceNotFoundException", 404)));
  const abort = new Error("The operation was aborted");
  abort.name = "AbortError";
  assert.ok(!isTransientModelError(abort));
  assert.ok(!isTransientModelError(new Error("something else entirely")));
});

test("backoff grows exponentially, with jitter between 50% and 100%", () => {
  assert.equal(retryDelayMs(1, () => 0), 250);
  assert.equal(retryDelayMs(1, () => 1), 500);
  assert.equal(retryDelayMs(2, () => 0), 500);
  assert.equal(retryDelayMs(2, () => 1), 1000);
  // Capped, however many retries a future setting allows.
  assert.equal(retryDelayMs(10, () => 1), 4000);
});
