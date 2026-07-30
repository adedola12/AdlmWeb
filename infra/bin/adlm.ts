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

const app = new App();

// Context wins over the config file, so switching certificates never needs a
// code edit: -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/...
const certificateArnOverride = app.node.tryGetContext("certificateArn");

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

  new AdlmApiStack(app, "AdlmApi", {
    config,
    certificateArn,
    // No zone: the CNAME is added by hand at the existing DNS provider.
    env: { account: config.account, region: config.region },
    description:
      "ADLM Cloud — Express API on Lambda behind CloudFront (external DNS)",
  });
} else {
  const edge = new AdlmEdgeStack(app, "AdlmEdge", {
    config,
    env: { account: config.account, region: config.edgeRegion },
    description:
      "ADLM Cloud — Route 53 hosted zone + CloudFront ACM certificate",
    // Required so the eu-west-1 stack can consume this stack's outputs.
    crossRegionReferences: true,
  });

  const api = new AdlmApiStack(app, "AdlmApi", {
    config,
    zone: edge.zone,
    certificateArn: certificateArnOverride ?? edge.certificateArn,
    env: { account: config.account, region: config.region },
    description: "ADLM Cloud — Express API on Lambda behind CloudFront",
    crossRegionReferences: true,
  });

  api.addStackDependency(edge);
}

// Makes the Activate credit burn-down attributable per application in Cost
// Explorer, which is what the Phase 9 cost report is built from.
Tags.of(app).add("app", "adlm-cloud");
Tags.of(app).add("env", "prod");
Tags.of(app).add("managed-by", "cdk");
