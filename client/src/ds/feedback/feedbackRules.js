// The two small rules from Richard's feedback.js, kept apart from the
// components so they can be tested on their own.

/** A plain string still has to pick a tone; failure words read as errors. */
export function guessTone(msg) {
  return /\b(could not|couldn.t|failed|not saved|invalid|error|denied|refused)\b/i.test(
    String(msg || ""),
  )
    ? "error"
    : "success";
}

/** How long a toast stays: errors longest, then toasts with an action. */
export function toastLife(t) {
  if (t?.ms) return t.ms;
  if (t?.tone === "error") return 7000;
  return t?.action ? 6500 : 4200;
}
