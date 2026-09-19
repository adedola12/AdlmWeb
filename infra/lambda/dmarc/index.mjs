// infra/lambda/dmarc/index.mjs
//
// Runs for every email SES receives at the DMARC report address. SES has
// already stored the raw message in S3 (the rule's first action); this reads
// it back, parses the reports, keeps a small JSON summary beside it, and
// emails the ops inbox when mail from one of OUR senders (SES, Google,
// Microsoft, Kudimail) failed authentication. Failures from anywhere else are
// forgeries that p=reject already refuses, so those are only logged.

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { reverse } from "node:dns/promises";
import { reportsFromEmail, summarize, alertText, triage } from "./parse.mjs";

const s3 = new S3Client({});
const sns = new SNSClient({});

const BUCKET = process.env.BUCKET;
const RAW_PREFIX = process.env.RAW_PREFIX || "raw/";
const TOPIC_ARN = process.env.TOPIC_ARN;

// Reverse DNS for each failing IP, a couple of seconds at most per lookup.
async function hostsFor(ips) {
  const out = new Map();
  await Promise.all(
    [...new Set(ips)].slice(0, 50).map(async (ip) => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve([]), 2500));
      out.set(ip, await Promise.race([reverse(ip).catch(() => []), timeout]));
    }),
  );
  return out;
}

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
    const { ours, strangers } = triage(summary, await hostsFor(summary.failing.map((s) => s.sourceIp)));
    summary.failing = [...ours, ...strangers];
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
        `${summary.failedMessages} failed, ${summary.failing.length} failing sources ` +
        `(${ours.length} ours, ${strangers.length} forged or unknown)`,
    );

    if (ours.length && TOPIC_ARN) {
      const ourFailed = ours.reduce((n, s) => n + s.count, 0);
      await sns.send(
        new PublishCommand({
          TopicArn: TOPIC_ARN,
          Subject: `DMARC: ${ourFailed} of our own adlmstudio.net messages failed (${ours[0].sender})`.slice(0, 99),
          Message: alertText(summary, messageId),
        }),
      );
    }
    results.push({ messageId, reports: reports.length, failed: summary.failedMessages, ours: ours.length });
  }
  return { ok: true, results };
}
