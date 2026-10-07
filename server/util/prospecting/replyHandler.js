// server/util/prospecting/replyHandler.js
//
// PHASE 3 INTERFACE. Nothing here reads mail yet.
//
// The ReplyHandler takes a reply that arrived on an outreach thread, has
// Claude classify it, and acts on the class. Phase 3 plugs in a Gmail reader
// and a Claude classifier behind this interface.
//
// What each class must lead to (fixed here so phase 3 cannot drift from it):
//   interested    Stop the follow-ups. Mark the prospect replied. Queue a
//                 booking suggestion (booking link or slots from Google
//                 Calendar) for an ADMIN to approve; nothing is sent to them
//                 without that approval.
//   not_now       Stop the follow-ups. Mark replied. No further contact.
//   wrong_person  Stop the follow-ups. Mark replied. Flag for a reviewer, who
//                 may pick another contact at the firm.
//   opt_out       Stop everything. store.optOut(): permanent suppression,
//                 firm marked opted_out, unsent drafts withdrawn.
//
// ANY reply stops the follow-ups, whatever its class, and before the
// classifier runs: a slow or failed classification must never let a day 3
// email go to someone who has already answered.

export const REPLY_CLASSES = ["interested", "not_now", "wrong_person", "opt_out"];

/** What each class does. Read by phase 3 and by the tests. */
export const REPLY_ACTIONS = {
  interested: { stopFollowUps: true, outcome: "replied", suppress: false, needsAdminApproval: true },
  not_now: { stopFollowUps: true, outcome: "replied", suppress: false, needsAdminApproval: false },
  wrong_person: { stopFollowUps: true, outcome: "replied", suppress: false, needsAdminApproval: false, flagForReview: true },
  opt_out: { stopFollowUps: true, outcome: "opted_out", suppress: true, needsAdminApproval: false },
};

/**
 * One reply, as the reader hands it over.
 * @typedef {object} IncomingReply
 * @property {string} threadId   the provider thread the Sender recorded
 * @property {string} from       the replying address
 * @property {string} text       plain text, quoted history stripped
 * @property {Date}   receivedAt
 */

export class ReplyHandlingDisabled extends Error {
  constructor(message = "Reply handling is not switched on (phase 3).") {
    super(message);
    this.code = "REPLIES_DISABLED";
  }
}

/** The contract every reply handler implements. */
export class ReplyHandler {
  /**
   * @param {IncomingReply} _reply
   * @returns {Promise<"interested"|"not_now"|"wrong_person"|"opt_out">}
   */
  async classify(_reply) {
    throw new Error("ReplyHandler.classify is not implemented");
  }

  /**
   * Stops follow-ups, classifies, then applies REPLY_ACTIONS[class].
   * @param {IncomingReply} _reply
   */
  async handle(_reply) {
    throw new Error("ReplyHandler.handle is not implemented");
  }
}

/** The only handler in phase 1: it refuses. */
export class DisabledReplyHandler extends ReplyHandler {
  async classify() {
    throw new ReplyHandlingDisabled();
  }

  async handle() {
    throw new ReplyHandlingDisabled();
  }
}

export function getReplyHandler() {
  return new DisabledReplyHandler();
}
