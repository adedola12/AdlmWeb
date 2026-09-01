// server/util/mailer.js
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import { EmailTemplate } from "../models/EmailTemplate.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { canEdit } from "./emailCatalogue.js";

// strip HTML → text
function toText(html = "") {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeTransport({ host, port, secure }) {
  return nodemailer.createTransport({
    host,
    port,
    secure, // 465=true, 587=false
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: host },
  });
}

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const transports = [
  makeTransport({ host, port: 465, secure: true }),
  makeTransport({ host, port: 587, secure: false }),
];

// attachments: optional array of { filename, content } where `content` is a
// base64-encoded string. Passed through to both Resend and SMTP transports.
// bcc: optional — Resend sends bypass the Gmail mailbox entirely (nothing in
// Sent), so callers that need an internal record BCC the admin mailbox.
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

async function logSend(templateKey, to, ok, via) {
  try {
    await EmailSend.create({
      key: templateKey || "unattributed",
      toHash: hashRecipient(to),
      ok,
      via,
    });
  } catch {
    /* A send that happened is not undone by a log that did not. */
  }
}

/**
 * @param templateKey  optional key from util/emailCatalogue.js. Supplying one
 *   lets an admin rewrite the message from the Emails screen, and counts the
 *   send against it. Omitting one still sends — the message is simply logged
 *   as unattributed and cannot be edited.
 */
export async function sendMail({ to, subject, html, text, attachments, bcc, templateKey }) {
  const primaryFrom =
    process.env.EMAIL_FROM ||
    `ADLM Services <${process.env.SMTP_USER || "noreply@adlmstudio.net"}>`;
  const fallbackFrom = "ADLM Services <onboarding@resend.dev>"; // valid for testing

  const over = await withOverride(templateKey, subject, html);
  subject = over.subject;
  html = over.html;

  const body = {
    subject,
    html,
    text: text || toText(html),
    to: Array.isArray(to) ? to : [to],
  };
  if (bcc) body.bcc = Array.isArray(bcc) ? bcc : [bcc];

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  const apiKey = process.env.RESEND_API_KEY;

  // 1) Resend first
  if (apiKey) {
    for (const from of [primaryFrom, fallbackFrom]) {
      const payload = { from, ...body };
      if (hasAttachments) {
        payload.attachments = attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
        }));
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(
          `[mailer] Resend OK: id=${data?.id || "unknown"} from=${from}`
        );
        await logSend(templateKey, to, true, "resend");
        return;
      }

      const txt = await res.text().catch(() => "");
      console.error("[mailer] Resend failed:", res.status, txt);

      // If from-address not verified, try fallback sender
      if (res.status === 422 && from !== fallbackFrom && /from/i.test(txt)) {
        console.warn("[mailer] Retrying with onboarding@resend.dev sender");
        continue;
      }

      // Other errors: break to SMTP fallback
      break;
    }
  } else {
    console.warn("[mailer] RESEND_API_KEY missing; will try SMTP");
  }

  // 2) SMTP fallback
  const message = { from: primaryFrom, ...body };
  if (hasAttachments) {
    message.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
    }));
  }
  let lastErr;
  for (const t of transports) {
    try {
      await t.verify().catch(() => {});
      const info = await t.sendMail(message);
      console.log("[mailer] SMTP ok:", info?.messageId);
      await logSend(templateKey, to, true, "smtp");
      return;
    } catch (err) {
      lastErr = err;
      console.error("[mailer] SMTP attempt failed:", err?.message || err);
    }
  }
  await logSend(templateKey, to, false, "none");
  throw new Error(lastErr?.message || "All email attempts failed");
}
