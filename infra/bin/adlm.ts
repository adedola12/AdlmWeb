#!/usr/bin/env node
/**
 * CDK entry point.
 *
 *   npx cdk deploy --all      deploy everything in dependency order
 *   npx cdk diff --all        show what would change
 *   npx cdk synth             render the templates without touching AWS
 *
 * Two shapes, chosen by config.useExternalDns:
 *
 *   true  (default) — ONE stack, AdlmApi. No Route 53 zone, no delegation.
 *                     Needs a pre-issued certificate ARN:
 *                       npx cdk deploy -c certificateArn=arn:aws:acm:us-east-1:...
 *
 *   false           — TWO stacks. AdlmEdge (us-east-1) creates the hosted zone
 *                     and auto-validates the certificate; AdlmApi (eu-west-1)
 *                     consumes both. CDK orders them via the cross-stack
 *                     reference, so `deploy --all` works unattended.
 */

import { App, Tags } from "aws-cdk-lib";
import { config } from "../config.js";
import { AdlmEdgeStack } from "../lib/adlm-edge-stack.js";
import { AdlmApiStack } from "../lib/adlm-api-stack.js";
import { AdlmOpsAlertsStack } from "../lib/adlm-ops-alerts-stack.js";
import { AdlmReleaseGateStack } from "../lib/adlm-release-gate-stack.js";
import { AdlmFilesStack } from "../lib/adlm-files-stack.js";

const app = new App();

// Context wins over the config file, so switching certificates never needs a
// code edit: -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/...
const certificateArnRaw = app.node.tryGetContext("certificateArn");

// An EMPTY `-c certificateArn=` is a shell accident, never an intention.
// PowerShell expands an unset $dns to nothing, so `-c certificateArn=$dns`
// silently becomes `-c certificateArn=`, which previously read as "no custom
// domain" and stripped the alias and certificate off a live CloudFront
// distribution — taking api.adlmstudio.net down with a TLS error and breaking
// every plugin. Deploying without a domain is still supported, but it has to
// be the absence of the flag, not an empty value.
if (certificateArnRaw !== undefined && String(certificateArnRaw).trim() === "") {
  throw new Error(
    "-c certificateArn= was passed with an EMPTY value.\n" +
      "That is almost always an unset shell variable. Refusing, because it would\n" +
      "remove the custom domain from a live distribution.\n\n" +
      "  Set it:      $dns = \"arn:aws:acm:us-east-1:...:certificate/...\"\n" +
      "  Check it:    \"dns = $dns\"\n" +
      "  Or omit the flag entirely to deploy without a custom domain on purpose.",
  );
}

const certificateArnOverride = certificateArnRaw;

// Lets you preview the other DNS strategy without editing code, e.g.
//   npx cdk diff --all -c useExternalDns=false
// Context arrives as a string, so compare textually. Committing to the Route 53
// path for real should still be a config.ts change, so git records the decision.
const useExternalDnsCtx = app.node.tryGetContext("useExternalDns");
const useExternalDns =
  useExternalDnsCtx === undefined
    ? config.useExternalDns
    : String(useExternalDnsCtx) !== "false";

if (useExternalDns) {
  const certificateArn = certificateArnOverride ?? config.certificateArn;

  // No certificate is a SUPPORTED, deliberate first step, not an error: the
  // distribution comes up on its own *.cloudfront.net name with AWS's
  // certificate. That gets the API live with no certificate to issue, no DNS
  // record and no waiting — point the frontend at the CloudFront domain and
  // users are back. Re-deploy with the ARN later to attach the custom domain.
  if (!certificateArn) {
    console.warn(
      "\n[adlm] No certificateArn — deploying WITHOUT a custom domain.\n" +
        "[adlm] The API will be reachable on the CloudFront domain only.\n" +
        "[adlm] Set VITE_API_BASE to that domain to go live now; add\n" +
        "[adlm] -c certificateArn=... later to attach " +
        `${config.apiHostname}.\n`,
    );
  }

  const api = new AdlmApiStack(app, "AdlmApi", {
    config,
    certificateArn,
    // No zone: the CNAME is added by hand at the existing DNS provider.
    env: { account: config.account, region: config.region },
    description:
      "ADLM Cloud - Express API on Lambda behind CloudFront (external DNS)",
  });
  addFilesStack(api);
} else {
  const edge = new AdlmEdgeStack(app, "AdlmEdge", {
    config,
    env: { account: config.account, region: config.edgeRegion },
    description:
      "ADLM Cloud - Route 53 hosted zone + CloudFront ACM certificate",
    // Required so the eu-west-1 stack can consume this stack's outputs.
    crossRegionReferences: true,
  });

  const api = new AdlmApiStack(app, "AdlmApi", {
    config,
    zone: edge.zone,
    certificateArn: certificateArnOverride ?? edge.certificateArn,
    env: { account: config.account, region: config.region },
    description: "ADLM Cloud - Express API on Lambda behind CloudFront",
    crossRegionReferences: true,
  });

  api.addStackDependency(edge);
  addFilesStack(api);
}

// The private files bucket (lib/adlm-files-stack.ts). Its own stack so an
// AdlmApi deploy can never delete people's files, and deployed before AdlmApi
// so FILES_BUCKET never names a bucket that is not there yet.
function addFilesStack(api: AdlmApiStack) {
  if (!config.filesBucket) return;
  const files = new AdlmFilesStack(app, "AdlmFiles", {
    env: { account: config.account, region: config.region },
    description: "ADLM - private files bucket (uploads and download installers), presigned access only",
    terminationProtection: true,
    // Same role as AdlmReleaseGate below; if AdlmApi is rebuilt, update both.
    apiRoleArn: "arn:aws:iam::065634457992:role/AdlmApi-ApiFnServiceRoleD18AAE0E-uu6SwJf1pQr7",
    // Keep in step with PROD_ORIGINS in server/util/corsPolicy.js.
    allowedOrigins: [
      "https://adlmstudio.net",
      "https://www.adlmstudio.net",
      "https://adlm-web.vercel.app",
      "https://preview.adlmstudio.net",
      "http://localhost:5173",
    ],
  });
  api.addStackDependency(files);
}

// Alerting lives in its own stacks, so a deploy of AdlmApi from the wrong
// checkout can never delete it. See lib/adlm-ops-alerts-stack.ts.
//
//   npx cdk bootstrap aws://<account>/us-east-1      (once, before the first deploy)
//   npx cdk deploy AdlmOpsAlerts AdlmOpsAlertsEu
//
// Then click the two AWS Notifications confirmation emails.
new AdlmOpsAlertsStack(app, "AdlmOpsAlerts", {
  // Support case updates and account-wide Health events are emitted here.
  env: { account: config.account, region: "us-east-1" },
  alertEmail: config.opsAlertEmail,
  watchSupportCases: true,
  description: "ADLM - AWS Support case updates and account-wide Health events to the ops inbox",
});
new AdlmOpsAlertsStack(app, "AdlmOpsAlertsEu", {
  env: { account: config.account, region: config.region },
  alertEmail: config.opsAlertEmail,
  watchSupportCases: false,
  digestLogGroupName: config.scheduledLogGroupName,
  dmarcReportDomain: config.dmarcReportDomain,
  description: "ADLM - regional Health events and the daily operations report watchdog",
});

// Makes the Activate credit burn-down attributable per application in Cost
// Explorer, which is what the Phase 9 cost report is built from.
Tags.of(app).add("app", "adlm-cloud");
Tags.of(app).add("env", "prod");
Tags.of(app).add("managed-by", "cdk");

// Release gate (docs/RELEASE_GATE.md): the locked audit bucket, the hourly
// watcher and the GitHub alert role. Its own stack so an AdlmApi deploy can
// never take it with it. Deploy alone:  npx cdk deploy AdlmReleaseGate
new AdlmReleaseGateStack(app, "AdlmReleaseGate", {
  env: { account: config.account, region: config.region },
  description: "ADLM release gate - locked audit trail and main-branch watcher",
  terminationProtection: true,
  repo: "adedola12/AdlmWeb",
  mailDomain: "adlmstudio.net",
  fromAddress: "ADLM Studio <notifications@adlmstudio.net>",
  ownerEmail: "admin@adlmstudio.net",
  // The API function's execution role (AdlmApi-ApiFn). It keeps its name
  // across AdlmApi deploys; if AdlmApi is ever rebuilt from scratch, update it.
  apiRoleArn: "arn:aws:iam::065634457992:role/AdlmApi-ApiFnServiceRoleD18AAE0E-uu6SwJf1pQr7",
  // Three years. COMPLIANCE mode: nobody, root included, can shorten this for
  // an object once written.
  retentionDays: 1095,
});
