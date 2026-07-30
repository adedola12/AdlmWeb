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
import { AdlmConfig, reservedConcurrency } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, "..", "..", "server");

export interface AdlmApiStackProps extends StackProps {
  config: AdlmConfig;
  /** Hosted zone from the us-east-1 edge stack (cross-region reference). */
  zone: route53.IHostedZone;
  /** us-east-1 certificate ARN — CloudFront accepts no other region. */
  certificateArn: string;
}

export class AdlmApiStack extends Stack {
  constructor(scope: Construct, id: string, props: AdlmApiStackProps) {
    super(scope, id, props);
    const cfg = props.config;
    const zone = props.zone;

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "ApiCert",
      props.certificateArn,
    );

    /* ───────────────────── The function ─────────────────────
     * ARM64 (Graviton): ~20% cheaper per GB-second and measurably faster than
     * x86 for this workload. Node 22 to match engines.node.
     */
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
      reservedConcurrentExecutions: reservedConcurrency(cfg),

      environment: {
        NODE_ENV: "production",
        // lambda.js reads every SecureString under this path at cold start.
        SSM_PREFIX: cfg.ssmPrefix,
        // Must match config.mongoMaxPool: the concurrency maths assumes it.
        MONGO_MAX_POOL: String(cfg.mongoMaxPool),
        // Frontend is still on Vercel, so requests are genuinely cross-origin
        // until the frontend moves behind the same domain (Phase 4).
        CORS_ORIGINS: [
          `https://${cfg.domainName}`,
          `https://www.${cfg.domainName}`,
        ].join(","),
        // node-cron must NOT run on Lambda: every warm container would schedule
        // its own copy, and auto-renew CHARGES REAL CARDS. These jobs move to
        // EventBridge Scheduler in Phase 7.
        ENABLE_EXPIRY_CRON: "false",
        ENABLE_RENEWAL_CRON: "false",
        // Never serve the frontend from the function.
        SERVE_CLIENT: "false",
      },

      logGroup: new logs.LogGroup(this, "ApiFnLogs", {
        retention: cfg.logRetentionDays,
        removalPolicy: RemovalPolicy.RETAIN,
      }),

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
      comment: `ADLM Cloud API — ${cfg.apiHostname}`,
      domainNames: [cfg.apiHostname],
      certificate,
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

    /* ─────────────────── Outputs ─────────────────── */
    new CfnOutput(this, "FunctionUrl", {
      value: fnUrl.url,
      description: "Verify the API here BEFORE changing any DNS.",
    });
    new CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
      description: "Verify TLS + routing here, with a Host header override, before DNS.",
    });
    new CfnOutput(this, "ReservedConcurrency", {
      value: String(reservedConcurrency(cfg)),
      description: `Max ${reservedConcurrency(cfg) * cfg.mongoMaxPool} Atlas connections of ${cfg.atlasConnectionLimit}`,
    });
  }
}
