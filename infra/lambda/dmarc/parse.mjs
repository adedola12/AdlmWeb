// infra/lambda/dmarc/parse.mjs
//
// Reads DMARC aggregate reports out of raw emails.
//
// Gmail, Yahoo, Microsoft and the rest send one of these a day: a zip or gzip
// file of XML listing every server that sent mail claiming to be from
// adlmstudio.net, how many messages, and whether each passed SPF and DKIM.
// It is the only place a spoofer, a forgotten sending service (Kudimail is
// still in our SPF record and nobody knows why), or a broken signature shows
// up. Nobody reads raw XML, so this turns it into a short summary.
//
// No dependencies on purpose: a MIME splitter, a zip reader over zlib, and a
// regex over a schema that has not changed since RFC 7489.

import zlib from "node:zlib";

/* ─────────────────────────────────────────────────────────── MIME ── */

function splitHeaders(raw) {
  const idx = raw.search(/\r?\n\r?\n/);
  const head = idx < 0 ? raw : raw.slice(0, idx);
  const body = idx < 0 ? "" : raw.slice(idx).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  // Unfold continuation lines, then read "Name: value".
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body };
}

function param(value, name) {
  const m = String(value || "").match(new RegExp(`${name}\\*?=\\s*"?([^";]+)"?`, "i"));
  return m ? m[1].trim() : "";
}

/** Every leaf part of a MIME message: { type, filename, encoding, body }. */
export function mimeParts(raw) {
  const { headers, body } = splitHeaders(raw);
  const type = String(headers["content-type"] || "text/plain").toLowerCase();
  const boundary = param(headers["content-type"], "boundary");
  if (type.startsWith("multipart/") && boundary) {
    const out = [];
    const chunks = body.split(`--${boundary}`);
    for (const chunk of chunks.slice(1)) {
      if (chunk.startsWith("--")) break;
      out.push(...mimeParts(chunk.replace(/^\r?\n/, "")));
    }
    return out;
  }
  return [
    {
      type: type.split(";")[0].trim(),
      filename:
        param(headers["content-disposition"], "filename") || param(headers["content-type"], "name"),
      encoding: String(headers["content-transfer-encoding"] || "").trim().toLowerCase(),
      body,
    },
  ];
}

function decodePart(part) {
  if (part.encoding === "base64") return Buffer.from(part.body.replace(/\s+/g, ""), "base64");
  return Buffer.from(part.body, "binary");
}

/* ─────────────────────────────────────────────────────────── zip ── */

/** Every file in a zip, read from the central directory. */
export function unzip(buf) {
  const files = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return files;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.slice(start, start + compSize);
    let content = null;
    if (method === 0) content = data;
    else if (method === 8) content = zlib.inflateRawSync(data);
    if (content) files.push({ name, content });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** XML documents inside one decoded attachment, whatever it was packed in. */
export function xmlFromAttachment(buf, filename = "") {
  const lower = String(filename).toLowerCase();
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
    return unzip(buf)
      .filter((f) => /\.xml$/i.test(f.name) || f.content.slice(0, 64).toString().includes("<?xml"))
      .map((f) => f.content.toString("utf8"));
  }
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return [zlib.gunzipSync(buf).toString("utf8")];
  const text = buf.toString("utf8");
  if (lower.endsWith(".xml") || text.includes("<feedback")) return [text];
  return [];
}

/* ─────────────────────────────────────────────────────────── XML ── */

const tag = (xml, name) => {
  const m = String(xml).match(new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`, "i"));
  return m ? m[1].trim() : "";
};

/** One aggregate report, as plain data. */
export function parseAggregate(xml) {
  const metadata = tag(xml, "report_metadata");
  const policy = tag(xml, "policy_published");
  const records = [];
  for (const m of String(xml).matchAll(/<record>([\s\S]*?)<\/record>/gi)) {
    const r = m[1];
    const evaluated = tag(r, "policy_evaluated");
    records.push({
      sourceIp: tag(r, "source_ip"),
      count: Number(tag(r, "count")) || 0,
      disposition: tag(evaluated, "disposition") || "none",
      dkim: tag(evaluated, "dkim") || "fail",
      spf: tag(evaluated, "spf") || "fail",
      headerFrom: tag(tag(r, "identifiers"), "header_from"),
    });
  }
  const begin = Number(tag(tag(metadata, "date_range"), "begin")) || 0;
  const end = Number(tag(tag(metadata, "date_range"), "end")) || 0;
  return {
    reporter: tag(metadata, "org_name") || "unknown reporter",
    reportId: tag(metadata, "report_id"),
    domain: tag(policy, "domain"),
    policy: tag(policy, "p"),
    begin: begin ? new Date(begin * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
    records,
  };
}

/** Every report in one raw email. */
export function reportsFromEmail(raw) {
  const out = [];
  for (const part of mimeParts(String(raw))) {
    const looksRight =
      /zip|gzip|xml|octet-stream/.test(part.type) || /\.(zip|gz|xml)$/i.test(part.filename);
    if (!looksRight) continue;
    for (const xml of xmlFromAttachment(decodePart(part), part.filename)) {
      if (xml.includes("<feedback")) out.push(parseAggregate(xml));
    }
  }
  return out;
}

/* ───────────────────────────────────────────────────────── summary ── */

// DMARC passes when either SPF or DKIM passes in alignment. The report's
// policy_evaluated block has already applied alignment.
export const passed = (r) => r.dkim === "pass" || r.spf === "pass";

export function summarize(reports) {
  let messages = 0;
  let failedMessages = 0;
  const bySource = new Map();
  for (const rep of reports) {
    for (const r of rep.records) {
      messages += r.count;
      const key = `${r.sourceIp}|${passed(r) ? "pass" : "fail"}`;
      const row = bySource.get(key) || {
        sourceIp: r.sourceIp,
        passed: passed(r),
        count: 0,
        dkim: r.dkim,
        spf: r.spf,
        disposition: r.disposition,
        reporters: new Set(),
      };
      row.count += r.count;
      row.reporters.add(rep.reporter);
      bySource.set(key, row);
      if (!passed(r)) failedMessages += r.count;
    }
  }
  const sources = [...bySource.values()]
    .map((s) => ({ ...s, reporters: [...s.reporters] }))
    .sort((a, b) => Number(a.passed) - Number(b.passed) || b.count - a.count);
  return {
    reporters: [...new Set(reports.map((r) => r.reporter))],
    domains: [...new Set(reports.map((r) => r.domain).filter(Boolean))],
    messages,
    failedMessages,
    failing: sources.filter((s) => !s.passed),
    passing: sources.filter((s) => s.passed),
  };
}

/* ───────────────────────────────────────────────────────── triage ── */

// Services that send as adlmstudio.net for us, matched on the reverse DNS name
// of the sending IP. A failure from one of these is our own mail going wrong
// and needs a look; a failure from anywhere else is someone forging the domain,
// which p=reject already refuses, so it is logged but does not email anyone.
const OUR_SENDERS = [
  ["Amazon SES", /\.amazonses\.com$/i],
  ["Google", /\.(google|googlemail)\.com$/i],
  ["Microsoft", /\.outlook\.com$/i],
  ["Kudimail", /kudimail/i],
  ["Resend", /resend/i],
];

/** Which of our sending services a set of reverse DNS names belongs to, or "". */
export function ourSender(hostnames = []) {
  for (const host of hostnames) {
    const name = String(host || "").replace(/\.$/, "");
    for (const [label, re] of OUR_SENDERS) if (re.test(name)) return label;
  }
  return "";
}

/**
 * Splits the failing sources by who sent them. `hostsByIp` maps an IP to its
 * reverse DNS names (missing or empty when the lookup found nothing).
 */
export function triage(summary, hostsByIp = new Map()) {
  const get = (ip) => (hostsByIp instanceof Map ? hostsByIp.get(ip) : hostsByIp[ip]) || [];
  const ours = [];
  const strangers = [];
  for (const s of summary.failing) {
    const hosts = get(s.sourceIp);
    const sender = ourSender(hosts);
    const row = { ...s, host: hosts[0] || "", sender };
    (sender ? ours : strangers).push(row);
  }
  return { ours, strangers };
}

/** The alert text for a report that has failures. */
export function alertText(summary, messageId = "") {
  const lines = [
    `DMARC report from ${summary.reporters.join(", ")} for ${summary.domains.join(", ") || "adlmstudio.net"}`,
    `${summary.failedMessages} of ${summary.messages} messages FAILED authentication.`,
    "",
    "Failing sources (IP, messages, DKIM, SPF, what the receiver did):",
    ...summary.failing
      .slice(0, 20)
      .map(
        (s) =>
          `  ${s.sourceIp}  ${s.count}  dkim=${s.dkim}  spf=${s.spf}  ${s.disposition}` +
          (s.host ? `  ${s.host}` : "") +
          (s.sender ? `  <- ${s.sender}, one of OUR senders` : ""),
      ),
    "",
    "A failing source is either someone forging adlmstudio.net, or a real service",
    "we send through that is not set up for SPF or DKIM. Look up an unfamiliar IP",
    "before assuming either. With p=reject, mail from a failing source is refused.",
  ];
  if (summary.passing.length) {
    lines.push("", "Passing sources:");
    for (const s of summary.passing.slice(0, 10)) lines.push(`  ${s.sourceIp}  ${s.count}`);
  }
  if (messageId) lines.push("", `Raw report: s3 object raw/${messageId}`);
  return lines.join("\n");
}
