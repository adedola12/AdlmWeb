// server/mailEvents.js
// ----------------------------------------------------------------------------
// Lambda entry point for SES bounce and complaint events.
//
// SES publishes to an SNS topic (configured on the sending configuration set in
// infra/lib/adlm-api-stack.ts), and SNS invokes this function directly. There
// is deliberately NO public webhook: an HTTPS subscription would mean a URL
// anybody can POST to, signature verification we would have to get right, and
// a subscription-confirmation dance. SNS-to-Lambda has none of that — only SNS
// can invoke this function, and AWS proves it, not us.
//
// A SEPARATE function from scheduled.js, for the same reason VideoPollFn is:
// scheduled.js runs at reserved concurrency 1 so two runs of a job that CHARGES
// CARDS can never overlap. A burst of bounces arriving during a campaign would
// sit in front of the 08:00 renewal run and throttle it into the dead-letter
// queue. Bounce handling is not worth an uncharged card.
//
// Retries: SNS retries a failing Lambda, then gives up to the subscription's
// dead-letter queue. So a throw here is a real retry, which is why
// util/mailFeedback.js swallows what it cannot fix and only genuine
// infrastructure failures — no database, no secrets — are allowed to escape.
// ----------------------------------------------------------------------------

import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

const SSM_PREFIX = process.env.SSM_PREFIX || "";
const ssm = SSM_PREFIX ? new SSMClient({}) : null;

let _readyPromise = null;

async function loadSecretsIntoEnv() {
  if (!SSM_PREFIX) return;

  const path = SSM_PREFIX.endsWith("/") ? SSM_PREFIX.slice(0, -1) : SSM_PREFIX;
  let nextToken;

  do {
    const page = await ssm.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: false,
        WithDecryption: true,
        MaxResults: 10,
        NextToken: nextToken,
      }),
    );
    for (const p of page.Parameters || []) {
      const key = p.Name.slice(p.Name.lastIndexOf("/") + 1);
      if (process.env[key] === undefined) process.env[key] = p.Value;
    }
    nextToken = page.NextToken;
  } while (nextToken);
}

/** Connect once per container and reuse, as scheduled.js does. */
function ready() {
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    await loadSecretsIntoEnv();
    const { connectDB } = await import("./db.js");
    await connectDB(process.env.MONGO_URI);
    const { handleMailFeedback } = await import("./util/mailFeedback.js");
    return { handleMailFeedback };
  })().catch((err) => {
    _readyPromise = null;
    throw err;
  });

  return _readyPromise;
}

export async function handler(event, context) {
  if (context) context.callbackWaitsForEmptyEventLoop = false;

  const { handleMailFeedback } = await ready();
  const out = await handleMailFeedback(event);

  console.log(`[mail-events] handled ${out.handled} event(s)`);
  return out;
}

export default handler;
