// The cards Ada puts under a reply: a pricing confirm list and a date-range
// report button. Pure helpers, so every rule the card relies on is tested
// without a browser.
//
// THE PRICING CARD WRITES NOTHING UNTIL APPLY
//
// Ada's propose_project_pricing tool (server/services/agentUserData.js) sends
// a list of proposed rates. The card shows them ticked, the user unticks what
// they disagree with, and only Apply posts — to
//
//   POST /projects/:productKey/:id/bill/price-many
//   body { lines: [{ code, rateId, description, unit }] }   (max 500)
//
// The body names WHICH rate goes on WHICH line, never a price: the server
// re-reads every rate from the caller's own RateGen library, exactly as the
// single-line price-from-rate does. `description` and `unit` are the RATE's
// (the fallback the server matches a custom rate on), the same pair
// WorkProjectShell's priceLineFromRate sends.

/** The price-many endpoint's ceiling. */
export const MAX_APPLY_LINES = 500;

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Every line ticked, keyed by code — how the card opens. */
export function allTicked(lines) {
  const out = {};
  for (const l of Array.isArray(lines) ? lines : []) {
    const code = str(l?.code);
    if (code) out[code] = true;
  }
  return out;
}

/** The lines currently ticked, in bill order. */
export function tickedLines(lines, ticks) {
  return (Array.isArray(lines) ? lines : []).filter((l) => ticks?.[str(l?.code)]);
}

/** What applying the ticked lines would add to the bill. */
export function totalOf(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((s, l) => s + num(l?.amount), 0);
}

/** The button's words. */
export function applyLabel(count) {
  if (!count) return "Tick a line to apply";
  return `Apply ${count} rate${count === 1 ? "" : "s"}`;
}

/** The address the card posts to. productKey lowercased, as the shell does. */
export function priceManyPath(project) {
  const key = str(project?.productKey).toLowerCase();
  const id = str(project?.id);
  if (!key || !id) return "";
  return `/projects/${encodeURIComponent(key)}/${encodeURIComponent(id)}/bill/price-many`;
}

/** The request body: which rate on which line, never a price. */
export function priceManyBody(lines) {
  return {
    lines: (Array.isArray(lines) ? lines : []).slice(0, MAX_APPLY_LINES).map((l) => ({
      code: str(l?.code),
      rateId: str(l?.rateId),
      description: str(l?.rateDescription || l?.description),
      unit: str(l?.rateUnit || l?.unit),
    })),
  };
}

/**
 * The endpoint's answer, as the card reports it.
 *
 * 200 → { ...project, _priced: [codes], _skipped: [{code, reason}],
 *         _rateWarnings: [strings] }. Anything missing is treated as empty
 * rather than as a failure: a reply that priced lines and said nothing about
 * skips has still priced them.
 */
export function summariseResult(res, sentCount = 0) {
  const priced = Array.isArray(res?._priced) ? res._priced.map(str).filter(Boolean) : [];
  const skipped = Array.isArray(res?._skipped)
    ? res._skipped.map((s) => ({ code: str(s?.code), reason: str(s?.reason) || "Not priced" }))
    : [];
  const warnings = Array.isArray(res?._rateWarnings) ? res._rateWarnings.map(str).filter(Boolean) : [];
  const parts = [];
  parts.push(`${priced.length} line${priced.length === 1 ? "" : "s"} priced`);
  if (skipped.length) parts.push(`${skipped.length} skipped`);
  return {
    priced,
    skipped,
    warnings,
    sentCount,
    headline: `${parts.join(", ")}.`,
  };
}

/**
 * Why an Apply failed, in words. The endpoint answers 403 for a view-only or
 * rate-masked user and 404 for a project that is not theirs; anything else is
 * whatever it said, or a plain fallback.
 */
export function applyErrorMessage(err) {
  const status = num(err?.status || err?.response?.status);
  const code = str(err?.code || err?.data?.code || err?.response?.data?.code);
  if (code === "VIEW_ONLY") return "You have view-only access to this project, so rates cannot be applied.";
  if (status === 403) return "Your access to this project does not allow pricing it.";
  if (status === 404) return "That project could not be found on your account.";
  const msg = str(err?.message);
  return msg || "The rates could not be applied just now. Nothing was changed.";
}

// Spelt out here rather than left to toLocaleDateString, whose short month
// differs between browsers ("Sep" in one, "Sept" in another).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** "1 Sept 2026 to 30 Sept 2026" for a report card. En dash when unknown. */
export function rangeLabel(from, to) {
  const fmt = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(d));
    if (!m) return "";
    const month = MONTHS[Number(m[2]) - 1];
    return month ? `${Number(m[3])} ${month} ${m[1]}` : "";
  };
  const a = fmt(from);
  const b = fmt(to);
  if (!a && !b) return "–";
  if (!a) return `Up to ${b}`;
  if (!b) return `From ${a}`;
  return a === b ? a : `${a} to ${b}`;
}

/** The event the rest of the app listens for after Ada's card changed a project. */
export const PROJECT_UPDATED_EVENT = "adlm:project-updated";
/** The event that opens Ada, optionally with a question put in the box. */
export const ADA_OPEN_EVENT = "adlm:ada-open";

/** Open Ada from anywhere, with `prompt` placed in the input (not sent). */
export function openAda(prompt = "") {
  try {
    window.dispatchEvent(new CustomEvent(ADA_OPEN_EVENT, { detail: { prompt: str(prompt) } }));
  } catch {
    /* no window (tests, SSR): nothing to open */
  }
}
