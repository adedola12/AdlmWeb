// iCalendar (.ics) exporter for PM task schedules.
//
// Outputs RFC 5545–compliant calendar text that imports cleanly into
// Google Calendar, Outlook, Apple Calendar, and any other consumer. One
// VEVENT per *leaf* task (summary tasks are skipped — they'd duplicate
// their children's spans and clutter the calendar). Milestones (0-day
// tasks) become a single-day all-day event.
//
// Dates are emitted as VALUE=DATE rather than DATE-TIME so the events
// sit in the user's local timezone as all-day blocks — matching how MS
// Project / construction schedules are usually planned (day granularity,
// no fixed start hour).

const CRLF = "\r\n";

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// RFC 5545 TEXT escape: backslash, comma, semicolon, newline.
function escapeText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// DTSTAMP / created-at format: 20251023T141559Z (basic ISO without dashes/colons).
function fmtUtcStamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// VALUE=DATE format: 20251023 (no time component). Use the *local* date —
// the iCal spec says VALUE=DATE events are floating / location-agnostic.
function fmtDateOnly(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}

// Fold a single content line to a max of 75 octets, with continuation lines
// prefixed by a single space (RFC 5545 § 3.1). We're conservative — many
// consumers tolerate longer lines, but Outlook in particular gets unhappy.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + 75);
    parts.push(i === 0 ? slice : " " + slice);
    i += 75;
  }
  return parts.join(CRLF);
}

// Stable UID per task. Uses taskId when available, falls back to a hash
// of (wbs + name + index). Includes the project id so two projects with
// the same task name don't collide in the same calendar app.
function buildUid(task, projectId, index) {
  const base =
    task?.taskId ||
    `${task?.wbs || ""}-${task?.name || `task-${index}`}`.toLowerCase().replace(/\s+/g, "-");
  return `${base}@adlm-${projectId || "project"}.adlmstudio.net`;
}

function statusForIcal(task) {
  const pct = safeNum(task?.percentComplete);
  if (task?.status === "completed" || pct >= 100) return "COMPLETED";
  if (task?.status === "in-progress" || pct > 0) return "IN-PROCESS";
  if (task?.status === "blocked") return "CANCELLED"; // closest stock value
  return "TENTATIVE";
}

function priorityForIcal(priority) {
  // RFC 5545 numeric priorities (1 = highest, 9 = lowest). Map roughly:
  switch (priority) {
    case "critical":
      return 1;
    case "high":
      return 3;
    case "medium":
      return 5;
    case "low":
      return 7;
    default:
      return 5;
  }
}

// Compose a per-task DESCRIPTION block. Keeps it readable while still
// fitting in a single (foldable) line. The user will see this when they
// click the event in their calendar app.
function buildDescription(task, projectName) {
  const bits = [];
  if (projectName) bits.push(`Project: ${projectName}`);
  if (task?.wbs) bits.push(`WBS: ${task.wbs}`);
  if (task?.durationDays) bits.push(`Duration: ${task.durationDays} day${task.durationDays === 1 ? "" : "s"}`);
  const pct = safeNum(task?.percentComplete);
  if (pct > 0) bits.push(`% Complete: ${pct}%`);
  if (task?.assignedTo) bits.push(`Assignee: ${task.assignedTo}`);
  if (task?.resourceNames) bits.push(`Resources: ${task.resourceNames}`);
  if (task?.priority) bits.push(`Priority: ${task.priority}`);
  if (task?.notes) bits.push(`Notes: ${task.notes}`);
  if (Array.isArray(task?.predecessors) && task.predecessors.length) {
    bits.push(`Predecessors: ${task.predecessors.join(", ")}`);
  }
  return bits.join("\\n");
}

// Sanitize the project name for a filename. Calendar apps will display
// the X-WR-CALNAME inside the app; the filename is what the user sees in
// their download tray.
export function suggestedIcsFilename(projectName) {
  const safe = String(projectName || "project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safe || "project"}.ics`;
}

// Main entry. Returns RFC 5545 text. `project` is the TakeoffProject doc
// (lean or hydrated). `tasks` is the array we want exported — usually the
// rolled-up dashboard tasks so users get the same hierarchy view they see
// on screen.
export function generateIcs({ project, tasks, includeSummaryRows = false } = {}) {
  if (!project || !Array.isArray(tasks)) {
    throw new Error("generateIcs: project and tasks are required");
  }

  const projectName = String(project?.name || "Project").trim() || "Project";
  const projectId = String(project?._id || project?.id || "").trim();
  const now = fmtUtcStamp(new Date());

  // Calendar header
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADLM Studio//PM Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(projectName)}`,
    `X-WR-CALDESC:${escapeText("Project schedule exported from ADLM PM Dashboard")}`,
  ];

  let included = 0;
  let skipped = 0;

  tasks.forEach((task, idx) => {
    // Skip summary rows by default — their dates duplicate leaf ranges.
    // Users can opt in via includeSummaryRows for an annotated overview.
    if (!includeSummaryRows && task?.isSummary) {
      skipped += 1;
      return;
    }

    const startDate = task?.startDate ? new Date(task.startDate) : null;
    const endDate = task?.endDate ? new Date(task.endDate) : null;
    if (
      !startDate || Number.isNaN(startDate.getTime()) ||
      !endDate || Number.isNaN(endDate.getTime())
    ) {
      skipped += 1;
      return;
    }

    // For VALUE=DATE events, DTEND is *exclusive* (the day after the last
    // covered day). So a 5-day task starting Mon ends Saturday in iCal
    // terms (Mon-Fri = 5 days, DTEND = Sat). We add 1 day to endDate.
    // Milestones (0-duration) become a single-day block (DTEND = next day).
    const inclusiveEnd = new Date(endDate.getTime());
    inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
    if (inclusiveEnd <= startDate) {
      // Bad data — DTEND must be > DTSTART. Force a one-day window.
      inclusiveEnd.setTime(startDate.getTime() + 24 * 60 * 60 * 1000);
    }

    const dtStart = fmtDateOnly(startDate);
    const dtEnd = fmtDateOnly(inclusiveEnd);
    if (!dtStart || !dtEnd) {
      skipped += 1;
      return;
    }

    const summaryText = task?.wbs
      ? `[${task.wbs}] ${task.name || "(unnamed)"}`
      : (task?.name || "(unnamed)");

    const event = [
      "BEGIN:VEVENT",
      `UID:${buildUid(task, projectId, idx)}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${escapeText(summaryText)}`,
      `DESCRIPTION:${buildDescription(task, projectName)}`,
      `STATUS:${statusForIcal(task)}`,
      `PRIORITY:${priorityForIcal(task?.priority)}`,
      `CATEGORIES:${escapeText([task?.priority || "medium", task?.status || "not-started"].join(","))}`,
      `TRANSP:TRANSPARENT`, // doesn't block free/busy — tasks aren't meetings
    ];
    if (task?.isMilestone) {
      event.push("X-MICROSOFT-CDO-BUSYSTATUS:FREE");
    }
    event.push("END:VEVENT");

    for (const ln of event) {
      lines.push(foldLine(ln));
    }
    included += 1;
  });

  lines.push("END:VCALENDAR");

  return {
    body: lines.join(CRLF) + CRLF,
    filename: suggestedIcsFilename(projectName),
    included,
    skipped,
  };
}
