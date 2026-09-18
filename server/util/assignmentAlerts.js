// Assignment state and alerts (R11/R13, 2026-09-18).
//
// For every module that asks for a submission, on every course a learner is
// enrolled in, one state:
//
//   todo      not submitted, not yet due soon
//   due-soon  not submitted, due within 48 hours
//   overdue   not submitted, past its due date
//   submitted the latest submission is waiting to be marked
//   marked    the latest submission is approved or returned
//
// and the alerts that go with it: "due within 48 hours", "overdue" and
// "result available". An alert has a `since` time; it counts as NEW (the red
// dot, the bell) until the learner has opened that assignment after `since`
// (enrollment.assignmentSeen[moduleCode]), so looking at it clears it and an
// overdue that arrives later lights it again.
//
// Due dates: a module's own `dueAt` (a cohort date), else `dueAfterDays` after
// the learner enrolled, else no due date (never due-soon or overdue).

const HOUR = 3600e3;
export const DUE_SOON_HOURS = 48;

export function dueDateFor(module, enrollment) {
  if (module?.dueAt) return new Date(module.dueAt);
  const days = Number(module?.dueAfterDays) || 0;
  const start = enrollment?.createdAt || enrollment?.startedAt;
  if (days > 0 && start) return new Date(new Date(start).getTime() + days * 24 * HOUR);
  return null;
}

function latest(subs) {
  return [...(subs || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

/**
 * @param {object} p
 * @param {object} p.course       { sku, title, modules: [...] }
 * @param {object} p.enrollment   { createdAt, assignmentSeen: { [code]: Date } }
 * @param {Array}  p.submissions  this learner's submissions for this course
 * @param {number} [p.now]
 * @returns {Array<object>} one row per assignment
 */
export function assignmentRows({ course, enrollment, submissions, now = Date.now() }) {
  const seen = enrollment?.assignmentSeen || {};
  const seenAt = (code) => {
    const v = seen instanceof Map ? seen.get(code) : seen[code];
    return v ? new Date(v).getTime() : 0;
  };
  return (course?.modules || [])
    .filter((m) => m?.requiresSubmission)
    .map((m) => {
      const subs = (submissions || []).filter((s) => s.moduleCode === m.code);
      const last = latest(subs);
      const due = dueDateFor(m, enrollment);
      const dueMs = due ? due.getTime() : null;
      let state;
      if (last && last.gradeStatus && last.gradeStatus !== "pending") state = "marked";
      else if (last) state = "submitted";
      else if (dueMs !== null && now > dueMs) state = "overdue";
      else if (dueMs !== null && dueMs - now <= DUE_SOON_HOURS * HOUR) state = "due-soon";
      else state = "todo";

      const alerts = [];
      if (state === "due-soon") alerts.push({ kind: "due-soon", since: dueMs - DUE_SOON_HOURS * HOUR });
      if (state === "overdue") alerts.push({ kind: "overdue", since: dueMs });
      if (state === "marked" && !last.feedbackSeenAt) {
        alerts.push({ kind: "result", since: new Date(last.gradedAt || last.updatedAt || now).getTime() });
      }
      const fresh = alerts.filter((a) => a.since > seenAt(m.code));

      return {
        courseSku: course.sku,
        courseTitle: course.title || course.sku,
        moduleCode: m.code,
        moduleTitle: m.title || m.code,
        week: Number(m.week) || 0,
        prompt: m.assignmentPrompt || "",
        dueAt: due ? due.toISOString() : null,
        state,
        submission: last
          ? {
              id: String(last._id || ""),
              fileName: last.fileName || "",
              fileUrl: last.fileUrl || "",
              submittedAt: last.createdAt,
              status: last.gradeStatus || "pending",
              feedback: last.feedback || "",
              score: typeof last.score === "number" ? last.score : null,
              gradedBy: last.gradedByName || "",
              gradedAt: last.gradedAt || null,
            }
          : null,
        alerts: fresh.map((a) => a.kind),
      };
    });
}

/** Count of assignments carrying a new alert (the rail's red dot). */
export function alertCount(rows) {
  return (rows || []).filter((r) => r.alerts.length > 0).length;
}
