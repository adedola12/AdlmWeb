// The name a holder writes on their certificate (R14; Richard's learn.js).

export const tidyName = (n) => String(n || "").replace(/\s+/g, " ").trim();

// Letters (any alphabet), spaces, hyphens, apostrophes and full stops.
const NAME_OK = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

export function certNameProblem(raw) {
  const n = tidyName(raw);
  if (!n) return "Write your name to continue.";
  if (n.length < 3 || !n.includes(" ")) return "Use your full name: first name and surname.";
  if (n.length > 40) return "Keep it to 40 characters so it fits on one line.";
  if (!NAME_OK.test(n)) return "Letters, spaces, hyphens and apostrophes only.";
  return "";
}

/** The server stores first and last name; the surname is the last word. */
export function splitName(raw) {
  const n = tidyName(raw);
  const i = n.lastIndexOf(" ");
  return i > 0 ? { firstName: n.slice(0, i), lastName: n.slice(i + 1) } : { firstName: n, lastName: "" };
}

/** A long name steps down in size rather than running off the line (his rule). */
export function nameSize(name) {
  const len = String(name || "").length;
  return len <= 14 ? 7.6 : Math.max(4.2, (7.6 * 14) / len);
}

/** The public check a certificate's QR code opens, on this site. */
export function verifyUrl(ref) {
  const origin =
    typeof window !== "undefined" && /^https?:/.test(window.location.protocol)
      ? window.location.origin
      : "https://www.adlmstudio.net";
  return `${origin}/certificate?ref=${encodeURIComponent(ref || "")}`;
}
