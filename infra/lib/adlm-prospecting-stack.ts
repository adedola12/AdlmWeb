// infra/lib/adlm-prospecting-stack.ts
//
// Outbound prospecting's daily run (docs/PROSPECTING.md).
//
//   ProspectingFn        server/prospectingJob.js: the prospect finder (Claude
//                        with web search, then Hunter.io), then the email
//                        writer (Bedrock). Writes drafts for review. Sends
//                        nothing.
//   DailySchedule        EventBridge Scheduler, 07:00 Africa/Lagos, so the
//                        drafts are in the review queue by the working day.
//   ScheduleDlq          where a run that could not be invoked lands.
//   AlarmTopic + alarms  an email when a run fails or dead-letters.
//
// SEPARATE FROM AdlmApi ON PURPOSE. AdlmApi is shared by every branch, and a
// deploy from a checkout that lacks another branch's resources deletes them
// (it destroyed the SES identity three times on 12 Sep 2026). This stack owns
// only its own resources and references nothing in AdlmApi, so deploying
// either can never remove the other. Deploy alone:
//   npx cdk diff AdlmProspecting
//   npx cdk deploy AdlmProspecting
//
// DEPLOYING DOES NOT SWITCH IT ON. The function reads PROSPECTING_ENABLED from
// SSM (under cfg.ssmPrefix) and does nothing unless it is "true". Secrets
// (MONGO_URI, ANTHROPIC_API_KEY, HUNTER_API_KEY) come from the same SSM
// prefix as the API, as SecureStrings; none are in this template.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy, TimeZone } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as schedulerTargets from "aws-cdk-lib/aws-scheduler-targets";
import { AdlmConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, "..", "..", "server");

// Forward slashes, so the copy command reads the same on Windows and Linux.
const posix = (p: string) => p.split(path.sep).join("/");

export interface AdlmProspectingStackProps extends StackProps {
  config: AdlmConfig;
}

export class AdlmProspectingStack extends Stack {
  constructor(scope: Construct, id: string, props: AdlmProspectingStackProps) {
    super(scope, id, props);
    const cfg = props.config;

    const logGroup = new logs.LogGroup(this, "ProspectingFnLogs", {
      retention: cfg.logRetentionDays,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const fn = new NodejsFunction(this, "ProspectingFn", {
      description: "Outbound prospecting daily run - finds firms and drafts emails for review. Sends nothing.",
      entry: path.join(SERVER_DIR, "prospectingJob.js"),
      handler: "handler",
      projectRoot: SERVER_DIR,
      depsLockFilePath: path.join(SERVER_DIR, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,

      // Research calls with web search can take minutes each, three profiles
      // a day, then up to 20 drafts. 14 minutes, under the 20-minute Mongo
      // job-lock TTL in prospectingJob.js, so a run that times out cannot
      // leave the lock held past the point a new run would want it.
      timeout: Duration.minutes(14),

      // No reserved concurrency, deliberately: the account's concurrency
      // quota is low (see config.useReservedConcurrency) and a reservation
      // here would come out of the API's headroom. The Mongo job lock is what
      // stops two runs overlapping.

      environment: {
        NODE_ENV: "production",
        SSM_PREFIX: cfg.ssmPrefix,
        MONGO_MAX_POOL: "2",
        NODE_OPTIONS: "--enable-source-maps",
        // Set here, not in SSM, for the reason given on config.agentProvider:
        // the loader never overwrites a variable that is already set, and SSM
        // still holds a stale "anthropic". The writer runs on this provider;
        // the research call always uses the Anthropic API directly.
        AGENT_PROVIDER: cfg.agentProvider,
        // products.md is copied beside the bundle by the hook below.
        PROSPECT_BRIEFS_PATH: "/var/task/products.md",
      },

      logGroup,

      bundling: {
        externalModules: [],
        minify: true,
        sourceMap: true,
        sourcesContent: false,
        target: "node22",
        format: OutputFormat.ESM,
        banner:
          "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" +
          "import{fileURLToPath as __f}from'url';import{dirname as __d}from'path';" +
          "const __filename=__f(import.meta.url);const __dirname=__d(__filename);",
        // The product briefs are read at run time, so they travel with the
        // code. A deploy is what publishes an edited brief.
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `node -e "require('fs').copyFileSync('${posix(inputDir)}/config/products.md','${posix(outputDir)}/products.md')"`,
          ],
        },
      },
    });

    // Read every parameter under the prefix (the secrets and the switch).
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter${cfg.ssmPrefix}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter${cfg.ssmPrefix}/*`,
        ],
      }),
    );
    // SecureStrings use the AWS-managed SSM key; decrypt only via SSM.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: { StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` } },
      }),
    );
    // The email writer on Bedrock: the cross-region inference profile AND the
    // foundation model it routes to, Anthropic models only (same grant as the
    // API function, for the reason written there).
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
        ],
      }),
    );

    /* A run that fails to be invoked lands here rather than vanishing. The
     * alarm below is its consumer. */
    const dlq = new sqs.Queue(this, "ScheduleDlq", {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    const schedule = new scheduler.Schedule(this, "DailySchedule", {
      description: "Outbound prospecting - daily find and draft run, 07:00 Lagos",
      schedule: scheduler.ScheduleExpression.cron({
        minute: "0",
        hour: "7",
        day: "*",
        month: "*",
        timeZone: TimeZone.of("Africa/Lagos"),
      }),
      target: new schedulerTargets.LambdaInvoke(fn, {
        input: scheduler.ScheduleTargetInput.fromObject({ job: "prospecting-daily" }),
        // No retry: a retry repeats paid research calls, and the dedupe and
        // daily cap make a missed day cheap to recover (tomorrow's run, or an
        // invoke by hand). A failure alarms instead.
        retryAttempts: 0,
        maxEventAge: Duration.hours(1),
        deadLetterQueue: dlq,
      }),
    });

    /* Alarms, by email: one operator, no on-call rotation. The subscription
     * must be confirmed from the email AWS sends after the first deploy, or
     * the alarms fire into nothing. */
    const topic = new sns.Topic(this, "AlarmTopic", { displayName: "ADLM prospecting alarms" });
    topic.addSubscription(new subscriptions.EmailSubscription(cfg.alarmEmail));
    const notify = new actions.SnsAction(topic);

    const errors = new cloudwatch.Alarm(this, "RunErrorsAlarm", {
      alarmDescription:
        "The prospecting daily run failed - usually no Anthropic credit, a missing key, or every profile failing research. " +
        "Read the ProspectingFn log group for the run.",
      metric: fn.metricErrors({ period: Duration.hours(1), statistic: "Sum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const dead = new cloudwatch.Alarm(this, "ScheduleDlqAlarm", {
      alarmDescription: "The prospecting schedule could not invoke its function. Check the queue, then invoke by hand.",
      metric: dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: "Maximum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errors.addAlarmAction(notify);
    dead.addAlarmAction(notify);

    new CfnOutput(this, "ProspectingFunctionName", { value: fn.functionName });
    new CfnOutput(this, "ProspectingLogGroup", { value: logGroup.logGroupName });
    new CfnOutput(this, "ProspectingScheduleName", { value: schedule.scheduleName });
    new CfnOutput(this, "ProspectingDlqUrl", { value: dlq.queueUrl });
  }
}
