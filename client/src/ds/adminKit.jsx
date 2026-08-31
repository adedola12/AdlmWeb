// Non-component helpers for his admin screens.
//
// Split from adminUi.jsx purely so that file exports components and nothing
// else: React Fast Refresh cannot handle a module that mixes the two, and the
// lint rule that enforces it is right — a shared constant living beside a
// component means editing the constant remounts the component.

import React from "react";

/**
 * A status word and the colour it earns. His table, kept in one place for his
 * reason: so "expiring" never means one thing on Subscriptions and another on
 * an account.
 */
const TONE = {
  active: "ok",
  paid: "ok",
  passed: "ok",
  answered: "ok",
  approved: "ok",
  converted: "ok",
  open: "",
  expiring: "due",
  unpaid: "due",
  pending: "due",
  paused: "due",
  expired: "bad",
  overdue: "bad",
  disabled: "bad",
  lapsed: "bad",
  dead: "bad",
  rejected: "bad",
  inactive: "calm",
  closed: "calm",
  returned: "calm",
  // Commerce adds four of its own. A coupon is unusable in four different
  // ways and they are not the same thing: switched off, not started yet, out
  // of uses, or past its date.
  sent: "due",
  draft: "calm",
  spent: "calm",
  scheduled: "due",
  "in-progress": "due",
};

export const toneFor = (word) => TONE[String(word || "").toLowerCase()] ?? "";

/** His toast, as a hook so a screen gets `say()` and the element to render. */
export function useAdmToast(ms = 4600) {
  const [msg, setMsg] = React.useState("");
  const timer = React.useRef(null);

  const say = React.useCallback(
    (text) => {
      setMsg(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(""), ms);
    },
    [ms],
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const toast = (
    <div className="adm-toast" role="status" aria-live="polite" hidden={!msg}>
      {msg}
    </div>
  );

  return [say, toast];
}
