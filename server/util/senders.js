// server/util/senders.js
//
// Which address a message comes from, and where a reply goes.
//
// Until September 2026 everything went out as admin@adlmstudio.net, which is
// also a person's inbox. That had two costs. Mailbox providers rate senders
// partly by address, so a complaint about an announcement counted against the
// same address that sends password reset codes. And every automated message
// invited replies into a mailbox that is meant for conversations.
//
// So the two kinds of mail now have their own addresses:
//   transactional - receipts, codes, licence and seat notices
//                   -> notifications@adlmstudio.net
//   announcements - campaigns, video launches, anything carrying an
//                   unsubscribe link
//                   -> news@adlmstudio.net
// Both set Reply-To to the real inbox, so no new mailbox is needed and a
// customer who hits Reply still reaches a person.
//
// All three are overridable from SSM. All stay on adlmstudio.net, which is what
// the SES domain identity, DKIM and DMARC alignment cover.
//
// EMAIL_FROM is deliberately NOT read here. It is still set in SSM to the old
// admin@ address, and honouring it would keep transactional mail on the
// personal inbox. EMAIL_FROM_NOTIFY is the variable that replaces it.

// Written out in full rather than built from a constant: mailer.sender.test.js
// reads these lines to make sure every sender name says "ADLM Studio".
export const DEFAULT_NOTIFY_FROM = "ADLM Studio <notifications@adlmstudio.net>";
export const DEFAULT_NEWS_FROM = "ADLM Studio <news@adlmstudio.net>";
export const DEFAULT_REPLY_TO = "admin@adlmstudio.net";

const env = (key) => String(process.env[key] || "").trim();

/**
 * The From line for a message.
 * @param {object} opts
 * @param {boolean} opts.marketing  true for anything sent to a list rather than
 *   in response to what one customer did. The mailer treats a campaign-tracked
 *   send or one with an unsubscribe link as marketing.
 */
export function senderFor({ marketing = false } = {}) {
  if (marketing) return env("EMAIL_FROM_NEWS") || DEFAULT_NEWS_FROM;
  return env("EMAIL_FROM_NOTIFY") || DEFAULT_NOTIFY_FROM;
}

/** Where a customer's reply lands. */
export function replyToAddress() {
  return env("EMAIL_REPLY_TO") || DEFAULT_REPLY_TO;
}
