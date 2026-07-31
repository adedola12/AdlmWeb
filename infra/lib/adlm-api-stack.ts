/**
 * ADLM Cloud API — Lambda + Function URL + CloudFront.
 *
 * Emergency-restore scope: this stack serves the EXISTING Express app (all 441
 * route handlers) on the hostname the QUIV/HERON plugins and the Vercel
 * frontend already call. The frontend stays on Vercel for now — it is up, and
 * moving it during an outage buys nothing.
 *
 * Deliberately NOT in this stack:
 *   - S3 + frontend origin (Phase 4; the frontend is still on Vercel)
 *   - EventBridge Scheduler for the two cron jobs (Phase 7 — note that until
 *     then, NOTHING runs the 08:00 auto-renew or 09:00 expiry-notifier jobs)
 *   - SQS workers, Textract, Bedrock (Phase 7)
 *
 * Cost at ADLM's scale, after the Activate credit expires:
 *   Lambda        1M req + 400k GB-s/month free, permanently        $0.00
 *   Function URL  no charge                                         $0.00
 *   CloudFront    1TB egress + 10M requests/month free, permanently $0.00
 *   ACM           public certs are free                             $0.00
 *   SSM           standard parameters are free                      $0.00
 *   CloudWatch    5GB logs/month free; 30-day retention caps growth ~$0.00
 *   Route 53      hosted zone                                       $0.50/mo
 *   ---------------------------------------------------------------------
 *   Total recurring                                        ~$0.50/month
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
  TimeZone,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as schedulerTargets from "aws-cdk-lib/aws-scheduler-targets";
import { AdlmConfig, reservedConcurrency } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, "..", "..", "server");

export interface AdlmApiStackProps extends StackProps {
  config: AdlmConfig;
  /**
   * Hosted zone from the us-east-1 edge stack (cross-region reference).
   * Undefined when config.useExternalDns is true — no zone exists, and the
   * CNAME is created by hand at whichever provider serves the domain today.
   */
  zone?: route53.IHostedZone;
  /**
   * us-east-1 certificate ARN — CloudFront accepts no other region.
   *
   * Optional. Omit it and the distribution serves ONLY on its own
   * *.cloudfront.net name, which already has a valid AWS certificate. That is
   * the fastest way live: deploy, point the frontend at the CloudFront domain,
   * done — no certificate to issue, no DNS record, no waiting. Add the ARN
   * later to attach api.adlmstudio.net.
   */
  certificateArn?: string;
}

export class AdlmApiStack extends Stack {
  constructor(scope: Construct, id: string, props: AdlmApiStackProps) {
    super(scope, id, props);
    const cfg = props.config;
    const zone = props.zone;

    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(this, "ApiCert", props.certificateArn)
      : undefined;

    /* ───────────────────── The function ─────────────────────
     * ARM64 (Graviton): ~20% cheaper per GB-second and measurably faster than
     * x86 for this workload. Node 22 to match engines.node.
     */

    // Hoisted out of the function props so its name can be a stack output.
    // Because this is an explicit LogGroup rather than the one Lambda creates
    // implicitly, the name is CloudFormation-generated — it is NOT
    // /aws/lambda/<function name>, and tailing that path finds nothing.
    const apiLogs = new logs.LogGroup(this, "ApiFnLogs", {
      retention: cfg.logRetentionDays,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const fn = new NodejsFunction(this, "ApiFn", {
      entry: path.join(SERVER_DIR, "lambda.js"),
      handler: "handler",
      // The app lives in server/, not in infra/. These two tell CDK where the
      // module graph and its lockfile are, so bundling resolves the real
      // dependency tree rather than infra's.
      projectRoot: SERVER_DIR,
      depsLockFilePath: path.join(SERVER_DIR, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: cfg.memoryMb,
      timeout: Duration.seconds(cfg.timeoutSeconds),

      // A ceiling derived from the Atlas connection limit — see config.ts.
      // Omitted when the account's concurrency quota is too low to permit any
      // reservation; the quota then acts as the ceiling instead.
      ...(cfg.useReservedConcurrency
        ? { reservedConcurrentExecutions: reservedConcurrency(cfg) }
        : {}),

      environment: {
        NODE_ENV: "production",
        // lambda.js reads every SecureString under this path at cold start.
        SSM_PREFIX: cfg.ssmPrefix,
        // Must match config.mongoMaxPool: the concurrency maths assumes it.
        MONGO_MAX_POOL: String(cfg.mongoMaxPool),
        // NOTE: CORS_ORIGINS is deliberately NOT set here. It comes from SSM,
        // carrying across whatever Render was running. Hardcoding a narrower
        // list here would silently drop origins that work today — the live
        // Render value is materially longer than the two obvious site origins.
        // Migration rule: preserve working config, don't re-derive it.
        // Belt and braces. index.js already starts cron only when run
        // directly, which never happens on Lambda — but every warm container
        // scheduling its own copy of a job that CHARGES REAL CARDS is bad
        // enough to be worth two redundant env vars. The jobs run on
        // EventBridge Scheduler against ScheduledFn instead (see below).
        ENABLE_EXPIRY_CRON: "false",
        ENABLE_RENEWAL_CRON: "false",
        // Never serve the frontend from the function.
        SERVE_CLIENT: "false",
      },

      logGroup: apiLogs,

      bundling: {
        // Bundle everything, including the AWS SDK. The Node 22 runtime ships
        // its own SDK copy, but pinning the versions the app was tested
        // against is worth the extra megabytes during an outage.
        externalModules: [],
        // 16MB unminified. Every megabyte is cold-start latency, and the
        // plugins feel cold starts directly, so minify — source maps plus
        // --enable-source-maps keep CloudWatch stack traces readable anyway.
        minify: true,
        sourceMap: true,
        // The map without this is 30MB against 8MB of actual code, and Lambda
        // downloads and unpacks the whole package on every cold start — so
        // three quarters of that download was the original sources embedded
        // in the map. Dropping them keeps file/line mappings in stack traces
        // and costs only the inline source snippet.
        sourcesContent: false,
        target: "node22",
        // ESM output is REQUIRED, not a preference: index.js uses top-level
        // await, which esbuild cannot express in CommonJS.
        format: OutputFormat.ESM,
        // Express 5, Mongoose and friends are CommonJS; this shim supplies the
        // `require`/`__dirname` they expect inside an ESM bundle.
        banner:
          "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" +
          "import{fileURLToPath as __f}from'url';import{dirname as __d}from'path';" +
          "const __filename=__f(import.meta.url);const __dirname=__d(__filename);",
      },
    });
    // Source maps are useless in CloudWatch without this.
    fn.addEnvironment("NODE_OPTIONS", "--enable-source-maps");

    /* ───────────── Permission to read the secrets ─────────────
     * Scoped to this app's namespace only. GetParametersByPath is authorised
     * against the PATH, not each parameter, hence the two-ARN shape.
     */
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${cfg.region}:${this.account}:parameter${cfg.ssmPrefix}`,
          `arn:aws:ssm:${cfg.region}:${this.account}:parameter${cfg.ssmPrefix}/*`,
        ],
      }),
    );
    // SecureStrings encrypted with the AWS-managed SSM key need an explicit
    // Decrypt, constrained to calls made via SSM.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: { "kms:ViaService": `ssm.${cfg.region}.amazonaws.com` },
        },
      }),
    );

    /* ─────────────────── Function URL ───────────────────
     * The plan requires verifying the API here BEFORE any DNS change, and it
     * leaves a known-good fallback hostname if CloudFront misbehaves mid-outage.
     */
    const fnUrl = fn.addFunctionUrl({
      authType:
        cfg.functionUrlAuth === "AWS_IAM"
          ? lambda.FunctionUrlAuthType.AWS_IAM
          : lambda.FunctionUrlAuthType.NONE,
      // CORS is handled by the Express app's own cors() middleware — configuring
      // it here too would produce duplicate Access-Control-* headers, which
      // browsers reject.
    });

    /* ─────────────────── CloudFront ───────────────────
     * Terminates TLS at the edge (including Lagos), which is where the latency
     * win actually comes from, and puts the API on a hostname ADLM controls.
     */
    const distribution = new cloudfront.Distribution(this, "ApiDistribution", {
      comment: certificate
        ? `ADLM Cloud API — ${cfg.apiHostname}`
        : "ADLM Cloud API — CloudFront domain only (no custom domain yet)",
      // A custom domain requires a certificate; with neither, CloudFront serves
      // on its own *.cloudfront.net name using AWS's own certificate.
      ...(certificate
        ? { domainNames: [cfg.apiHostname], certificate }
        : {}),
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // Cheapest price class that still includes African edge locations.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,

      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(fnUrl, {
          readTimeout: Duration.seconds(cfg.originTimeoutSeconds),
          // Give a cold start room to finish rather than retrying it.
          keepaliveTimeout: Duration.seconds(60),
        }),
        // An API must never be cached. This also keeps us clear of the 1,000
        // free invalidation paths per month, since there is nothing to invalidate.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // Forwards every header except Host, plus all cookies and query
        // strings. The app needs Authorization, its custom x-adlm-* headers,
        // and the refresh-token cookie. Host is excluded because the Function
        // URL origin requires its own Host to route correctly.
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // The Express app already sets helmet's security headers and gzips via
        // compression(); re-compressing at the edge is wasted work.
        compress: false,
      },
    });

    if (zone && certificate) {
      // Route 53 path: alias records, which need the zone to be authoritative
      // for the domain — i.e. nameservers delegated.
      new route53.ARecord(this, "ApiAliasA", {
        zone,
        recordName: cfg.apiHostname,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      });
      // Plugins on IPv6-only mobile tethering are a real thing in Lagos.
      new route53.AaaaRecord(this, "ApiAliasAAAA", {
        zone,
        recordName: cfg.apiHostname,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      });
    }
    // External-DNS path creates no records at all: the single CNAME goes in by
    // hand at the current provider, using the DistributionDomain output below.
    // Note that a CNAME cannot sit on a zone apex — fine here, because this is
    // the `api` subdomain, not adlmstudio.net itself.

    /* ─────────────────── Alarms ───────────────────
     * Email, because there is one operator and no on-call rotation.
     */
    const topic = new sns.Topic(this, "AlarmTopic", {
      displayName: "ADLM Cloud API alarms",
    });
    topic.addSubscription(new subscriptions.EmailSubscription(cfg.alarmEmail));
    const notify = new actions.SnsAction(topic);

    const alarms: cloudwatch.Alarm[] = [
      new cloudwatch.Alarm(this, "ErrorsAlarm", {
        alarmDescription:
          "Lambda function errors — 5xx from the API. Check CloudWatch Logs Insights.",
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 5,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "ThrottlesAlarm", {
        alarmDescription:
          "Lambda throttled: reserved concurrency reached. Either real traffic growth " +
          "or a retry storm. Raise atlasBudgetShare only if Atlas has connection headroom.",
        metric: fn.metricThrottles({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "DurationAlarm", {
        alarmDescription:
          "p99 duration approaching the function timeout — requests are about to be cut off.",
        metric: fn.metricDuration({
          period: Duration.minutes(5),
          statistic: "p99",
        }),
        threshold: cfg.timeoutSeconds * 1000 * 0.8,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    ];
    alarms.forEach((a) => a.addAlarmAction(notify));

    /* ═══════════════ Scheduled jobs ═══════════════
     * The two jobs node-cron used to run inside the long-lived Render process.
     * They CANNOT run on the API function: every warm container would schedule
     * its own copy, and auto-renew charges real cards.
     *
     * A separate function on purpose — concurrency 1 so runs can never
     * overlap, a batch-length timeout, and its own alarms so a failed nightly
     * job is not lost inside the API's error rate.
     */
    // Hoisted for the same reason as apiLogs — see the note there.
    const scheduledLogs = new logs.LogGroup(this, "ScheduledFnLogs", {
      retention: cfg.logRetentionDays,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const scheduledFn = new NodejsFunction(this, "ScheduledFn", {
      entry: path.join(SERVER_DIR, "scheduled.js"),
      handler: "handler",
      projectRoot: SERVER_DIR,
      depsLockFilePath: path.join(SERVER_DIR, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: cfg.memoryMb,

      // 10 minutes, deliberately under the 15-minute Mongo job-lock TTL in
      // util/autoRenew.js. A timed-out run dies without releasing its lock, so
      // the TTL must be able to expire AFTER the process is definitely gone —
      // otherwise a later run could take the lock while the first still holds it.
      timeout: Duration.minutes(10),

      // Exactly one run at a time — but only when the account quota allows a
      // reservation at all. The Mongo job lock in util/autoRenew.js is the
      // real guard against overlapping runs; this was only ever the belt to
      // its braces, so losing it costs correctness nothing.
      ...(cfg.useReservedConcurrency ? { reservedConcurrentExecutions: 1 } : {}),

      environment: {
        NODE_ENV: "production",
        SSM_PREFIX: cfg.ssmPrefix,
        MONGO_MAX_POOL: String(cfg.mongoMaxPool),
        NODE_OPTIONS: "--enable-source-maps",
      },

      logGroup: scheduledLogs,

      bundling: {
        externalModules: [],
        minify: true,
        sourceMap: true,
        // The map without this is 30MB against 8MB of actual code, and Lambda
        // downloads and unpacks the whole package on every cold start — so
        // three quarters of that download was the original sources embedded
        // in the map. Dropping them keeps file/line mappings in stack traces
        // and costs only the inline source snippet.
        sourcesContent: false,
        target: "node22",
        format: OutputFormat.ESM,
        banner:
          "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" +
          "import{fileURLToPath as __f}from'url';import{dirname as __d}from'path';" +
          "const __filename=__f(import.meta.url);const __dirname=__d(__filename);",
      },
    });

    scheduledFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${cfg.region}:${this.account}:parameter${cfg.ssmPrefix}`,
          `arn:aws:ssm:${cfg.region}:${this.account}:parameter${cfg.ssmPrefix}/*`,
        ],
      }),
    );
    scheduledFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: { "kms:ViaService": `ssm.${cfg.region}.amazonaws.com` },
        },
      }),
    );

    /* A schedule that fails every retry must land somewhere visible rather
     * than evaporating. Nothing consumes this queue — the alarm below is the
     * consumer, and you drain it by hand after deciding what happened. */
    const scheduleDlq = new sqs.Queue(this, "ScheduleDlq", {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    /* EventBridge Scheduler, NOT an EventBridge Rule: rules are UTC-only,
     * whereas Scheduler understands named time zones. Africa/Lagos is UTC+1
     * with no daylight saving, so the two are equivalent today — but naming
     * the zone means these fire at 08:00 and 09:00 Lagos even if that ever
     * changes, and it documents the intent for the next reader. */
    const lagos = TimeZone.of("Africa/Lagos");

    const makeJobSchedule = (opts: {
      id: string;
      job: string;
      hour: string;
      retryAttempts: number;
      description: string;
    }) =>
      new scheduler.Schedule(this, opts.id, {
        description: opts.description,
        schedule: scheduler.ScheduleExpression.cron({
          minute: "0",
          hour: opts.hour,
          day: "*",
          month: "*",
          timeZone: lagos,
        }),
        target: new schedulerTargets.LambdaInvoke(scheduledFn, {
          input: scheduler.ScheduleTargetInput.fromObject({ job: opts.job }),
          retryAttempts: opts.retryAttempts,
          // A daily job replayed hours late is worse than one that is skipped
          // and alarmed on, so events expire rather than queue up.
          maxEventAge: Duration.hours(1),
          deadLetterQueue: scheduleDlq,
        }),
      });

    // 08:00 Lagos — runs BEFORE the expiry notifier so a user whose card
    // renews successfully never gets a same-day "expiring soon" email.
    //
    // retryAttempts: 0 is deliberate. EventBridge Scheduler is at-least-once,
    // and this job charges real cards. The renewal engine creates its Purchase
    // record before charging and caps attempts to one per day, so a retry is
    // *probably* safe — but "probably" is the wrong standard for taking money
    // from customers. A failure goes straight to the DLQ and alarms; a missed
    // day is recovered by invoking the function by hand. A double charge is
    // not recoverable that cheaply.
    makeJobSchedule({
      id: "AutoRenewSchedule",
      job: "auto-renew",
      hour: "8",
      retryAttempts: 0,
      description: "ADLM auto-renewal charges — 08:00 Africa/Lagos daily",
    });

    // 09:00 Lagos — sends "expiring soon" email. Idempotent and harmless to
    // repeat beyond a duplicate email, so retries are allowed here.
    makeJobSchedule({
      id: "ExpiryNotifierSchedule",
      job: "expiry-notifier",
      hour: "9",
      retryAttempts: 2,
      description: "ADLM entitlement expiry notifier — 09:00 Africa/Lagos daily",
    });

    /* Keep-warm ping — see config.warmIntervalMinutes for the rationale, the
     * one-container limit and the cost. Targets the API function, not
     * ScheduledFn, because it is the API's cold start users actually feel.
     *
     * No DLQ and no retries: a missed ping costs one slow sign-in, so
     * dead-lettering it would only add noise to a queue whose whole value is
     * that a message in it means something went wrong. maxEventAge is one
     * interval — a ping delivered later than that is pinging a container that
     * has already gone cold, so it should be dropped rather than replayed. */
    if (cfg.warmIntervalMinutes > 0) {
      new scheduler.Schedule(this, "ApiWarmSchedule", {
        description: `Keeps one API container and its Mongo pool warm — every ${cfg.warmIntervalMinutes} min`,
        schedule: scheduler.ScheduleExpression.rate(
          Duration.minutes(cfg.warmIntervalMinutes),
        ),
        target: new schedulerTargets.LambdaInvoke(fn, {
          input: scheduler.ScheduleTargetInput.fromObject({ __warm: true }),
          retryAttempts: 0,
          maxEventAge: Duration.minutes(cfg.warmIntervalMinutes),
        }),
      });
    }

    const scheduledErrors = new cloudwatch.Alarm(this, "ScheduledErrorsAlarm", {
      alarmDescription:
        "A nightly job threw. Auto-renew failing means entitlements silently lapse — check " +
        "the ScheduledFn log group for the run that failed.",
      metric: scheduledFn.metricErrors({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const dlqDepth = new cloudwatch.Alarm(this, "ScheduleDlqAlarm", {
      alarmDescription:
        "A scheduled job exhausted its retries and was dead-lettered. It did NOT run. " +
        "Decide what happened before re-invoking auto-renew by hand.",
      metric: scheduleDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 0,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    [scheduledErrors, dlqDepth].forEach((a) => a.addAlarmAction(notify));

    /* ─────────────────── Outputs ─────────────────── */
    new CfnOutput(this, "FunctionUrl", {
      value: fnUrl.url,
      description: "Verify the API here BEFORE changing any DNS.",
    });
    new CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
      description: cfg.useExternalDns
        ? `Verify with a Host-header override first, then add: CNAME ${cfg.apiHostname} -> this value, at your current DNS provider.`
        : "Verify TLS + routing here, with a Host header override, before DNS.",
    });
    new CfnOutput(this, "ScheduledFunctionName", {
      value: scheduledFn.functionName,
      description:
        'Invoke by hand after a dead-letter: aws lambda invoke --function-name <this> --payload \'{"job":"auto-renew"}\' out.json',
    });
    new CfnOutput(this, "ScheduleDlqUrl", {
      value: scheduleDlq.queueUrl,
      description: "Dead-lettered schedule invocations. Should always be empty.",
    });
    new CfnOutput(this, "ApiLogGroup", {
      value: apiLogs.logGroupName,
      description: `Live API logs: aws logs tail <this> --region ${cfg.region} --follow`,
    });
    new CfnOutput(this, "ScheduledLogGroup", {
      value: scheduledLogs.logGroupName,
      description: `Nightly expiry/renewal job logs: aws logs tail <this> --region ${cfg.region} --since 24h`,
    });
    new CfnOutput(this, "ReservedConcurrency", {
      value: cfg.useReservedConcurrency
        ? String(reservedConcurrency(cfg))
        : "not set — bounded by the account concurrency quota instead",
      description: cfg.useReservedConcurrency
        ? `Max ${reservedConcurrency(cfg) * cfg.mongoMaxPool} Atlas connections of ${cfg.atlasConnectionLimit}`
        : `Atlas connections are capped at (account quota) x ${cfg.mongoMaxPool}. Raise the Lambda quota, then set useReservedConcurrency: true.`,
    });
  }
}
