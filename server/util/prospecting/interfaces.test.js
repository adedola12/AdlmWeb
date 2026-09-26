// server/util/prospecting/interfaces.test.js
//
// The phase 2 and 3 seams: in phase 1 nothing can send or read mail, and the
// rules phase 3 must follow are pinned down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DisabledSender, SendingDisabled, getSender } from "./sender.js";
import { REPLY_ACTIONS, REPLY_CLASSES, getReplyHandler } from "./replyHandler.js";

test("the default sender refuses to send", async () => {
  const s = getSender(undefined);
  assert.ok(s instanceof DisabledSender);
  await assert.rejects(s.send({ to: "a@b.example", subject: "x", body: "y" }), SendingDisabled);
});

test("an unknown or not-yet-built sender is an error, never a fallback", () => {
  assert.throws(() => getSender("gmail"), /not available yet/);
  assert.throws(() => getSender("ses"), /not available yet/);
  assert.throws(() => getSender("resend"), /not available yet/);
});

test("the daily limit per inbox is 20", () => {
  assert.equal(getSender().dailyLimitPerInbox, 20);
});

test("the reply handler refuses in phase 1", async () => {
  await assert.rejects(getReplyHandler().handle({ text: "stop" }), /not switched on/);
});

test("the four reply classes, and every one stops the follow-ups", () => {
  assert.deepEqual(REPLY_CLASSES, ["interested", "not_now", "wrong_person", "opt_out"]);
  for (const c of REPLY_CLASSES) assert.equal(REPLY_ACTIONS[c].stopFollowUps, true, c);
});

test("only opt-out suppresses, and only interested needs an admin before a booking goes out", () => {
  assert.deepEqual(REPLY_CLASSES.filter((c) => REPLY_ACTIONS[c].suppress), ["opt_out"]);
  assert.deepEqual(REPLY_CLASSES.filter((c) => REPLY_ACTIONS[c].needsAdminApproval), ["interested"]);
});
