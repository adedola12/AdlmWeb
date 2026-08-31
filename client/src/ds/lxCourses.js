// The pieces My learning and Certificates both need, in one place so the two
// screens cannot drift apart on what a course row means.
//
// Helpers only — the ticket lives in LxCertTicket.jsx, because react-refresh
// wants a module to export components or values, not both.

// He writes small counts as words — "Two enrolments on this account".
export const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six",
  "Seven", "Eight", "Nine", "Ten"];

export const clock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const mm = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, "0");
  const h = Math.floor(s / 3600);
  // His lessons all run under an hour, so his clock never carried one and a
  // two-hour ADLM session came out as "112:04".
  return h ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

export const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

// Instructions and blurbs are authored as prose and can run long. Cut on a word
// rather than mid-syllable.
export const trim = (text, max) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  // Cut on a word, then drop any dangling punctuation the cut left behind —
  // otherwise a blurb ending mid-clause reads "…structural works —…".
  const onWord = cut.slice(0, cut.lastIndexOf(" ") || max);
  return `${onWord.replace(/[\s–—\-,;:.]+$/, "")}…`;
};

/** One /me/courses entry, flattened to what the screens actually draw. */
export function toRow(c) {
  const mods = Array.isArray(c.moduleSubmissions) ? c.moduleSubmissions : [];
  const done = Number(c.summary?.completedModules ?? 0);
  const total = Number(c.summary?.totalModules ?? mods.length);
  // The next lesson is the first one not finished, which is not necessarily the
  // one after the last completed — somebody can skip.
  const nextIndex = mods.findIndex((m) => !m.completed);
  return {
    sku: c.course?.sku || c.enrollment?.courseSku || "",
    title: c.course?.title || c.course?.sku || "Course",
    blurb: c.course?.blurb || "",
    thumb: c.course?.thumbnailUrl || "",
    templateUrl: c.course?.certificateTemplateUrl || "",
    pct: Math.max(0, Math.min(100, Number(c.progress) || 0)),
    done,
    total,
    next: nextIndex >= 0 ? mods[nextIndex] : null,
    nextNumber: nextIndex >= 0 ? nextIndex + 1 : 0,
    // A course is "organised into weeks" only if somebody actually set them in
    // the admin editor. Courses that predate the field carry week 0 on every
    // module, and for those the flat lesson number is the honest label.
    weeks: Math.max(0, ...mods.map((m) => Number(m.week || 0) || 0)),
    firstWeek: Math.min(...mods.map((m) => Number(m.week || 0) || 0), 0) || 1,
    accessLabel: c.access?.label || "",
    expired: !!c.access?.isExpired,
    classroomUrl: c.classroom?.joinUrl || "",
    completed: c.enrollment?.status === "completed",
    issuedAt: c.enrollment?.certificateIssuedAt || c.enrollment?.updatedAt || null,
    certificateRef: c.enrollment?.certificateRef || "",
    pending: Number(c.summary?.pendingAssignments || 0),
  };
}

/** The person this account belongs to — his third column on a course card. */
export function accountName(user) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    ""
  );
}

/** The name that will be printed on the PDF, not just the account's name. */
export function certificateName(user) {
  return (
    [user?.certificateFirstName || user?.firstName,
      user?.certificateLastName || user?.lastName]
      .filter(Boolean)
      .join(" ") || user?.email || ""
  );
}

/** Whether this enrolment has a certificate somebody can actually download. */
export const certReady = (r) => r.completed && !!r.templateUrl;

/** "3d", "1w" — his .ago column. Short, because the column is narrow. */
export function ago(d) {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo` : `${Math.floor(days / 365)}y`;
}
