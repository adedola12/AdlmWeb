// infra/lambda/dmarc/parse.test.mjs   (node --test lambda/dmarc/parse.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { reportsFromEmail, summarize, unzip, alertText, parseAggregate, ourSender, triage } from "./parse.mjs";

const XML = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>1234567890</report_id>
    <date_range><begin>1757980800</begin><end>1758067199</end></date_range>
  </report_metadata>
  <policy_published><domain>adlmstudio.net</domain><p>reject</p><sp>reject</sp><pct>100</pct></policy_published>
  <record>
    <row>
      <source_ip>54.240.3.10</source_ip>
      <count>12</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>adlmstudio.net</header_from></identifiers>
  </record>
  <record>
    <row>
      <source_ip>203.0.113.9</source_ip>
      <count>3</count>
      <policy_evaluated><disposition>reject</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>adlmstudio.net</header_from></identifiers>
  </record>
</feedback>`;

// A minimal, valid zip holding one deflated file, built by hand so the test
// needs no zip library.
function zipOf(name, content) {
  const data = zlib.deflateRawSync(Buffer.from(content));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

function email(attachment, { type, filename }) {
  const b64 = attachment.toString("base64").replace(/(.{76})/g, "$1\r\n");
  return [
    "From: noreply-dmarc-support@google.com",
    "To: dmarc@reports.adlmstudio.net",
    "Subject: Report domain: adlmstudio.net",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="XYZ"',
    "",
    "--XYZ",
    "Content-Type: text/plain",
    "",
    "This is an aggregate report.",
    "--XYZ",
    `Content-Type: ${type};`,
    `  name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    b64,
    "--XYZ--",
    "",
  ].join("\r\n");
}

test("a Google-style zipped report is found and parsed", () => {
  const raw = email(zipOf("google.com!adlmstudio.net!1!2.xml", XML), { type: "application/zip", filename: "google.com!adlmstudio.net.zip" });
  const reports = reportsFromEmail(raw);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reporter, "google.com");
  assert.equal(reports[0].domain, "adlmstudio.net");
  assert.equal(reports[0].policy, "reject");
  assert.equal(reports[0].records.length, 2);
  assert.equal(reports[0].begin, "2025-09-16T00:00:00.000Z");
});

test("a gzipped report is parsed too", () => {
  const raw = email(zlib.gzipSync(Buffer.from(XML)), { type: "application/gzip", filename: "report.xml.gz" });
  assert.equal(reportsFromEmail(raw)[0].records[1].sourceIp, "203.0.113.9");
});

test("the summary separates failing sources from passing ones", () => {
  const s = summarize([parseAggregate(XML)]);
  assert.equal(s.messages, 15);
  assert.equal(s.failedMessages, 3);
  assert.equal(s.failing.length, 1);
  assert.equal(s.failing[0].sourceIp, "203.0.113.9");
  assert.equal(s.failing[0].disposition, "reject");
  assert.equal(s.passing[0].count, 12);
});

test("passing on either SPF or DKIM is a pass", () => {
  const xml = XML.replace("<dkim>pass</dkim><spf>pass</spf>", "<dkim>fail</dkim><spf>pass</spf>");
  assert.equal(summarize([parseAggregate(xml)]).failedMessages, 3);
});

test("the alert names the failing source and what was done with it", () => {
  const text = alertText(summarize([parseAggregate(XML)]), "abc123");
  assert.match(text, /3 of 15 messages FAILED/);
  assert.match(text, /203\.0\.113\.9\s+3\s+dkim=fail\s+spf=fail\s+reject/);
  assert.match(text, /raw\/abc123/);
});

test("an email with no report yields nothing", () => {
  const raw = "From: someone@example.com\r\nContent-Type: text/plain\r\n\r\nhello";
  assert.deepEqual(reportsFromEmail(raw), []);
});

test("unzip reads the central directory", () => {
  const files = unzip(zipOf("a.xml", "<feedback/>"));
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "a.xml");
  assert.equal(files[0].content.toString(), "<feedback/>");
});

test("reverse DNS names are matched to the services that send for us", () => {
  assert.equal(ourSender(["a3-10.smtp-out.eu-west-1.amazonses.com."]), "Amazon SES");
  assert.equal(ourSender(["mail-sor-f41.google.com"]), "Google");
  assert.equal(ourSender(["mail-db8eur05on2100.outbound.protection.outlook.com"]), "Microsoft");
  assert.equal(ourSender(["95-57-1-2.broadband.kz"]), "");
  assert.equal(ourSender(["evil-google.com.example.net"]), "");
  assert.equal(ourSender([]), "");
});

test("a forged source is kept apart from our own failing mail", () => {
  const xml = XML.replace("</feedback>", `<record><row><source_ip>54.240.3.99</source_ip><count>2</count>
    <policy_evaluated><disposition>reject</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated></row>
    <identifiers><header_from>adlmstudio.net</header_from></identifiers></record></feedback>`);
  const summary = summarize([parseAggregate(xml)]);
  const { ours, strangers } = triage(summary, new Map([["54.240.3.99", ["a3-99.smtp-out.eu-west-1.amazonses.com"]]]));
  assert.deepEqual(ours.map((s) => s.sourceIp), ["54.240.3.99"]);
  assert.deepEqual(strangers.map((s) => s.sourceIp), ["203.0.113.9"]);
  summary.failing = [...ours, ...strangers];
  assert.match(alertText(summary), /54\.240\.3\.99.*amazonses\.com\s+<- Amazon SES, one of OUR senders/);
});
