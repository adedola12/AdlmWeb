// infra/lambda/dmarc/index.mjs
//
// Runs for every email SES receives at the DMARC report address. SES has
// already stored the raw message in S3 (the rule's first action); this reads
// it back, parses the reports, keeps a small JSON summary beside it, and
// emails the ops inbox when any message failed authentication.

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { reportsFromEmail, summarize, alertText } from "./parse.mjs";

const s3 = new S3Client({});
const sns = new SNSClient({});

const BUCKET = process.env.BUCKET;
const RAW_PREFIX = process.env.RAW_PREFIX || "raw/";
const TOPIC_ARN = process.env.TOPIC_ARN;

export async function handler(event) {
  const results = [];
  for (const rec of event?.Records || []) {
    const mail = rec?.ses?.mail || {};
    const receipt = rec?.ses?.receipt || {};
    const messageId = mail.messageId;
    if (!messageId) continue;

    if (receipt.virusVerdict?.status === "FAIL") {
      console.warn(`[dmarc] ${messageId} skipped: virus verdict FAIL`);
      continue;
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${RAW_PREFIX}${messageId}` }));
    const raw = Buffer.from(await obj.Body.transformToByteArray()).toString("binary");
    const reports = reportsFromEmail(raw);
    if (!reports.length) {
      console.warn(`[dmarc] ${messageId} from ${mail.source || "?"} held no aggregate report`);
      results.push({ messageId, reports: 0 });
      continue;
    }

    const summary = summarize(reports);
    const day = new Date().toISOString().slice(0, 10);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `parsed/${day}/${messageId}.json`,
        ContentType: "application/json",
        Body: JSON.stringify({ messageId, from: mail.source, summary, reports }, null, 1),
      }),
    );

    console.log(
      `[dmarc] ${messageId} ${summary.reporters.join(",")}: ${summary.messages} messages, ` +
        `${summary.failedMessages} failed, ${summary.failing.length} failing sources`,
    );

    if (summary.failedMessages > 0 && TOPIC_ARN) {
      await sns.send(
        new PublishCommand({
          TopicArn: TOPIC_ARN,
          Subject: `DMARC: ${summary.failedMessages} of ${summary.messages} adlmstudio.net messages failed (${summary.reporters[0]})`.slice(0, 99),
          Message: alertText(summary, messageId),
        }),
      );
    }
    results.push({ messageId, reports: reports.length, failed: summary.failedMessages });
  }
  return { ok: true, results };
}
