import React from "react";
// The sign-up form's ticket (server/util/signupGuard.js). Fetched when the
// form opens; fetched again at submit if it is getting old, so somebody who
// leaves the tab open for an afternoon is not refused.
import { api } from "../api.js";

const FRESH_MS = 90 * 60 * 1000;

export function useSignupTicket() {
  const ref = React.useRef({ ticket: "", at: 0 });
  React.useEffect(() => {
    let alive = true;
    api("/auth/signup-ticket")
      .then((d) => {
        if (alive) ref.current = { ticket: d?.ticket || "", at: Date.now() };
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return React.useCallback(async () => {
    const cur = ref.current;
    if (cur.ticket && Date.now() - cur.at < FRESH_MS) return cur.ticket;
    try {
      const d = await api("/auth/signup-ticket");
      ref.current = { ticket: d?.ticket || "", at: Date.now() };
    } catch {
      /* the server will say so */
    }
    return ref.current.ticket;
  }, []);
}

// The field people never see. Bots that fill every field fill this one.
export const HONEYPOT_FIELD = "company_website";
