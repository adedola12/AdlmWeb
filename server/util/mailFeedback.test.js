// Bounce and complaint parsing tests.
//
// The apply half of util/mailFeedback.js reads and writes the User collection,
// and a test that needs mongoose connected is a test that gets skipped — the
// same call fx.test.js makes about getFxRate. What is covered here is the part
// that decides, which is also the part where being wrong is expensive and
// silent:
//
//   * treating a Transient bounce as permanent unsubscribes a customer whose
//     mailbox was merely full on Tuesday, and nothing ever tells them;
//   * treating a "not-spam" complaint as a complaint opts out the one person
//     who went to the trouble of rescuing the message from their spam folder;
//   * reading only `eventType` and not `notificationType` means a correctly
//     configured console produces events this code silently ignores.
//
// The payloads below are the shapes SES documents for bounce and complaint
// notifications, reduced to the fields this code reads.

import test from "node:test";
import assert from "node:assert/strict";

import { parseFeedback, parseSnsRecords } from "./mailFeedback.js";

const bounce = (over = {}) => ({
  eventType: "Bounce",
  mail: { messageId: "0100018f-msg-id", destination: ["dead@example.com"] },
  bounce: {
    bounceType: "Permanent",
    bounceSubType: "General",
    feedbackId: "0100018f-feedback",
    bouncedRecipients: [
      {
        emailAddress: "dead@example.com",
        action: "failed",
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      },
    ],
    ...over,
  },
});

const complaint = (over = {}) => ({
  eventType: "Complaint",
  mail: { messageId: "0100018f-msg-id" },
  complaint: {
    complaintFeedbackType: "abuse",
    feedbackId: "0100018f-feedback",
    complainedRecipients: [{ emailAddress: "Cross@Example.com" }],
    ...over,
  },
});

/* ────────────────────────────────────────────────────────────────── bounce ── */

test("a permanent bounce is read as permanent, with the server's own words", () => {
  const [ev] = parseFeedback(bounce());

  assert.equal(ev.type, "bounce");
  assert.equal(ev.email, "dead@example.com");
  assert.equal(ev.permanent, true);
  assert.equal(ev.bounceType, "Permanent");
  assert.equal(ev.bounceSubType, "General");
  assert.equal(ev.detail, "smtp; 550 5.1.1 user unknown");
  assert.equal(ev.messageId, "0100018f-msg-id");
});

test("a transient bounce is NOT permanent", () => {
  // The expensive mistake. A full mailbox on Tuesday says nothing about
  // Wednesday, and corporate mailboxes — which is to say the customers — are
  // exactly the ones that fill up and get quota-bounced.
  for (const bounceType of ["Transient", "Undetermined"]) {
    const [ev] = parseFeedback(bounce({ bounceType, bounceSubType: "MailboxFull" }));
    assert.equal(ev.permanent, false, bounceType);
    assert.equal(ev.bounceType, bounceType);
  }
});

test("every bounced recipient in one notification is returned", () => {
  const evs = parseFeedback(
    bounce({
      bouncedRecipients: [
        { emailAddress: "one@example.com", diagnosticCode: "smtp; 550 no" },
        { emailAddress: "two@example.com", status: "5.2.1" },
      ],
    }),
  );

  assert.equal(evs.length, 2);
  assert.deepEqual(evs.map((e) => e.email), ["one@example.com", "two@example.com"]);
  // status is the fallback when there is no diagnostic — better than nothing,
  // which is what an empty detail column would tell a support call.
  assert.equal(evs[1].detail, "5.2.1");
});

test("a diagnostic long enough to be a rejected header block is trimmed", () => {
  const [ev] = parseFeedback(
    bounce({ bouncedRecipients: [{ emailAddress: "a@b.test", diagnosticCode: "x".repeat(4000) }] }),
  );
  assert.equal(ev.detail.length, 500);
});

/* ─────────────────────────────────────────────────────────────── complaint ── */

test("a complaint is a person saying stop, and the address is normalised", () => {
  const [ev] = parseFeedback(complaint());

  assert.equal(ev.type, "complaint");
  assert.equal(ev.email, "cross@example.com", "addresses are matched lowercased");
  assert.equal(ev.wantsOut, true);
  assert.equal(ev.complaintType, "abuse");
});

test('"not-spam" means the opposite and must not opt anybody out', () => {
  const [ev] = parseFeedback(complaint({ complaintFeedbackType: "not-spam" }));
  assert.equal(ev.type, "complaint");
  assert.equal(
    ev.wantsOut,
    false,
    "this record is somebody rescuing the message FROM their spam folder",
  );
});

test("a complaint with no stated type is still a complaint", () => {
  // Providers are not obliged to say why, and an absent reason is not consent.
  const [ev] = parseFeedback(complaint({ complaintFeedbackType: undefined }));
  assert.equal(ev.wantsOut, true);
});

/* ──────────────────────────────────────────────────────────────── envelope ── */

test("the older notificationType shape is read as well as eventType", () => {
  const older = { ...bounce(), eventType: undefined, notificationType: "Bounce" };
  const [ev] = parseFeedback(older);
  assert.equal(ev.type, "bounce");
  assert.equal(ev.permanent, true);
});

test("events we do not act on are ignored, not failed", () => {
  // SES will publish these the moment somebody ticks an extra box in the
  // console. Treating an unknown type as an error turns that tick into a queue
  // of failing messages and a dead-letter alarm at 3am.
  //
  // Open and Click are no longer on this list - they are read now - so the
  // cases below are the ones still deliberately unhandled.
  for (const eventType of ["Delivery", "Send", "Rendering Failure", "DeliveryDelay"]) {
    assert.deepEqual(parseFeedback({ eventType, mail: {} }), [], eventType);
  }
});

test("an open is read, and carries the message it belongs to", () => {
  const [ev] = parseFeedback({
    eventType: "Open",
    mail: { messageId: "0100018f-msg-id", destination: ["Reader@Example.com"] },
    open: { timestamp: "2026-09-12T09:15:00.000Z", userAgent: "Mozilla/5.0" },
  });
  assert.equal(ev.type, "open");
  assert.equal(ev.email, "reader@example.com", "address is normalised");
  assert.equal(ev.messageId, "0100018f-msg-id");
  assert.equal(ev.at.toISOString(), "2026-09-12T09:15:00.000Z");
  assert.equal(ev.link, "", "an open has no link");
});

test("a click is read, and keeps which link was followed", () => {
  // Which link is the entire reason to record a click. Losing it leaves a
  // number that says somebody was interested in something.
  const [ev] = parseFeedback({
    eventType: "Click",
    mail: { messageId: "0100018f-msg-id", destination: ["reader@example.com"] },
    click: {
      timestamp: "2026-09-12T09:20:00.000Z",
      link: "https://adlmstudio.net/manage/downloads",
      userAgent: "Mozilla/5.0",
    },
  });
  assert.equal(ev.type, "click");
  assert.equal(ev.link, "https://adlmstudio.net/manage/downloads");
  assert.equal(ev.messageId, "0100018f-msg-id");
});

test("an engagement event with no timestamp still has a time", () => {
  // SES has always sent one, but a row with a null date would sort oddly for
  // ever after, and "now" is within seconds of the truth on this path.
  const [ev] = parseFeedback({
    eventType: "Open",
    mail: { messageId: "m", destination: ["a@b.com"] },
    open: {},
  });
  assert.ok(ev.at instanceof Date && !Number.isNaN(ev.at.getTime()));
});

test("an engagement event for an unknown recipient is still parsed", () => {
  // parseFeedback decides shape, not policy. applyFeedback drops an event with
  // no address; this layer must not silently swallow one.
  const out = parseFeedback({ eventType: "Open", mail: { messageId: "m" }, open: {} });
  assert.equal(out.length, 1);
  assert.equal(out[0].email, "");
});

test("rubbish in is an empty list, not a throw", () => {
  assert.deepEqual(parseFeedback("not json at all"), []);
  assert.deepEqual(parseFeedback(null), []);
  assert.deepEqual(parseFeedback(undefined), []);
  assert.deepEqual(parseFeedback(42), []);
  assert.deepEqual(parseFeedback({}), []);
  assert.deepEqual(parseFeedback({ eventType: "Bounce" }), [], "no bounce body");
});

test("the SES payload is unwrapped from its SNS envelope", () => {
  // Double-encoded on purpose: SES puts a JSON string inside the SNS Message
  // field, so it is parsed once out of SNS and once out of the string.
  const event = {
    Records: [
      { Sns: { Message: JSON.stringify(bounce()) } },
      { Sns: { Message: JSON.stringify(complaint()) } },
    ],
  };

  const evs = parseSnsRecords(event);
  assert.deepEqual(evs.map((e) => e.type), ["bounce", "complaint"]);
});

test("a subscription confirmation carries nothing actionable and is skipped", () => {
  const event = {
    Records: [{ Sns: { Type: "SubscriptionConfirmation", Message: "You have chosen to subscribe" } }],
  };
  assert.deepEqual(parseSnsRecords(event), []);
});

test("an event that is not from SNS at all is an empty list", () => {
  assert.deepEqual(parseSnsRecords({}), []);
  assert.deepEqual(parseSnsRecords(null), []);
  assert.deepEqual(parseSnsRecords({ Records: "not an array" }), []);
});
