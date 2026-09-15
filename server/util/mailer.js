// server/util/mailer.js
//
// ONE WAY OUT: SES
//
// Every message the studio sends — receipts, password resets, sign-in codes,
// licence mail, campaigns, broadcasts, video announcements — leaves through
// Amazon SES in eu-west-1, authenticated by the Lambda's own IAM role.
//
// Resend is gone. It was never a separate mail platform: `send.adlmstudio.net`
// published SPF `include:amazonses.com` and an MX at
// `feedback-smtp.eu-west-1.amazonses.com`, so Resend had been handing this
// domain's mail to SES in Ireland all along. Going direct removed a reseller, a
// shared API key and a free-plan daily cap that, when it ran out on 8 September
// 2026, took every customer's receipts and resets down with the bulk send that
// used it up.
//
// THE ONE FALLBACK, AND WHY IT IS OPTIONAL
//
// Gmail SMTP is still tried if SES refuses a message, but only when SMTP_HOST,
// SMTP_USER and SMTP_PASS are all set and MAIL_FALLBACK is not "off". It is not
// a second provider of equal standing: it is a mailbox with an app password,
// Google does not allow bulk mail through it, and it sat broken for weeks
// without anybody noticing because a fallback is only reached when the primary
// has already failed. verifyMail() below is how that gets noticed now.
//
// ROLLBACK
//
// There is no other provider to flip back to. MAIL_TRANSPORT=smtp bypasses SES
// and sends through the SMTP fallback alone — useful only if SES itself is the
// problem and the Gmail credential works. Otherwise rollback is redeploying the
// previous build.
import nodemailer from "nodemailer";
import { EmailTemplate } from "../models/EmailTemplate.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { canEdit } from "./emailCatalogue.js";
import { isSesSelected, sendViaSes, sesAccountStatus } from "./sesTransport.js";

// strip HTML → text
function toText(html = "") {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeTransport({ host, port, user, pass, label }) {
  const t = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 is implicit TLS; 587 upgrades with STARTTLS
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: host },
  });
  // Carried on the transport so a log line can say which one sent it, and a
  // verify report can say which one is broken, without re-deriving it.
  t.adlmLabel = `${label} ${host}:${port}`;
  return t;
}

/**
 * The SMTP fallback, if it is configured.
 *
 * The configured port first, then the other one: a host that refuses one port
 * often takes the other, and there is no cost to asking. Empty when any of the
 * three settings is missing — no fallback is a legitimate configuration, and it
 * is better than a half-configured one that fails in a confusing way.
 */
function buildTransports() {
  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  if (!(host && user && pass)) return [];

  const configured = Number(process.env.SMTP_PORT) || 0;
  const ports = configured ? [configured, configured === 465 ? 587 : 465] : [465, 587];
  return ports.map((port) => makeTransport({ host, port, user, pass, label: "smtp" }));
}

const transports = buildTransports();

const fallbackDisabled = () =>
  /^(0|false|no|off)$/i.test(String(process.env.MAIL_FALLBACK || "").trim());

/**
 * Which ways out actually work, right now.
 *
 * A fallback nobody exercises is a fallback nobody can rely on, and a sandboxed
 * SES account looks exactly like a working one until a customer's reset fails
 * to arrive. This makes both checkable on an ordinary day, from the admin
 * Emails screen. Never throws: it reports.
 *
 * The SES row reads the ACCOUNT, not the identity. The Lambda role is granted
 * ses:GetAccount and not ses:GetEmailIdentity, deliberately — this report needs
 * to know whether the account can reach customers, and that is an account
 * question.
 */
export async function verifyMail() {
  const rows = [];

  if (!isSesSelected()) {
    rows.push({ via: "ses", ok: false, unknown: true, said: "bypassed: MAIL_TRANSPORT=smtp" });
  } else {
    const s = await sesAccountStatus();
    if (s.error) {
      rows.push({ via: "ses", ok: false, said: s.error });
    } else if (!s.sendingEnabled) {
      rows.push({ via: "ses", ok: false, said: "sending is switched off for this account" });
    } else if (s.enforcement && s.enforcement !== "HEALTHY") {
      rows.push({ via: "ses", ok: false, said: `account under review: ${s.enforcement}` });
    } else if (!s.productionAccess) {
      // Not "works". A sandboxed account can only deliver to verified
      // addresses, so every customer-facing message would be refused.
      rows.push({
        via: "ses",
        ok: false,
        said: `sandbox: ${s.max24h}/day, verified recipients only — customers cannot be reached`,
      });
    } else {
      rows.push({
        via: "ses",
        ok: true,
        said: `production: ${s.max24h}/day, ${s.maxRate}/s, ${s.sent24h} sent in the last 24h`,
      });
    }
  }

  if (!transports.length) {
    rows.push({ via: "smtp", ok: false, unknown: true, said: "no fallback configured" });
  }
  for (const t of transports) {
    try {
      await t.verify();
      rows.push({ via: t.adlmLabel, ok: true, said: "authenticated" });
    } catch (err) {
      const code = err?.responseCode || err?.code || "";
      const said = String(err?.response || err?.message || "").replace(/\s+/g, " ").trim();
      rows.push({ via: t.adlmLabel, ok: false, said: `${code} ${said}`.trim().slice(0, 200) });
    }
  }

  return {
    ok: rows.some((r) => r.ok && !r.unknown),
    reachable: rows.some((r) => r.ok),
    ways: rows,
  };
}

// attachments: optional array of { filename, content } where `content` is a
// base64-encoded string. sesTransport decodes it to bytes; SMTP decodes below.
// bcc: optional — API sends never appear in the Gmail Sent folder, so callers
// that need an internal record BCC the admin mailbox.
/**
 * Apply an admin's override for this message, if there is one.
 *
 * Never throws and never blocks the send: a database that cannot be read is a
 * reason to send the original wording, not a reason for the customer to get
 * nothing. The same goes for the send log below — mail is the product here,
 * bookkeeping is not.
 */
async function withOverride(templateKey, subject, html) {
  if (!templateKey || !canEdit(templateKey)) return { subject, html };
  try {
    const t = await EmailTemplate.findOne({ key: templateKey }).lean();
    if (!t) return { subject, html };
    return {
      subject: t.subject?.trim() ? t.subject : subject,
      html: t.html?.trim() ? t.html : html,
    };
  } catch {
    return { subject, html };
  }
}

async function logSend(templateKey, to, ok, via, messageId = "", track = null) {
  try {
    await EmailSend.create({
      key: templateKey || "unattributed",
      toHash: hashRecipient(to),
      ok,
      via,
      // Without the provider's id an Open arriving later matches nothing, so
      // it is recorded for every send, tracked or not.
      messageId: String(messageId || ""),
      // Only a campaign asks for this. See the note at the top of
      // models/EmailSend.js for why it is scoped rather than blanket.
      ...(track
        ? {
            to: String(Array.isArray(to) ? to[0] : to || "").trim().toLowerCase(),
            campaign: String(track.campaign || ""),
          }
        : {}),
    });
  } catch {
    /* A send that happened is not undone by a log that did not. */
  }
}

async function sendViaSmtp({ templateKey, to, track, message }) {
  if (!transports.length) {
    await logSend(templateKey, to, false, "none");
    throw new Error("No SMTP fallback is configured — set SMTP_HOST, SMTP_USER and SMTP_PASS.");
  }

  const refused = [];
  for (const t of transports) {
    try {
      // verify() first so an authentication failure is reported as one rather
      // than surfacing later as a confusing send error. Its own failure is not
      // fatal — some hosts refuse a bare verify and accept a real message.
      await t.verify().catch(() => {});
      const info = await t.sendMail(message);
      console.log(`[mailer] sent via ${t.adlmLabel}: ${info?.messageId || "ok"}`);
      await logSend(templateKey, to, true, "smtp", info?.messageId, track);
      return;
    } catch (err) {
      const said = err?.response || err?.message || String(err);
      refused.push(`${t.adlmLabel}: ${String(said).replace(/\s+/g, " ").slice(0, 120)}`);
      console.error(`[mailer] ${t.adlmLabel} refused:`, said);
    }
  }
  await logSend(templateKey, to, false, "none");
  // Every refusal, not just the last: "the last one failed" sends whoever
  // reads this looking at the wrong transport.
  throw new Error(`No way out accepted the message. ${refused.join(" | ")}`);
}

/**
 * @param templateKey  optional key from util/emailCatalogue.js. Supplying one
 *   lets an admin rewrite the message from the Emails screen, and counts the
 *   send against it. Omitting one still sends — the message is simply logged
 *   as unattributed and cannot be edited.
 */
export async function sendMail({
  to,
  subject,
  html,
  text,
  attachments,
  bcc,
  templateKey,
  listUnsubscribe,
  // { campaign } - set by a campaign send to record the recipient and match
  // later open/click events to them. Transactional callers leave it unset and
  // keep logging nothing but a hash.
  track = null,
}) {
  // The sender name is "ADLM Studio" and must stay that. It is what the brand
  // is called everywhere a customer meets it — the site, the plugins, the
  // signature at the bottom of these messages — and it is the one line of a
  // message somebody reads before deciding whether to open it.
  // (util/mailer.sender.test.js enforces this by reading this file, so do not
  // write the old name even in a comment.)
  const from =
    process.env.EMAIL_FROM ||
    `ADLM Studio <${process.env.SMTP_USER || "noreply@adlmstudio.net"}>`;

  const over = await withOverride(templateKey, subject, html);
  subject = over.subject;
  html = over.html;

  const recipients = Array.isArray(to) ? to : [to];
  const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined;
  const plain = text || toText(html);

  /* ───────────────────────────── SES ───────────────────────────── */
  if (isSesSelected()) {
    try {
      const id = await sendViaSes({
        // A tracked send is a campaign, and only a campaign. It routes to the
        // marketing configuration set so opens and clicks are measured without
        // rewriting the links in anybody's password reset.
        tracked: Boolean(track),
        from,
        to: recipients,
        bcc: bccList,
        subject,
        html,
        text: plain,
        attachments,
        listUnsubscribe,
      });
      console.log(`[mailer] SES OK: id=${id || "unknown"} from=${from}`);
      await logSend(templateKey, to, true, "ses", id, track);
      return;
    } catch (err) {
      console.error("[mailer] SES failed:", err?.name || "", err?.message || err);
      if (fallbackDisabled() || !transports.length) {
        await logSend(templateKey, to, false, "none");
        throw err;
      }
      console.warn("[mailer] falling back to SMTP");
    }
  }

  /* ─────────────────────────── SMTP fallback ─────────────────────────── */
  // Gmail and Yahoo both require these of bulk senders; only callers with a
  // real per-recipient opt-out pass a URL.
  const headers = listUnsubscribe
    ? {
        "List-Unsubscribe": `<${listUnsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  const message = {
    from,
    to: recipients,
    ...(bccList ? { bcc: bccList } : {}),
    subject,
    html,
    text: plain,
    ...(headers ? { headers } : {}),
    ...(Array.isArray(attachments) && attachments.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content, "base64"),
          })),
        }
      : {}),
  };

  await sendViaSmtp({ templateKey, to, track, message });
}
