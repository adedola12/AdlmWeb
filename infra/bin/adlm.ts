#!/usr/bin/env node
/**
 * CDK entry point.
 *
 *   npx cdk deploy --all      deploy both stacks in dependency order
 *   npx cdk diff --all        show what would change
 *   npx cdk synth             render the templates without touching AWS
 *
 * The edge stack (us-east-1) must exist before the API stack (eu-west-1)
 * because CloudFront needs its certificate. CDK enforces that ordering via the
 * cross-stack reference, so `deploy --all` does the right thing unattended.
 */

import { App, Tags } from "aws-cdk-lib";
import { config } from "../config.js";
import { AdlmEdgeStack } from "../lib/adlm-edge-stack.js";
import { AdlmApiStack } from "../lib/adlm-api-stack.js";

const app = new App();

const edge = new AdlmEdgeStack(app, "AdlmEdge", {
  config,
  env: { account: config.account, region: config.edgeRegion },
  description: "ADLM Cloud — Route 53 hosted zone + CloudFront ACM certificate",
  // Required so the eu-west-1 stack can consume this stack's outputs.
  crossRegionReferences: true,
});

const api = new AdlmApiStack(app, "AdlmApi", {
  config,
  zone: edge.zone,
  certificateArn: edge.certificateArn,
  env: { account: config.account, region: config.region },
  description: "ADLM Cloud — Express API on Lambda behind CloudFront",
  crossRegionReferences: true,
});

api.addStackDependency(edge);

// Makes the Activate credit burn-down attributable per application in Cost
// Explorer, which is what the Phase 9 cost report is built from.
Tags.of(app).add("app", "adlm-cloud");
Tags.of(app).add("env", "prod");
Tags.of(app).add("managed-by", "cdk");
