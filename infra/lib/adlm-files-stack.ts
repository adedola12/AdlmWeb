/**
 * AdlmFiles — the private files bucket (owner item 13, approved 2026-09-26).
 *
 * server/util/fileStore.js stores private uploads (assignment submissions,
 * the Android APK and Installer Hub setup at their fixed download keys) in S3
 * once the API has FILES_BUCKET, and in Cloudflare R2 until then. Nothing in
 * here is public: the browser uploads with a short-lived presigned PUT and
 * downloads with a short-lived presigned GET, both signed by the API's role.
 *
 * Its own stack, like AdlmReleaseGate, so an AdlmApi deploy from a checkout
 * that does not know about it can never delete people's files. The API role
 * is granted from here by bucket policy (same account, so that is enough).
 */

import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";

/** One name, derived the same way here and in AdlmApi's FILES_BUCKET. */
export function filesBucketName(account: string, region: string): string {
  return `adlm-files-${account}-${region}`;
}

export interface AdlmFilesStackProps extends StackProps {
  /** The API function's execution role (AdlmApi-ApiFn). */
  apiRoleArn: string;
  /** Sites whose pages PUT and GET through presigned URLs. */
  allowedOrigins: string[];
}

export class AdlmFilesStack extends Stack {
  constructor(scope: Construct, id: string, props: AdlmFilesStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "FilesBucket", {
      bucketName: filesBucketName(this.account, this.region),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // An installer re-uploaded at its fixed key replaces the old one; keep
      // the previous version for a month in case a release has to go back.
      versioned: true,
      lifecycleRules: [
        { noncurrentVersionExpiration: Duration.days(30) },
        { abortIncompleteMultipartUploadAfter: Duration.days(7) },
      ],
      cors: [
        {
          allowedOrigins: props.allowedOrigins,
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          // A presigned PUT must send exactly the Content-Type it was signed for.
          allowedHeaders: ["content-type"],
          maxAge: 3000,
        },
      ],
      // People's files outlive any stack.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const apiRole = iam.Role.fromRoleArn(this, "ApiRole", props.apiRoleArn, { mutable: false });
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "ApiReadsAndWritesFiles",
        principals: [new iam.ArnPrincipal(apiRole.roleArn)],
        // GetObject also covers HeadObject.
        actions: ["s3:PutObject", "s3:GetObject"],
        resources: [bucket.arnForObjects("*")],
      }),
    );

    new CfnOutput(this, "FilesBucketName", { value: bucket.bucketName });
  }
}
