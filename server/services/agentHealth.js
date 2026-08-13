// server/services/agentHealth.js
// A small in-process record of Ada's last failure, so "is the agent broken,
// and roughly why" can be answered from GET /agent/health instead of going to
// CloudWatch. The outage this was written for looked identical from outside to
// a dozen unrelated causes: every /agent/chat returned the same 500 and the
// only thing that named the real reason was a console.error in a log group.
//
// SCOPE, DELIBERATELY SMALL: this is per-Lambda-container memory. It resets on
// a cold start, and one container knows nothing of another's failures, so it is
// a diagnostic aid and never a metric — AiUsage rows remain the durable record.
// It still answers the question that matters during an outage, because the
// failures worth chasing at 2am (a rejected key, a spent credit balance) break
// every container identically and show up on whichever one you happen to hit.
//
// WHAT IT WILL NOT DO: publish the provider's raw error text to the internet.
// /agent/health is unauthenticated and upstream errors quote request details
// back, so guests get a classification and only an admin sees the message.

/** Ordered most-specific first — the first pattern to match wins. */
const PATTERNS = [
  [
    /\b401\b|\b403\b|unauthor|not authoriz|authentication_error|invalid.{0,12}api.?key|invalid x-api-key|permission_error|accessdenied|expiredtoken|unrecognizedclient|signature/i,
    "provider_auth",
    "The AI provider rejected the credentials. On Bedrock that is the function's IAM role — check it may call bedrock:InvokeModel and that model access is enabled for the account. On the direct API, check the key is present, current and not revoked.",
  ],
  [
    /credit balance|billing|insufficient|payment|spend.{0,8}(cap|limit)|out of (credit|quota)/i,
    "provider_billing",
    "The AI provider rejected the call for billing reasons. Check the credit balance and any spend cap on the account being billed.",
  ],
  [
    /\b429\b|\b529\b|rate.?limit|throttl|overloaded|too many requests|servicequotaexceeded/i,
    "provider_rate_limit",
    "The AI provider is rate-limiting or overloaded. Usually transient — retry before changing anything. On Bedrock a persistent one means the account's per-model quota is too low.",
  ],
  [
    /mongo|buffering timed out|topology|failed to connect to server|ECONNREFUSED.*27017/i,
    "database",
    "The agent could not read the database it grounds its answers in. Check /health for the connection state.",
  ],
  [
    // The bare socket codes are word-bounded on purpose. Unanchored,
    // ENOTFOUND matches inside "ResourceNotFoundException" (resourc-enotfound-
    // exception), which would send someone to check DNS when the real answer
    // is that the Bedrock model id does not exist.
    /abort|timed? ?out|\bETIMEDOUT\b|\bENOTFOUND\b|\bECONNRESET\b|\bECONNREFUSED\b|socket hang up|fetch failed|\bnetwork\b/i,
    "provider_unreachable",
    "The call to the AI provider never completed. Check egress from the Lambda and the provider's status page.",
  ],
  [
    /\b(400|404|422)\b|invalid_request|not_found_error|validationexception|resourcenotfound|unsupported|model/i,
    "provider_rejected",
    "The AI provider rejected the request itself — most often an unknown model id (on Bedrock, one missing its regional inference-profile prefix), a malformed tool schema, or a beta header it no longer accepts.",
  ],
];

const UNKNOWN = [
  "unknown",
  "The agent threw before it could answer. The message is in the Lambda logs under \"POST /agent/chat error:\".",
];

let state = {
  lastErrorAt: 0,
  lastErrorMessage: "",
  lastErrorCode: "",
  lastErrorHint: "",
  consecutiveFailures: 0,
  lastOkAt: 0,
};

/**
 * Bucket a thrown error into a cause an operator can act on. Matching on text
 * is crude, but the alternative — plumbing status codes up through every
 * provider adapter — buys precision we do not need to answer "key, money,
 * network or code?".
 *
 * @returns {{code: string, hint: string}}
 */
export function classifyAgentError(err) {
  const msg = String(err?.message || err || "");
  for (const [re, code, hint] of PATTERNS) {
    if (re.test(msg)) return { code, hint };
  }
  return { code: UNKNOWN[0], hint: UNKNOWN[1] };
}

/** Record one failed agent turn. Never throws — it sits in a catch block. */
export function recordAgentFailure(err) {
  try {
    const { code, hint } = classifyAgentError(err);
    state.lastErrorAt = Date.now();
    state.lastErrorMessage = String(err?.message || err || "").slice(0, 300);
    state.lastErrorCode = code;
    state.lastErrorHint = hint;
    state.consecutiveFailures += 1;
  } catch {
    /* a broken health record must never break the response that carries it */
  }
}

/**
 * Record one successful agent turn. This is what makes `consecutiveFailures`
 * mean something: a stale error from an hour ago that has since recovered
 * reads very differently from one that is still happening on every message.
 */
export function recordAgentSuccess() {
  state.lastOkAt = Date.now();
  state.consecutiveFailures = 0;
}

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/**
 * Health block for GET /agent/health.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.includeMessage]  admins only — the raw provider text
 */
export function agentHealthSnapshot({ includeMessage = false } = {}) {
  const failing = state.consecutiveFailures > 0;
  return {
    // False only when a failure has happened with no success since, so this
    // stays true on a fresh container that has served nothing yet — absence of
    // evidence, not evidence of health.
    healthy: !failing,
    consecutiveFailures: state.consecutiveFailures,
    lastOkAt: iso(state.lastOkAt),
    lastErrorAt: iso(state.lastErrorAt),
    lastErrorCode: state.lastErrorCode || null,
    lastErrorHint: state.lastErrorHint || null,
    ...(includeMessage && state.lastErrorMessage
      ? { lastErrorMessage: state.lastErrorMessage }
      : {}),
    // Said out loud so nobody reads a healthy container as a healthy fleet.
    scope: "this server instance only; resets on restart",
  };
}
