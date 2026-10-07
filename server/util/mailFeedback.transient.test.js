// An address that keeps bouncing transiently is dead in practice.
//
// WHAT THIS GUARDS, AND WHY IT IS WORTH A TEST OF ITS OWN
//
// mailFeedback.js argues at length that a Transient bounce must NOT be treated
// as permanent, and it is right: a full mailbox on Tuesday says nothing about
// Wednesday, and unsubscribing somebody for their server's bad afternoon is a
// fault the customer never gets told about. The consequence of following that
// rule absolutely was that nothing ever stopped. On 4 Oct 2026 five addresses
// had each been sent nine separate messages inside 36 hours — nine distinct SES
// message ids, so nine real sends rather than one event redelivered — and all
// nine bounced. That was about a tenth of the day's volume going to five
// mailboxes that accept nothing, and the bounce rate it produced is charged to
// the whole sending domain, which at the time was 0.43% complaint against the
// 0.5% at which AWS pauses an account outright.
//
// So the rule now has a limit, and the limit is the thing that can regress
// quietly: raise it, drop the +1, or let an exception swallow the count, and the
// symptom is invisible for weeks and then arrives as a suspended sending domain.
//
// The apply half talks to Mongo, which the sibling test file declines to do. The
// models are named imports of plain objects, so their methods are swapped here
// the same way routes/downloads.android.test.js swaps User.findById — no
// connection, and the decision is still exercised rather than described.
import test from "node:test";
import assert from "node:assert/strict";

import { applyFeedback } from "./mailFeedback.js";
import { User } from "../models/User.js";
import { MailEvent } from "../models/MailEvent.js";

const EMAIL = "keeps-bouncing@example.test";

/** A parsed transient bounce, in the shape parseFeedback produces. */
const transient = (over = {}) => ({
  type: "bounce",
  email: EMAIL,
  bounceType: "Transient",
  bounceSubType: "MailboxFull",
  detail: "452 4.2.2 over quota",
  messageId: "0100018f-msg",
  feedbackId: "0100018f-fb",
  permanent: false,
  ...over,
});

/**
 * Run applyFeedback with the collections stubbed.
 *
 * `priorTransient` is what MailEvent already holds for this address inside the
 * window. Returns what was written to the User record, or null if nothing was.
 */
async function withStubs(ev, priorTransient, { countThrows = false } = {}) {
  const real = {
    findOne: User.findOne,
    updateOne: User.updateOne,
    count: MailEvent.countDocuments,
    create: MailEvent.create,
  };
  let written = null;
  let eventRow = null;
  try {
    User.findOne = () => ({
      select: () => ({ lean: async () => ({ _id: "u1", email: EMAIL }) }),
    });
    User.updateOne = async (_q, update) => {
      written = update?.$set || null;
      return { modifiedCount: 1 };
    };
    MailEvent.countDocuments = async (q) => {
      if (countThrows) throw new Error("mongo unavailable");
      // The query must actually exclude permanent bounces and bound the window,
      // or the count means something other than what the threshold assumes.
      assert.equal(q.email, EMAIL);
      assert.equal(q.type, "bounce");
      assert.deepEqual(q.bounceType, { $ne: "Permanent" });
      assert.ok(q.at?.$gte instanceof Date, "the count must be bounded by a window");
      return priorTransient;
    };
    MailEvent.create = async (row) => {
      eventRow = row;
      return row;
    };
    await applyFeedback(ev, { log: { error: () => {} } });
  } finally {
    User.findOne = real.findOne;
    User.updateOne = real.updateOne;
    MailEvent.countDocuments = real.count;
    MailEvent.create = real.create;
  }
  return { written, eventRow };
}

test("a few transient bounces are still left alone", async () => {
  // Three prior plus this one is four: under the limit of five. The whole point
  // of the original rule — a recovering mailbox is not a dead one.
  const { written, eventRow } = await withStubs(transient(), 3);
  assert.equal(written, null, "a recovering mailbox must not be marked undeliverable");
  assert.match(eventRow.action, /recorded only/);
});

test("the fifth transient bounce in the window marks the address undeliverable", async () => {
  // Four prior plus this one is five.
  const { written, eventRow } = await withStubs(transient(), 4);
  assert.ok(written, "the fifth transient bounce must stop the sending");
  assert.equal(written.emailUndeliverable, true);
  assert.equal(written.emailUndeliverableReason, "bounce");

  // The count has to survive into what is written down. "marked undeliverable"
  // with no number cannot be told apart from a permanent bounce during a
  // support call, which is the question MailEvent.action exists to answer.
  assert.match(
    String(written.emailUndeliverableDetail),
    /5 transient bounces/,
    "the detail must say how many, so support can explain the decision",
  );
  assert.match(eventRow.action, /5 transient bounces in 14 days/);

  // And the receiving server's own words are not thrown away.
  assert.match(String(written.emailUndeliverableDetail), /over quota/);
});

test("the consent fields are left alone — a bounce is not a person", async () => {
  // The argument mailFeedback.js makes about not writing a bounce into a consent
  // field holds just as much when the bounce is a repeated transient one.
  const { written } = await withStubs(transient(), 9);
  assert.ok(written);
  assert.equal(
    written["emailPrefs.marketing"],
    undefined,
    "a bouncing mailbox has not asked to be unsubscribed",
  );
});

test("a permanent bounce still needs only one, and says nothing about counting", async () => {
  const { written, eventRow } = await withStubs(
    transient({ bounceType: "Permanent", bounceSubType: "General", permanent: true }),
    0,
  );
  assert.ok(written, "a permanent bounce is final on the first one");
  assert.equal(written.emailUndeliverable, true);
  assert.equal(eventRow.action, "marked undeliverable");
  assert.doesNotMatch(
    String(written.emailUndeliverableDetail),
    /transient/,
    "a permanent bounce must not be reported as a repeated transient one",
  );
});

test("if the count cannot be read, the address keeps its mail", async () => {
  // Fail open, deliberately. Not suppressing an address that should have been
  // suppressed costs reputation; suppressing one that should not have been costs
  // a customer their receipts and resets. The second is worse, so a database
  // that will not answer must not be able to unsubscribe anybody.
  const { written, eventRow } = await withStubs(transient(), 99, { countThrows: true });
  assert.equal(written, null, "a failed count must not mark anybody undeliverable");
  assert.match(eventRow.action, /recorded only/);
});
