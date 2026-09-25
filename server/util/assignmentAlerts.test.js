import test from "node:test";
import assert from "node:assert/strict";
import { assignmentRows, alertCount, dueDateFor } from "./assignmentAlerts.js";

const H = 3600e3;
const now = new Date("2026-10-10T12:00:00Z").getTime();
const course = (mods) => ({ sku: "BIM101", title: "BIM for QS", modules: mods });
const mod = (code, extra = {}) => ({ code, title: code, requiresSubmission: true, ...extra });
const one = (m, { subs = [], seen = {}, enrolledAt = new Date(now - 30 * 24 * H) } = {}) =>
  assignmentRows({ course: course([m]), enrollment: { createdAt: enrolledAt, assignmentSeen: seen }, submissions: subs, now })[0];

test("due dates: a cohort date wins; otherwise days after enrolling; otherwise none", () => {
  const enrolled = { createdAt: new Date("2026-10-01T00:00:00Z") };
  assert.equal(dueDateFor({ dueAt: "2026-10-20T00:00:00Z", dueAfterDays: 3 }, enrolled).toISOString(), "2026-10-20T00:00:00.000Z");
  assert.equal(dueDateFor({ dueAfterDays: 3 }, enrolled).toISOString(), "2026-10-04T00:00:00.000Z");
  assert.equal(dueDateFor({}, enrolled), null);
});

test("due within 48 hours raises an alert; further off does not", () => {
  const soon = one(mod("W1", { dueAt: new Date(now + 20 * H) }));
  assert.equal(soon.state, "due-soon");
  assert.deepEqual(soon.alerts, ["due-soon"]);
  const later = one(mod("W1", { dueAt: new Date(now + 72 * H) }));
  assert.equal(later.state, "todo");
  assert.deepEqual(later.alerts, []);
});

test("overdue raises an alert", () => {
  const r = one(mod("W1", { dueAt: new Date(now - 5 * H) }));
  assert.equal(r.state, "overdue");
  assert.deepEqual(r.alerts, ["overdue"]);
});

test("a submitted one waits quietly; a marked one says the result is in", () => {
  const sub = { _id: "s1", moduleCode: "W1", createdAt: new Date(now - 2 * H), gradeStatus: "pending" };
  assert.equal(one(mod("W1"), { subs: [sub] }).state, "submitted");
  assert.deepEqual(one(mod("W1"), { subs: [sub] }).alerts, []);
  const marked = { ...sub, gradeStatus: "approved", gradedAt: new Date(now - H), score: 78, feedback: "Good" };
  const r = one(mod("W1"), { subs: [marked] });
  assert.equal(r.state, "marked");
  assert.deepEqual(r.alerts, ["result"]);
  assert.equal(r.submission.score, 78);
});

test("opening the assignment clears its alert; a later alert lights it again", () => {
  const m = mod("W1", { dueAt: new Date(now + 10 * H) });
  assert.deepEqual(one(m, { seen: { W1: new Date(now - H) } }).alerts, [], "seen after due-soon began");
  const overdue = mod("W1", { dueAt: new Date(now - 2 * H) });
  assert.deepEqual(one(overdue, { seen: { W1: new Date(now - 30 * H) } }).alerts, ["overdue"], "seen before it went overdue");
});

test("a read result is not an alert", () => {
  const marked = { _id: "s1", moduleCode: "W1", createdAt: new Date(now - 3 * H), gradeStatus: "rejected", gradedAt: new Date(now - H), feedbackSeenAt: new Date(now) };
  assert.deepEqual(one(mod("W1"), { subs: [marked] }).alerts, []);
});

test("modules without a submission are not assignments; the dot counts assignments with a new alert", () => {
  const rows = assignmentRows({
    course: course([mod("W1", { dueAt: new Date(now - H) }), { code: "L2", requiresSubmission: false }, mod("W3")]),
    enrollment: { createdAt: new Date(now - 10 * 24 * H) },
    submissions: [],
    now,
  });
  assert.equal(rows.length, 2);
  assert.equal(alertCount(rows), 1);
});
