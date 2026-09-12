// server/util/sesTransport.js
//
// SES directly, instead of through a reseller.
//
// This is less of a change than it looks. Resend already sends this domain's
// mail through SES — `send.adlmstudio.net` publishes an SPF of
// `include:amazonses.com` and an MX of `feedback-smtp.eu-west-1.amazonses.com`,
// which is SES in Ireland wearing somebody else's name. What this file removes
// is the middleman and the API key, not the mail platform.
//
// THE REGION IS NOT A DETAIL
//
// SES is regional in the way that matters most: a verified identity exists in
// ONE region, and sandbox status is granted per region too. Production access
// in us-east-1 buys this function nothing, because this function runs in
// eu-west-1. So the identity lives where the Lambda lives, and the default
// below matches infra/config.ts rather than the SDK's own idea of a default.
//
// THERE IS NO CREDENTIAL
//
// The Lambda's execution role is the credential. Nothing to put in SSM,
// nothing to rotate, nothing that can leak out of a log line — which is the
// real reason to prefer this over both the Resend key and the Gmail app
// password it currently falls back to. Locally it picks up whatever the AWS
// CLI is configured with, and fails loudly if that is nothing.
//
// SIMPLE CONTENT, NOT RAW MIME
//
// SES assembles the message. Attachments, custom headers and a text
// alternative are all expressible in the Simple shape now, so hand-rolling
// MIME would buy nothing but a class of bug — a malformed boundary is not the
// kind of thing you find in staging.

import {
  SESv2Client,
  SendEmailCommand,
  GetAccountCommand,
} from "@aws-sdk/client-sesv2";

// Lambda sets AWS_REGION for us; the literal is only for local runs, and it is
// eu-west-1 because that is where the API and its SES identity are.
const SES_REGION =
  process.env.SES_REGION || process.env.AWS_REGION || "eu-west-1";

const asArray = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean);

let _client = null;
function ses() {
  if (!_client) _client = new SESv2Client({ region: SES_REGION });
  return _client;
}

/**
 * Whether SES should carry the mail.
 *
 * Read at call time, never captured at import: on Lambda the SSM secrets land
 * in process.env at cold start, potentially after this module was already
 * loaded, and a flag frozen at import would read as unset on the very first
 * invocation. util/videoNotifier.js learned this the hard way with DRY_RUN.
 */
export const isSesSelected = () =>
  /^ses$/i.test(String(process.env.MAIL_TRANSPORT || "").trim());

/**
 * The configuration set, if one is configured.
 *
 * Optional on purpose: mail must go out whether or not the event pipeline
 * exists yet. Once a set is attached, bounce and complaint events get a
 * destination and the account's reputation becomes something you can watch
 * rather than something you find out about.
 */
const configurationSet = () =>
  String(process.env.SES_CONFIGURATION_SET || "").trim();

/**
 * The configuration set that measures opens and clicks.
 *
 * A SECOND set, used only by campaign mail. The default set above is attached
 * to the email identity, so subscribing THAT one to open and click events
 * turns tracking on for everything the domain sends - and SES implements
 * tracking by rewriting every link through awstrack.me. On 12 Sep 2026 that
 * went live for an hour and put AWS tracking links inside password-reset and
 * sign-in security-code mail, which is both alarming to read and blocked by
 * corporate filters.
 *
 * So campaigns name this set explicitly and nothing else does. Receipts,
 * resets and security codes keep clean links and are never measured.
 *
 * Empty when the stack has not deployed it, in which case a campaign sends on
 * the default set and simply is not tracked - the send still goes.
 */
const marketingConfigurationSet = () =>
  String(process.env.SES_MARKETING_CONFIGURATION_SET || "").trim();

/* ─────────────────────────────────────────────────────── the send rate ── */

/**
 * How fast this account is actually allowed to send.
 *
 * Asked of SES rather than guessed, because the answer changes underneath us
 * exactly when it matters most: a sandboxed account is capped at 1/second, an
 * account that has just been granted production access jumps to a much higher
 * figure, and a hardcoded number would either throttle everything forever or
 * start failing sends the moment somebody requests an increase.
 *
 * Cached for the life of the container. A warm Lambda that spent the morning
 * believing yesterday's rate is not a problem worth an API call per message —
 * the pool that consumes this treats it as a ceiling, not a promise, and SES
 * throttling is retried anyway.
 */
let _rate = null;
let _rateAt = 0;
const RATE_TTL_MS = 15 * 60 * 1000;

export async function sendRatePerSecond() {
  const override = Number(process.env.MAIL_SEND_RATE_PER_SEC);
  if (Number.isFinite(override) && override > 0) return override;

  const now = Date.now();
  if (_rate && now - _rateAt < RATE_TTL_MS) return _rate;

  try {
    const acct = await ses().send(new GetAccountCommand({}));
    const max = Number(acct?.SendQuota?.MaxSendRate);
    if (Number.isFinite(max) && max > 0) {
      // Ninety per cent, floor 1. The quota is a hard edge SES enforces per
      // second, and hugging it exactly means every burst spends its time in
      // retry — the last ten per cent costs nothing worth having.
      _rate = Math.max(1, Math.floor(max * 0.9));
      _rateAt = now;
      return _rate;
    }
  } catch (err) {
    // A rate we could not read is not a reason to stop sending. Fall through
    // to the conservative default and let the sends themselves discover the
    // real limit through throttling.
    console.warn("[ses] could not read send quota:", err?.message || err);
  }

  return Number(process.env.MAIL_SEND_RATE_FALLBACK) || 1;
}

/** Exposed for tests, and for anything that needs a fresh answer after a quota change. */
export function forgetSendRate() {
  _rate = null;
  _rateAt = 0;
}

/* ───────────────────────────────────────────────────────────── sending ── */

/**
 * One message.
 *
 * `bcc` goes in the Destination rather than in a header, so the address is
 * never written into the message the recipient can read. That matters here:
 * the internal mailbox is BCC'd on customer mail precisely so there is a
 * record, and a record that leaks the studio's own address to every customer
 * is a different feature.
 *
 * `listUnsubscribe` becomes the pair of headers Gmail and Yahoo now require of
 * bulk senders. It is only ever passed by the senders that have a real
 * per-recipient opt-out URL — putting one on a receipt would be a lie, since
 * nobody can unsubscribe from being told their card was charged.
 */
export function sesSendInput({
  from,
  to,
  bcc,
  replyTo,
  subject,
  html,
  text,
  attachments,
  listUnsubscribe,
  configurationSetName,
}) {
  const Simple = {
    Subject: { Data: subject || "", Charset: "UTF-8" },
    Body: {
      Html: { Data: html || "", Charset: "UTF-8" },
      ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
    },
  };

  if (listUnsubscribe) {
    Simple.Headers = [
      { Name: "List-Unsubscribe", Value: `<${listUnsubscribe}>` },
      // One-click. The unsubscribe routes are deliberately built as "GET
      // shows, POST does" (routes/unsubscribe.js), which is exactly the shape
      // a mailbox provider's one-click POST needs — so this header promises
      // something the app already honours.
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ];
  }

  if (Array.isArray(attachments) && attachments.length) {
    // The rest of the app passes attachment bodies as base64 strings, because
    // that is what the Resend API wanted. The SDK wants bytes and does its own
    // encoding, so decode here rather than changing twenty call sites.
    Simple.Attachments = attachments.map((a) => ({
      FileName: a.filename,
      RawContent: Buffer.from(a.content, "base64"),
      ContentDisposition: "ATTACHMENT",
    }));
  }

  return {
    FromEmailAddress: from,
    Destination: {
      ToAddresses: asArray(to),
      ...(bcc ? { BccAddresses: asArray(bcc) } : {}),
    },
    ...(replyTo ? { ReplyToAddresses: asArray(replyTo) } : {}),
    ...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
    Content: { Simple },
  };
}

/**
 * Build it and send it.
 *
 * Kept separate from sesSendInput above so the shape of the request — which
 * addresses end up where, how an attachment is encoded, whether the
 * unsubscribe headers are present — is testable without a network, an account
 * or a verified identity. The half that cannot be tested that way is one line
 * long, which is the point.
 */
export async function sendViaSes(message) {
  // `tracked` is the campaign paths asking to be measured. Anything else gets
  // the default set, which carries bounces and complaints and nothing else.
  const set = message?.tracked
    ? marketingConfigurationSet() || configurationSet()
    : configurationSet();

  const out = await ses().send(
    new SendEmailCommand(sesSendInput({ ...message, configurationSetName: set })),
  );
  return out?.MessageId || "";
}

/**
 * Whether a failure is worth trying again.
 *
 * Throttling and the transient 5xx family are; a rejected message, an
 * unverified sender or a suppressed recipient are not — those fail identically
 * on every attempt, and retrying them only delays everybody queued behind.
 * The SDK already retries throttling on its own, so this is the second line:
 * it tells the send pool whether to give the message another turn.
 */
export function isRetryableSesError(err) {
  const name = String(err?.name || "");
  if (/Throttling|TooManyRequests|LimitExceeded/i.test(name)) return true;
  const status = Number(err?.$metadata?.httpStatusCode);
  return status >= 500 && status < 600;
}
