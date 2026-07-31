/**
 * Edge resources, which MUST live in us-east-1:
 *   - the ACM certificate, because CloudFront accepts certificates from
 *     us-east-1 and nowhere else
 *   - the Route 53 hosted zone, kept alongside it so DNS validation needs no
 *     cross-region reference to resolve
 *
 * Route 53 is a global service; the zone is reachable from any region. Putting
 * it here simply keeps the validation records in the same stack as the cert.
 *
 * Cost: hosted zone $0.50/month. Public ACM certificates are free.
 */

import { Stack, StackProps, RemovalPolicy, CfnOutput, Fn } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { AdlmConfig } from "../config.js";

export interface AdlmEdgeStackProps extends StackProps {
  config: AdlmConfig;
}

export class AdlmEdgeStack extends Stack {
  readonly zone: route53.IHostedZone;
  readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: AdlmEdgeStackProps) {
    super(scope, id, props);
    const cfg = props.config;

    /* Creating this zone changes NOTHING until nameservers are delegated:
     * adlmstudio.net is currently served elsewhere (Vercel or the registrar).
     * Replicate every existing record into this zone BEFORE delegating —
     * delegation is the slowest-propagating step in the whole migration, and
     * anything missing here goes dark while it propagates. See the runbook. */
    const zone = new route53.PublicHostedZone(this, "Zone", {
      zoneName: cfg.domainName,
      comment: "ADLM Cloud — created during the Render→AWS migration",
    });
    // Never let a stack teardown delete the zone: recreating it issues NEW
    // nameservers, which means another full delegation wait.
    zone.applyRemovalPolicy(RemovalPolicy.RETAIN);

    /* DNS-validated, so it issues without the domain being live anywhere —
     * the validation CNAME goes into the zone above. */
    const certificate = new acm.Certificate(this, "ApiCert", {
      domainName: cfg.apiHostname,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    this.zone = zone;
    this.certificateArn = certificate.certificateArn;

    new CfnOutput(this, "HostedZoneId", { value: zone.hostedZoneId });
    new CfnOutput(this, "NameServers", {
      // hostedZoneNameServers is a CloudFormation token LIST, not a JS array —
      // Array.prototype.join on it throws at synth time. Fn.join defers the
      // concatenation to CloudFormation, which is the only place the real
      // values exist.
      value: Fn.join(",", zone.hostedZoneNameServers ?? []),
      description:
        "Delegate to these ONLY after replicating the existing DNS records.",
    });
    new CfnOutput(this, "CertificateArn", { value: certificate.certificateArn });
  }
}
