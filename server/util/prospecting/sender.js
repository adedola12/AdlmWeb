// server/util/prospecting/sender.js
//
// PHASE 2 INTERFACE. Nothing here sends mail yet.
//
// The Sender is how an approved OutreachDraft leaves the building. Phase 2
// plugs a Gmail API implementation in behind this interface; until then the
// only implementation refuses, so no code path can send cold email by
// accident.
//
// The phase 2 design this interface is shaped for (docs/PROSPECTING.md):
//   - Gmail API on a SEPARATE outreach domain on Google Workspace. Never SES
//     and never adlmstudio.net (CLAUDE.md: cold outreach is the one exception
//     to the SES-only mail rule).
//   - At most 20 sends per inbox per day, at randomised times inside working
//     hours, Africa/Lagos.
//   - The first email on day 0, follow-ups on day 3 and day 7, all in one
//     Gmail thread (the drafts already carry "Re: <subject>").
//   - A follow-up is cancelled the moment any reply arrives on the thread.
//   - Suppression is re-checked immediately before every send, however long
//     ago the draft was approved.

export class SendingDisabled extends Error {
  constructor(message = "Outbound sending is not switched on (phase 2).") {
    super(message);
    this.code = "SENDING_DISABLED";
  }
}

/**
 * One email, ready to go.
 * @typedef {object} OutgoingEmail
 * @property {string} draftId     OutreachDraft._id
 * @property {0|1|2}  step        0 first, 1 day 3, 2 day 7
 * @property {string} to          the contact's address
 * @property {string} subject
 * @property {string} body        plain text, footer included
 * @property {string} [threadId]  the provider's thread, for steps 1 and 2
 */

/**
 * What a send returns.
 * @typedef {object} SendResult
 * @property {string} messageId
 * @property {string} threadId
 * @property {string} inbox       the outreach address it went from
 * @property {Date}   sentAt
 */

/**
 * The contract every sender implements.
 *
 * send() must: refuse a suppressed address (check at send time, not approval
 * time); refuse when the inbox has reached its daily limit; send plain text
 * only; and return the provider's message and thread ids so the ReplyHandler
 * can match replies to drafts.
 */
export class Sender {
  /** @returns {string} a short name for logs, e.g. "gmail" */
  get name() {
    throw new Error("Sender.name is not implemented");
  }

  /** Sends allowed per inbox per Lagos day. */
  get dailyLimitPerInbox() {
    return 20;
  }

  /**
   * @param {OutgoingEmail} _email
   * @returns {Promise<SendResult>}
   */
  async send(_email) {
    throw new Error("Sender.send is not implemented");
  }
}

/** The only sender that exists in phase 1: it refuses everything. */
export class DisabledSender extends Sender {
  get name() {
    return "disabled";
  }

  async send() {
    throw new SendingDisabled();
  }
}

/**
 * The sender for this environment. OUTREACH_SENDER picks one; anything other
 * than unset or "disabled" is an error until phase 2 adds it, so a typo can
 * never quietly fall back to some other mail path.
 */
export function getSender(name = process.env.OUTREACH_SENDER) {
  const n = String(name || "disabled").trim().toLowerCase();
  if (n === "disabled") return new DisabledSender();
  throw new Error(`OUTREACH_SENDER="${n}" is not available yet. Phase 2 adds "gmail"; there is no other.`);
}
