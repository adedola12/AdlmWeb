// infra/lib/adlm-release-gate-stack.ts
//
// The AWS half of the release gate (docs/RELEASE_GATE.md).
//
//   AuditBucket   S3 with Object Lock in COMPLIANCE mode. Every gate event
//                 (release submitted, approved, forced through, approver
//                 changed, GitHub protection loosened, an unapproved commit on
//                 main) is written here. In compliance mode NO principal, the
//                 account root included, can delete or overwrite an object
//                 version until its retention ends. That is what makes the
//                 trail trustworthy to the approver: the owner cannot tidy it.
//
//   WatchFn       Hourly, independent of GitHub Actions (which the repo owner
//                 can switch off with one click). Using only GitHub's PUBLIC
//                 API it checks that main is still protected and that every
//                 new commit on main came through a pull request the approver
//                 approved. Anything else is emailed to the approver via SES.
//
//   GithubRole    Assumed by .github/workflows/release-watch.yml through the
//                 existing GitHub OIDC provider, so the instant alert on a
//                 branch-protection change needs no stored key.
//
// Separate from AdlmApi on purpose: a deploy of AdlmApi from a stale checkout
// deletes what it does not know about, and this is the one thing that must
// not quietly disappear. Deploy with:  npx cdk deploy AdlmReleaseGate
//
// The approver's email and GitHub login live in SSM under /adlm/release-gate/
// and are written by server/scripts/release-gate.mjs, not by this stack, so a
// redeploy never resets who the watcher reports to.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";

export interface AdlmReleaseGateStackProps extends StackProps {
  /**
   * The repositories the gate protects, each with the branch that ships:
   * "owner/name@branch". The watcher checks every one hourly, and each one's
   * release-watch.yml may assume the alert role from that branch only.
   */
  repos: string[];
  /** SES-verified domain the watcher sends from. */
  mailDomain: string;
  /** Sender address on that domain. */
  fromAddress: string;
  /** The owner, copied on every watcher alert. */
  ownerEmail: string;
  /** IAM role ARN of the API Lambda, which writes release events. */
  apiRoleArn: string;
  /** Object Lock retention for audit records, in days. */
  retentionDays: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARAM_PREFIX = "/adlm/release-gate";

export class AdlmReleaseGateStack extends Stack {
  constructor(scope: Construct, id: string, props: AdlmReleaseGateStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "AuditBucket", {
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(Duration.days(props.retentionDays)),
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Never tie the audit trail's life to this stack's.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const apiRole = iam.Role.fromRoleArn(this, "ApiRole", props.apiRoleArn, { mutable: false });
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "ApiWritesReleaseEvents",
        principals: [new iam.ArnPrincipal(apiRole.roleArn)],
        actions: ["s3:PutObject"],
        resources: [bucket.arnForObjects("web/*")],
      }),
    );

    // SendEmail is authorised against the identity AND the configuration set
    // the identity applies by default (MailConfigSet), so both are needed.
    const sesResources = [
      `arn:aws:ses:${this.region}:${this.account}:identity/*`,
      `arn:aws:ses:${this.region}:${this.account}:configuration-set/*`,
    ];

    // ── Hourly watcher ─────────────────────────────────────────────────────
    const watchLogs = new logs.LogGroup(this, "WatchLogs", {
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const watch = new NodejsFunction(this, "WatchFn", {
      entry: path.join(__dirname, "..", "lambda", "release-watch", "index.mjs"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(120),
      logGroup: watchLogs,
      // One run at a time, so two runs never both advance the last-seen commit.
      reservedConcurrentExecutions: 1,
      environment: {
        REPOS: props.repos.join(","),
        BUCKET: bucket.bucketName,
        PARAM_PREFIX,
        FROM: props.fromAddress,
        OWNER_EMAIL: props.ownerEmail,
      },
      bundling: { format: OutputFormat.ESM, target: "node22", minify: true, externalModules: ["@aws-sdk/*"] },
    });
    bucket.grantPut(watch, "watcher/*");
    watch.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:PutParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${PARAM_PREFIX}/*`],
      }),
    );
    watch.addToRolePolicy(new iam.PolicyStatement({ actions: ["ses:SendEmail"], resources: sesResources }));

    new events.Rule(this, "WatchHourly", {
      description: "Release gate watcher - checks main is protected and every commit was approved",
      schedule: events.Schedule.rate(Duration.hours(1)),
      targets: [new eventTargets.LambdaFunction(watch, { retryAttempts: 2 })],
    });

    // ── GitHub Actions role (instant alerts) ───────────────────────────────
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubOidc",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const githubRole = new iam.Role(this, "GithubRole", {
      roleName: "github-actions-release-watch",
      description: "Release gate watcher workflow - send alerts and write audit records",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        // Only workflows running from the shipping branch of a watched repo.
        StringLike: {
          "token.actions.githubusercontent.com:sub": props.repos.map((r) => {
            const [repo, branch] = r.split("@");
            return `repo:${repo}:ref:refs/heads/${branch || "main"}`;
          }),
        },
      }),
    });
    bucket.grantPut(githubRole, "github/*");
    githubRole.addToPolicy(new iam.PolicyStatement({ actions: ["ses:SendEmail"], resources: sesResources }));
    githubRole.addToPolicy(
      new iam.PolicyStatement({ actions: ["cloudformation:DescribeStacks"], resources: [this.stackId] }),
    );
    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${PARAM_PREFIX}/*`],
      }),
    );

    new CfnOutput(this, "AuditBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "GithubRoleArn", { value: githubRole.roleArn });
    new CfnOutput(this, "WatchFnName", { value: watch.functionName });
  }
}
