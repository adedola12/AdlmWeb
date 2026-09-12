// server/util/mailFeedback.js
//
// What to do when a message comes back.
//
// Until now nothing consumed bounces at all. A dead address stayed on the list
// and was mailed again on every campaign, which is exactly how a sender's
// reputation is spent: mailbox providers judge you on the proportion of your
// mail that fails, so a handful of addresses that will never accept anything
// again slowly cost delivery for everybody who would have read it.
//
// THE THREE OUTCOMES ARE NOT THE SAME THING
//
//   Permanent bounce   the address does not exist. Stop sending bulk to it.
//   Transient bounce   a full mailbox, a server having an afternoon. Record
//                      it, do nothing. Treating this as death would
//                      unsubscribe people for an outage they had no part in,
//                      and the ones it would hit hardest are corporate
//                      mailboxes — which is to say, the customers.
//   Complaint          somebody pressed "spam". Not a dead address: a person
//                      saying stop. So everything optional stops, and the
//                      address stays perfectly good for their receipts.
//
// Conflating the last two is the classic mistake. A complaint means "I don't
// want this"; a bounce means "there is nobody here". Acting on either as if it
// were the other is wrong in a way the customer notices.
//
// NOTHING HERE THROWS AT THE CALLER
//
// This runs on a queue, and a throw is a retry. Retrying a bounce we have
// already recorded achieves nothing and, if the failure is permanent — a
// malformed message, a user id that no longer exists — it retries forever.
// So every handler reports what it did and swallows what it cannot fix.

import { User } from "../models/User.js";
import { MailEvent } from "../models/MailEvent.js";
import { EmailSend } from "../models/EmailSend.js";

/** SES trims nothing, and a diagnostic can be a whole rejected header block. */
const DETAIL_MAX = 500;

const trim = (s) => String(s || "").slice(0, DETAIL_MAX);
const addr = (s) => String(s || "").trim().toLowerCase();

/* ──────────────────────────────────────────────────────────────── parsing ── */

/**
 * Normalise one SES notification into the shape the rest of this file uses.
 *
 * TWO SHAPES, ONE PARSER. Configuration-set event publishing calls the field
 * `eventType`; the older identity-level notifications call it
 * `notificationType`, and the bodies are otherwise the same. Both are read,
 * because which one arrives depends on console configuration nobody will
 * remember making, and a parser that understands only the shape we intended to
 * set up fails silently against the one that was actually set up.
 *
 * Returns [] for anything that is not a bounce or a complaint — deliveries,
 * opens, sends. Those are real events and SES may well deliver them; they are
 * simply not this file's business, and treating an unknown type as an error
 * would turn "someone ticked an extra box in the console" into a queue of
 * failing messages.
 */
export function parseFeedback(raw) {
  let body = raw;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return [];
    }
  }
  if (!body || typeof body !== "object") return [];

  const type = String(body.eventType || body.notificationType || "").toLowerCase();
  const messageId = String(body.mail?.messageId || "");

  if (type === "bounce") {
    const b = body.bounce || {};
    const bounceType = String(b.bounceType || "");
    return (b.bouncedRecipients || []).map((r) => ({
      type: "bounce",
      email: addr(r.emailAddress),
      bounceType,
      bounceSubType: String(b.bounceSubType || ""),
      // diagnosticCode is the receiving server's own words and is the useful
      // one; status is the bare 5.1.1 and is better than nothing.
      detail: trim(r.diagnosticCode || r.status || ""),
      messageId,
      feedbackId: String(b.feedbackId || ""),
      // The decision, made here rather than at the database: only a permanent
      // failure means the address is gone.
      permanent: bounceType === "Permanent",
    }));
  }

  if (type === "complaint") {
    const c = body.complaint || {};
    const complaintType = String(c.complaintFeedbackType || "");
    return (c.complainedRecipients || []).map((r) => ({
      type: "complaint",
      email: addr(r.emailAddress),
      complaintType,
      detail: trim(c.complaintFeedbackType || ""),
      messageId,
      feedbackId: String(c.feedbackId || ""),
      // "not-spam" is a complaint record that means the OPPOSITE — somebody
      // moved the message back out of their spam folder. Acting on it would
      // unsubscribe the one person who went to the trouble of saying they
      // wanted it.
      wantsOut: complaintType !== "not-spam",
    }));
  }

  // --- engagement ---------------------------------------------------------
  // Open and Click carry no recipient list of their own the way a bounce does;
  // the address is the message's destination. SES sends one event per
  // recipient, so taking the first is correct rather than a simplification.
  //
  // These are recorded against the message, never against the person's User
  // row: an open is not consent and not a complaint, and applyFeedback must
  // not be able to change what somebody is subscribed to because their mail
  // client fetched an image.
  if (type === "open" || type === "click") {
    const at = body[type]?.timestamp || body.mail?.timestamp || null;
    return [
      {
        type,
        email: addr(body.mail?.destination?.[0]),
        messageId,
        at: at ? new Date(at) : new Date(),
        userAgent: trim(body[type]?.userAgent || ""),
        // Only Click carries a link. Kept because "which link" is the whole
        // reason to record a click at all.
        link: type === "click" ? trim(body.click?.link || "") : "",
      },
    ];
  }

  return [];
}

/**
 * Unwrap an SNS delivery.
 *
 * The SES payload is a JSON string inside `Records[].Sns.Message`, so it is
 * parsed twice — once out of SNS and once out of the string. A subscription
 * confirmation arrives on the same path and carries no Message worth reading;
 * it is skipped rather than treated as a malformed event.
 */
export function parseSnsRecords(event) {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  return records.flatMap((r) => parseFeedback(r?.Sns?.Message));
}

/* ─────────────────────────────────────────────────────────────── applying ── */

/**
 * Act on one parsed event, and write down what was done.
 *
 * The MailEvent row is written for EVERY event, including the ones that change
 * nothing. A transient bounce that is recorded and ignored is information —
 * three of them for the same address in a week is a conversation to have with
 * that customer's IT department — whereas a transient bounce that is silently
 * dropped is indistinguishable from mail that arrived.
 */
export async function applyFeedback(ev, { log = console } = {}) {
  if (!ev?.email) return { ok: false, action: "no address in event" };

  // Opens and clicks land on the send log and stop there. They never reach the
  // User branches below, so no engagement event can alter a consent field.
  if (ev.type === "open" || ev.type === "click") {
    if (!ev.messageId) return { ok: true, action: "engagement event with no message id" };
    try {
      const open = ev.type === "open";
      const { modifiedCount } = await EmailSend.updateOne(
        { messageId: ev.messageId },
        {
          $inc: open ? { openCount: 1 } : { clickCount: 1 },
          $max: open ? { lastOpenAt: ev.at } : { lastClickAt: ev.at },
          // setOnInsert is no use here - the row already exists - so "first"
          // is written only while it is still null.
          ...(open
            ? {}
            : { $set: ev.link ? { lastLink: ev.link } : {} }),
        },
      );
      if (!modifiedCount) return { ok: true, action: `${ev.type}: no matching send` };

      const firstField = open ? "firstOpenAt" : "firstClickAt";
      await EmailSend.updateOne(
        { messageId: ev.messageId, [firstField]: null },
        { $set: { [firstField]: ev.at } },
      );
      return { ok: true, action: `${ev.type} recorded` };
    } catch (err) {
      log.error?.("[mail-feedback] engagement write failed:", err?.message || err);
      return { ok: false, action: `${ev.type} not recorded` };
    }
  }

  let action = "";
  let user = null;

  try {
    user = await User.findOne({ email: ev.email }).select("_id email").lean();
  } catch (err) {
    log.error?.("[mail-feedback] user lookup failed:", err?.message || err);
  }

  if (!user) {
    // Normal, not an error: a proforma to a prospect, a support reply to
    // somebody who never signed up, an address that has since been changed.
    action = "no account for this address";
  } else if (ev.type === "bounce" && !ev.permanent) {
    action = `transient bounce (${ev.bounceSubType || "unspecified"}), recorded only`;
  } else if (ev.type === "bounce") {
    // ONLY the undeliverable fields. Not the marketing and video preferences,
    // even though switching those off would also stop the mail.
    //
    // They record what the PERSON wants, and a bounce is not a person — it is
    // their mail server. Writing a bounce into a consent field destroys the
    // distinction between "their mailbox broke" and "they asked us to stop",
    // and the damage shows up later: somebody who genuinely unsubscribed in
    // March and whose mailbox then died in June would have their March
    // decision overwritten with "bounced", and the un-mark button below would
    // cheerfully resubscribe them to mail they had already refused.
    //
    // `emailUndeliverable` already excludes them from every bulk send, so the
    // second write bought nothing and cost the one fact worth keeping.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailUndeliverable: true,
          emailUndeliverableAt: new Date(),
          emailUndeliverableReason: "bounce",
          emailUndeliverableDetail: ev.detail || "",
        },
      },
    );
    action = "marked undeliverable";
  } else if (ev.type === "complaint" && !ev.wantsOut) {
    // complaintFeedbackType "not-spam". Recorded, deliberately not acted on.
    action = "not-spam report, no change";
  } else {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "emailPrefs.marketing": false,
          "emailPrefs.marketingChangedAt": new Date(),
          "emailPrefs.marketingOffReason": "complained",
          "emailPrefs.videoUpdates": false,
          "emailPrefs.videoUpdatesChangedAt": new Date(),
        },
      },
    );
    // NOT emailUndeliverable. The address works; the person is telling us to
    // stop sending things they did not ask for, which their receipts are not.
    action = "opted out of all non-essential mail";
  }

  try {
    await MailEvent.create({
      type: ev.type,
      email: ev.email,
      userId: user?._id || null,
      bounceType: ev.bounceType || "",
      bounceSubType: ev.bounceSubType || "",
      complaintType: ev.complaintType || "",
      detail: ev.detail || "",
      messageId: ev.messageId || "",
      feedbackId: ev.feedbackId || "",
      action,
    });
  } catch (err) {
    // The decision has already been applied to the User record. Losing the
    // evidence row is bad; undoing the decision because we could not write the
    // evidence would be worse.
    log.error?.("[mail-feedback] could not record event:", err?.message || err);
  }

  return { ok: true, action, email: ev.email, matched: !!user };
}

/**
 * Everything in one SNS delivery.
 *
 * Sequential, not parallel: a batch is a handful of recipients at most, and
 * two events for the same address arriving together should be applied in the
 * order they were sent rather than racing each other to the same document.
 */
export async function handleMailFeedback(event, { log = console } = {}) {
  const parsed = parseSnsRecords(event);

  if (!parsed.length) {
    log.log?.("[mail-feedback] nothing actionable in this delivery");
    return { handled: 0, results: [] };
  }

  const results = [];
  for (const ev of parsed) {
    const r = await applyFeedback(ev, { log });
    results.push(r);
    log.log?.(`[mail-feedback] ${ev.type} ${ev.email}: ${r.action}`);
  }

  return { handled: results.length, results };
}
