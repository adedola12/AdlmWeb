/**
 * ────────────────────────────────────────────────────────────────────────────
 * EVERY TUNABLE IN THE STACK LIVES HERE. Nothing else in infra/ hardcodes a
 * value you might need to change.
 *
 * CONFIRMED — checked against reality by the founder. Don't re-litigate these
 *   without a reason: apiHostname, atlasConnectionLimit, alarmEmail.
 *
 * CHOSEN — engineering decisions with the reasoning written alongside them,
 *   not guesses. Safe to revisit as real traffic data arrives:
 *   atlasBudgetShare, timeoutSeconds, mongoMaxPool, memoryMb, functionUrlAuth.
 *
 * The one value NOT set here is certificateArn on the external-DNS path — it
 * comes from `-c certificateArn=...` at deploy time, or is set below.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface AdlmConfig {
  /**
   * AWS account that owns the Activate credit. Resolved from the CLI's own
   * credentials at synth time, so it is whatever `aws sts get-caller-identity`
   * reports — check that before the first deploy.
   */
  account?: string;

  /** Regional resources. Full service coverage, good subsea route to Lagos. */
  region: string;

  /** CloudFront + ACM only exist in us-east-1. Not a choice. */
  edgeRegion: string;

  /** Apex domain. Route 53 hosted zone is created for this. */
  domainName: string;

   /**
   * Hostname the QUIV / HERON plugins and the Vercel frontend call.
   *
   * CONFIRMED by the founder: "api.adlmstudio.net". A domain ADLM controls,
   * so repointing DNS at this stack does rescue the locked-out plugins —
   * which would NOT have been true had they called *.onrender.com directly.
   */
  apiHostname: string;

  /**
   * SSM Parameter Store namespace holding the SecureStrings. Standard
   * parameters are free; do NOT create advanced ones.
   * Every parameter directly under this path is loaded into process.env at
   * cold start under its leaf name (e.g. .../MONGO_URI -> process.env.MONGO_URI).
   */
  ssmPrefix: string;

  /**
   * Atlas connection ceiling for the MAIN cluster.
   *
   * CONFIRMED by the founder: M10 => 1500 connections.
   * Tier reference if the cluster is ever resized:
   * M0/M2/M5 = 500, M10 = 1500, M20/M30 = 3000, M40 = 6000.
   */
  atlasConnectionLimit: number;

  /**
   * Mongoose maxPoolSize per Lambda container. Must match MONGO_MAX_POOL
   * (server/db.js default is 5). A container serves one request at a time,
   * so a big pool buys nothing here.
   */
  mongoMaxPool: number;

  /**
   * Share of the Atlas connection limit this Lambda may consume. The rest is
   * headroom for the WPF desktop app, Compass, admin scripts and the old
   * Render service during a parallel run.
   *
   * CHOSEN: 0.25 (25%). Deliberately conservative — raise it only once Atlas
   * shows connection headroom AND CloudWatch shows Lambda throttles.
   */
  atlasBudgetShare: number;

  /**
   * Whether to pin reserved concurrency on the functions.
   *
   * FALSE by default, because a new AWS account's total concurrent-execution
   * quota is 10, and AWS rejects any reservation that would leave fewer than
   * 10 unreserved — so every reservation fails, including a reservation of 1.
   *
   * Leaving it off is safe: the account quota itself becomes the ceiling, and
   * at 10 containers x mongoMaxPool 5 that is 50 Atlas connections, far below
   * the 375 the reservation was designed to enforce. The guard is redundant
   * while the quota is this low.
   *
   * Turn this ON once the Lambda "Concurrent executions" quota is raised
   * (Service Quotas -> Lambda -> L-B99A9384). Check the current value with:
   *   aws service-quotas get-service-quota --region eu-west-1 \
   *     --service-code lambda --quota-code L-B99A9384
   * It needs to be at least reservedConcurrency() + 10 for the deploy to pass.
   */
  useReservedConcurrency: boolean;

  /**
   * Lambda memory (MB) — which on Lambda also buys CPU, proportionally.
   *
   * 2048 rather than 1024 because cold start here is dominated by parsing an
   * 8MB bundle, and that is CPU-bound. A full vCPU arrives at ~1769MB, so
   * this sits just above the threshold; going higher buys little, since
   * module init is single-threaded.
   *
   * It does NOT double the bill at this scale. The permanent free tier is
   * 400,000 GB-seconds/month; at 2GB and ~0.3s per warm request that is well
   * over half a million requests a month before anything is chargeable.
   */
  memoryMb: number;

  /**
   * Lambda timeout (seconds).
   *
   * DEVIATION FROM THE PLAN, WHICH SAID 30s. The AI agent path
   * (ADLM_AI_TIMEOUT_MS, default 45000) has a MEASURED uncached call of 22.8s
   * and allows up to 45s, so a 30s function timeout would cut off real
   * requests. 60s also matches the CloudFront origin timeout below.
   * Drop this to 30 once /agent/* moves off the main function.
   */
  timeoutSeconds: number;

  /**
   * CloudFront origin response timeout (seconds). Default is 30, hard max is
   * 60 without a quota increase. Must be >= the slowest real request.
   */
  originTimeoutSeconds: number;

  /** CloudWatch log retention. Log groups never expire by default — that bill grows silently. */
  logRetentionDays: number;

  /**
   * Alarm destination. CONFIRMED by the founder.
   *
   * A subscription confirmation email is sent on first deploy and MUST be
   * clicked, or no alarm ever reaches anyone. This is the single easiest thing
   * in the whole stack to get silently wrong: everything looks deployed and
   * healthy, and then nothing tells you when it isn't.
   */
  alarmEmail: string;

  /**
   * DNS strategy.
   *
   * true  — EXTERNAL DNS (recommended for the emergency restore). No Route 53
   *         hosted zone is created and no nameservers are delegated. You add
   *         one CNAME for `apiHostname` at whichever provider serves
   *         adlmstudio.net today, pointing at the CloudFront domain this stack
   *         outputs. Vercel's records are never touched, so the frontend
   *         cannot go dark from a missed record, and rollback is editing that
   *         one CNAME back — not waiting for nameserver propagation.
   *
   *         Requires `certificateArn`: with no hosted zone, CDK cannot
   *         DNS-validate a certificate for you. Issue it out of band first
   *         (§3a of the runbook) so a pending validation can never stall or
   *         roll back a deploy mid-outage.
   *
   * false — ROUTE 53. Creates the hosted zone, issues and validates the
   *         certificate automatically, and writes A/AAAA alias records.
   *         Requires delegating nameservers, which is the slowest-propagating
   *         and least reversible step in the migration. Switch to this later,
   *         calmly, once the outage is over.
   */
  useExternalDns: boolean;

  /**
   * Pre-issued us-east-1 certificate ARN covering `apiHostname`.
   * Required when `useExternalDns` is true; ignored when it is false.
   * Overridable at deploy time with `-c certificateArn=arn:aws:acm:...`.
   */
  certificateArn?: string;

  /**
   * Function URL auth.
   *
   * "NONE"  — the Function URL is publicly reachable. Required for the
   *           plan's "verify against a Function URL directly" step, and it
   *           leaves a working fallback hostname if CloudFront misbehaves
   *           mid-outage. Same exposure as adlmweb.onrender.com has today,
   *           and every protected route still enforces its own JWT auth.
   * "AWS_IAM" — only CloudFront (via OAC, SigV4-signed) can reach the
   *           function. Tighter. Switch to this after the soak.
   */
  functionUrlAuth: "NONE" | "AWS_IAM";
}

export const config: AdlmConfig = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "eu-west-1",
  edgeRegion: "us-east-1",

  domainName: "adlmstudio.net",
  apiHostname: "api.adlmstudio.net", // CONFIRMED

  ssmPrefix: "/adlm/cloud/prod",

  atlasConnectionLimit: 1500, // CONFIRMED — M10
  mongoMaxPool: 5,
  atlasBudgetShare: 0.25,

  // Off until the account's Lambda concurrency quota is raised above 10.
  useReservedConcurrency: false,

  memoryMb: 2048,
  timeoutSeconds: 60,
  originTimeoutSeconds: 60,
  logRetentionDays: 30,

  alarmEmail: "admin@adlmstudio.net", // CONFIRMED

  // Emergency restore: touch as little DNS as possible. See the doc above.
  useExternalDns: true,
  certificateArn: undefined, // set here, or pass -c certificateArn=...

  functionUrlAuth: "NONE",
};

/**
 * Reserved concurrency, derived rather than guessed.
 *
 *   containers x maxPoolSize <= atlasConnectionLimit x budgetShare
 *
 * With the confirmed M10 limit: floor(1500 x 0.25 / 5) = 75 containers,
 * worst case 375 Atlas connections — plus 5 for the scheduled-jobs function,
 * so 380 of 1500. The remaining ~1120 are headroom for the WPF desktop app,
 * Compass, admin scripts, and Render during a parallel run.
 *
 * This is a CEILING, not a reservation of capacity — it also caps the blast
 * radius of a traffic spike or a retry storm against Atlas. If you raise the
 * Atlas tier, raise this; if you see Lambda throttles in CloudWatch while
 * Atlas has headroom, raise budgetShare.
 */
export function reservedConcurrency(c: AdlmConfig = config): number {
  return Math.max(
    1,
    Math.floor((c.atlasConnectionLimit * c.atlasBudgetShare) / c.mongoMaxPool),
  );
}
