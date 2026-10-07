// server/util/mailer.js
//
// ONE TRANSPORT: AMAZON SES
//
// Every message the studio sends goes out on SES, through the Lambda's own
// role. There is no second provider behind it and no SMTP fallback. Owner's
// rule (6 Oct 2026): Resend is never used again, and when SES refuses a
// message the send FAILS LOUDLY - it is logged, recorded as a failed send and
// thrown to the caller - rather than quietly leaving by some other door.
//
// A fallback hides exactly the failures worth knowing about: SES in sandbox,
// a paused account, a missing permission. Each of those used to look like a
// working site while a reseller carried the mail. Now each one is an error
// somebody sees.
//
// MAIL_TRANSPORT and MAIL_FALLBACK are no longer read here. SES is the
// transport whatever MAIL_TRANSPORT says, so an unset or mistyped setting can
// never route mail anywhere else.
//
// (Cold outreach is a separate path on a separate domain and does not come
// through this file. It is never a fallback for anything sent here.)
import { EmailTemplate } from "../models/EmailTemplate.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { canEdit } from "./emailCatalogue.js";
import { sendViaSes, getSesAccount } from "./sesTransport.js";
import { senderFor, replyToAddress } from "./senders.js";

// strip HTML -> text
function toText(html = "") {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The SES sender, swappable only by tests so a refused send can be driven
// without an AWS round trip. Production never calls the setter.
let sesSend = sendViaSes;
export function _setSesSenderForTests(fn) {
  sesSend = typeof fn === "function" ? fn : sendViaSes;
}

/**
 * Can the studio send, right now?
 *
 * Reports SES and only SES, because SES is the only way out. GetAccount is the
 * honest check: it proves the credentials, the region and that AWS will accept
 * a message. Production access and the pause flag are spelled out because
 * sandbox and a pause are the two states that look fine locally and refuse
 * every customer. Never throws: it reports.
 *
 * readAccount is injectable so sandbox, paused and unreachable can be tested
 * without an AWS round trip. Callers pass nothing.
 */
export async function verifyMail({ readAccount = getSesAccount } = {}) {
  const rows = [];
  try {
    const acct = await readAccount();
    const sending = acct?.SendingEnabled !== false;
    const prod = acct?.ProductionAccessEnabled === true;
    const sent = Number(acct?.SendQuota?.SentLast24Hours || 0);
    const cap = Number(acct?.SendQuota?.Max24HourSend || 0);
    const enforcement = String(acct?.EnforcementStatus || "").toUpperCase();
    const notes = [
      prod ? "production access" : "SANDBOX — only verified addresses receive mail",
      sending ? "sending enabled" : "SENDING PAUSED by AWS",
      cap ? `${Math.round(sent)} of ${Math.round(cap)} sent in 24h` : "",
      enforcement && enforcement !== "HEALTHY" ? `enforcement ${enforcement}` : "",
    ].filter(Boolean);
    rows.push({ via: "ses", ok: sending, live: true, said: notes.join("; ") });
  } catch (err) {
    rows.push({
      via: "ses",
      ok: false,
      live: true,
      said: String(err?.name || err?.message || err).slice(0, 200),
    });
  }
  return summariseMailWays(rows);
}

/**
 * The verdict, given the probed rows. Split out from verifyMail so the rule
 * can be tested on its own.
 *
 * SES is the only transport, so the verdict is SES's. Any other row handed in
 * is marked not in use: nothing falls back, so however well something else
 * authenticates it cannot carry a message, and must never make the report
 * look healthy. `fallbackOff` is always true, and kept in the shape because
 * the admin screen reads it.
 */
export function summariseMailWays(rows) {
  for (const r of rows) {
    if (r.via === "ses") {
      r.live = true;
      continue;
    }
    r.live = false;
    r.unused = true;
  }
  const ses = rows.find((r) => r.via === "ses");
  return {
    ok: Boolean(ses?.ok),
    reachable: Boolean(ses?.ok),
    transport: "ses",
    fallbackOff: true,
    ways: rows,
  };
}

// attachments: optional array of { filename, content } where `content` is a
// base64-encoded string.
// bcc: optional - SES sends never appear in the Gmail Sent folder, so callers
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

/**
 * @param templateKey  optional key from util/emailCatalogue.js. Supplying one
 *   lets an admin rewrite the message from the Emails screen, and counts the
 *   send against it. Omitting one still sends — the message is simply logged
 *   as unattributed and cannot be edited.
 *
 * Throws when SES refuses the message. There is no fallback.
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
  // is called everywhere a customer meets it, and it is the one line of a
  // message somebody reads before deciding whether to open it.
  // (util/mailer.sender.test.js enforces this by reading this file, so do not
  // write the old name even in a comment.) Announcements and receipts come
  // from different addresses so a complaint about one never lands on the
  // other; both reply to the real inbox. See util/senders.js. A tracked or
  // unsubscribable send is an announcement.
  const from = senderFor({ marketing: Boolean(track || listUnsubscribe) });
  const replyTo = replyToAddress();

  const over = await withOverride(templateKey, subject, html);
  subject = over.subject;
  html = over.html;

  const toList = Array.isArray(to) ? to : [to];
  const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined;

  try {
    const id = await sesSend({
      // A tracked send is a campaign, and only a campaign. It routes to the
      // marketing configuration set so opens and clicks are measured without
      // rewriting the links in anybody's password reset.
      tracked: Boolean(track),
      from,
      replyTo,
      to: toList,
      bcc: bccList,
      subject,
      html,
      text: text || toText(html),
      attachments,
      listUnsubscribe,
    });
    console.log(`[mailer] SES OK: id=${id || "unknown"} from=${from}`);
    await logSend(templateKey, to, true, "ses", id, track);
  } catch (err) {
    // Loud on purpose. SES is the only way out, so a refusal here is mail
    // that did not go - logged, recorded, and thrown to the caller.
    console.error(
      "[mailer] SES refused the message; NOT sent (no fallback):",
      err?.name || "",
      err?.message || err,
    );
    await logSend(templateKey, to, false, "ses");
    throw err;
  }
}
