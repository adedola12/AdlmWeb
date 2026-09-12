// server/util/mailer.js
//
// THREE TRANSPORTS, IN A DELIBERATE ORDER
//
// SES, then Resend, then Gmail SMTP. Set MAIL_TRANSPORT=ses to put SES at the
// front; leave it unset and nothing changes, which is the point — the switch
// can be deployed long before the DNS and the sandbox exit are done, and
// flipped by a parameter when they are.
//
// SES and Resend are the same platform. `send.adlmstudio.net` publishes SPF
// `include:amazonses.com` and an MX at `feedback-smtp.eu-west-1.amazonses.com`,
// so Resend has been handing this domain's mail to SES in Ireland all along.
// Going direct removes a reseller and an API key, not a mail platform — which
// is also why the fallback below is worth keeping through the cutover and not
// worth keeping forever.
//
// Once SES has carried production traffic for a week, RESEND_API_KEY comes out
// of SSM and this file loses two of its three transports. The Gmail SMTP path
// should go with it: an app password that can send as the studio is a
// credential nobody needs once the Lambda's own role can do the job.
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import { EmailTemplate } from "../models/EmailTemplate.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { canEdit } from "./emailCatalogue.js";
import { isSesSelected, sendViaSes } from "./sesTransport.js";

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
 * Every way out, best first.
 *
 * WHY THERE IS MORE THAN ONE SMTP CANDIDATE
 *
 * The fallback was two ports on one host, and when the credential for that
 * host stopped being accepted there was nothing behind it — Resend was
 * carrying every message on the site with nothing underneath. Worse, nobody
 * knew: SMTP is only ever reached when Resend has already failed, so a broken
 * fallback is invisible right up to the moment it is the only thing left.
 *
 * So the chain is built from whatever is actually configured:
 *
 *   1. the configured SMTP host, on its configured port first
 *      — genuinely independent of Resend, which is the point of a fallback
 *   2. Resend's own SMTP gateway, authenticated with the API key
 *      — needs no extra credential, and covers the failures that are about
 *        the HTTP path rather than about Resend: a proxy, DNS to
 *        api.resend.com, a request the API rejects that SMTP accepts
 *
 * The second is not redundancy against Resend being down. It is redundancy
 * against the way we talk to it, which is the more common failure and was
 * previously not covered at all.
 */
function buildTransports() {
  const out = [];
  const seen = new Set();
  const add = (t) => {
    if (seen.has(t.adlmLabel)) return;
    seen.add(t.adlmLabel);
    out.push(t);
  };

  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (host && user && pass) {
    // SMTP_PORT was being set in the environment and ignored by the code,
    // which tried 465 then 587 regardless. It is honoured now, and the other
    // port is still tried behind it — a host that refuses one often takes the
    // other, and there is no cost to asking.
    const configured = Number(process.env.SMTP_PORT) || 0;
    const ports = configured ? [configured, configured === 465 ? 587 : 465] : [465, 587];
    for (const port of ports) add(makeTransport({ host, port, user, pass, label: "smtp" }));
  }

  const key = process.env.RESEND_API_KEY;
  if (key) {
    for (const port of [465, 587]) {
      add(makeTransport({
        host: "smtp.resend.com",
        port,
        user: "resend",
        pass: key,
        label: "resend-smtp",
      }));
    }
  }

  return out;
}

const transports = buildTransports();

/**
 * Which ways out actually work, right now.
 *
 * A fallback nobody exercises is a fallback nobody can rely on. This makes the
 * state checkable before it matters, rather than at the moment Resend is down
 * and a customer is waiting. Never throws: it reports.
 */
export async function verifyMail() {
  const rows = [];

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    rows.push({ via: "resend-api", ok: false, said: "RESEND_API_KEY is not set" });
  } else {
    try {
      // Resend has no ping, so this asks for the domains: a cheap
      // authenticated read that proves the key and the network path.
      //
      // A key scoped to SENDING ONLY cannot read them, and answers 401. That
      // is not a broken transport — it is the transport currently carrying
      // every message on the site — so it is reported as unknown rather than
      // failed. Calling it broken would have this report crying wolf about the
      // one thing that works, which is how a health check gets ignored.
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        rows.push({ via: "resend-api", ok: true, said: "authenticated" });
      } else if (res.status === 401 || res.status === 403) {
        rows.push({
          via: "resend-api",
          ok: true,
          unknown: true,
          said:
            "reachable; the key has sending-only access, which cannot be " +
            "confirmed without sending a message",
        });
      } else {
        rows.push({ via: "resend-api", ok: false, said: `HTTP ${res.status}` });
      }
    } catch (err) {
      rows.push({ via: "resend-api", ok: false, said: err?.message || "unreachable" });
    }
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
    // Something can definitely send. A sending-only Resend key is reachable
    // but unproven, so it does not on its own make this true — the point of
    // the flag is to say whether there is a way out that has been checked.
    ok: rows.some((r) => r.ok && !r.unknown),
    reachable: rows.some((r) => r.ok),
    ways: rows,
  };
}

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
  // The sender name is "ADLM Studio" and must stay that, here and in the
  // fallback below. It is what the brand is called everywhere a customer meets
  // it — the site, the plugins, the signature at the bottom of these messages —
  // and it is the one line of a message somebody reads before deciding whether
  // to open it. Two names for one firm in an inbox is how mail from a domain
  // starts looking like mail about it. (util/mailer.sender.test.js enforces
  // this by reading this file, so do not write the old name even in a comment.)
  const primaryFrom =
    process.env.EMAIL_FROM ||
    `ADLM Studio <${process.env.SMTP_USER || "noreply@adlmstudio.net"}>`;
  const fallbackFrom = "ADLM Studio <onboarding@resend.dev>"; // valid for testing

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

  // Gmail and Yahoo both require these of anybody sending bulk mail, and the
  // unsubscribe routes are already built to answer a one-click POST. Only the
  // senders with a real per-recipient opt-out pass a URL; a receipt gets none,
  // because there is nothing to unsubscribe from.
  const listHeaders = listUnsubscribe
    ? {
        "List-Unsubscribe": `<${listUnsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : null;

  /* ───────────────────────────── 0) SES ─────────────────────────────
   * First when asked for. A failure here falls through to the transports
   * below rather than ending the send — during the cutover that is the whole
   * safety net, and once RESEND_API_KEY is gone there is simply nothing left
   * to fall through to. Set MAIL_FALLBACK=off to close the net early and find
   * out immediately whether SES is really carrying everything.
   */
  if (isSesSelected()) {
    try {
      const id = await sendViaSes({
        // A tracked send is a campaign, and only a campaign. It routes to the
        // marketing configuration set so opens and clicks are measured without
        // rewriting the links in anybody's password reset.
        tracked: Boolean(track),
        from: primaryFrom,
        to: body.to,
        bcc: body.bcc,
        subject,
        html,
        text: body.text,
        attachments,
        listUnsubscribe,
      });
      console.log(`[mailer] SES OK: id=${id || "unknown"} from=${primaryFrom}`);
      await logSend(templateKey, to, true, "ses", id, track);
      return;
    } catch (err) {
      console.error("[mailer] SES failed:", err?.name || "", err?.message || err);
      if (/^(0|false|no|off)$/i.test(String(process.env.MAIL_FALLBACK || "").trim())) {
        await logSend(templateKey, to, false, "none");
        throw err;
      }
      console.warn("[mailer] falling back to Resend/SMTP");
    }
  }

  const apiKey = process.env.RESEND_API_KEY;

  // 1) Resend first
  if (apiKey) {
    for (const from of [primaryFrom, fallbackFrom]) {
      const payload = { from, ...body };
      if (listHeaders) payload.headers = listHeaders;
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
        await logSend(templateKey, to, true, "resend", data?.id, track);
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
  if (listHeaders) message.headers = listHeaders;
  if (hasAttachments) {
    message.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
    }));
  }
  if (!transports.length) {
    await logSend(templateKey, to, false, "none");
    throw new Error(
      "Resend did not send it and there is no SMTP fallback configured — " +
        "set SMTP_HOST, SMTP_USER and SMTP_PASS, or a RESEND_API_KEY for the SMTP gateway.",
    );
  }

  let lastErr;
  const refused = [];
  for (const t of transports) {
    try {
      // verify() first so an authentication failure is reported as one rather
      // than surfacing later as a confusing send error. Its own failure is not
      // fatal — some hosts refuse a bare verify and accept a real message.
      await t.verify().catch(() => {});
      const info = await t.sendMail(message);
      console.log(`[mailer] sent via ${t.adlmLabel}: ${info?.messageId || "ok"}`);
      // Logged by which way out carried it, so the send log can answer "what
      // is actually delivering our mail" rather than only "did it go".
      await logSend(templateKey, to, true, t.adlmLabel.split(" ")[0], info?.messageId, track);
      return;
    } catch (err) {
      lastErr = err;
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
