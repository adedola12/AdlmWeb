// Pure helpers shared across flyer templates. No React, no side effects.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Whole days from today (local midnight) until an ISO date string (YYYY-MM-DD).
// Clamped at 0 so a past date reads "0" rather than going negative.
export function daysUntil(dateStr) {
  if (!dateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

// Friendly date range. Collapses same-month ranges ("5–9 May 2026") and
// single days ("5 May 2026"). Empty start → "".
export function formatDateRange(start, end) {
  if (!start) return "";
  const a = new Date(`${start}T00:00:00`);
  if (Number.isNaN(a.getTime())) return "";
  if (!end || end === start) {
    return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(b.getTime())) {
    return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

// Split a title into words and mark which index is the accent-coloured word.
// Returns [{ text, accent }]. Falls back to the last word when index is unset.
export function highlightWords(title, highlightWordIndex, accent) {
  const words = String(title || "").split(" ");
  const idx =
    highlightWordIndex == null || highlightWordIndex < 0
      ? words.length - 1
      : Math.min(highlightWordIndex, words.length - 1);
  return words.map((text, i) => ({
    text,
    color: i === idx ? accent : undefined,
  }));
}

// Normalise a URL for QR/registration display: strip protocol for the label,
// keep a fully-qualified href for the QR payload.
export function splitUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return { label: "", href: "" };
  const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const label = v.replace(/^https?:\/\//i, "");
  return { label, href };
}
