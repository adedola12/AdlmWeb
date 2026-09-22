import React from "react";
// The sign-up form's ticket (server/util/signupGuard.js). Fetched when the
// form opens and refreshed every hour, so a tab left open for an afternoon
// still has a good one. The server refuses a ticket used within 3 seconds of
// being issued, so a ticket that had to be fetched at submit is held until it
// is old enough (review of the sign-up protection, 2026-09-22).
import { api } from "../api.js";

const FRESH_MS = 90 * 60 * 1000;
const REFRESH_MS = 60 * 60 * 1000;
const MIN_AGE_MS = 3500; // the server's MIN_FILL_MS, plus a margin

async function fetchTicket() {
  const d = await api("/auth/signup-ticket");
  return { ticket: d?.ticket || "", at: Date.now() };
}

export function useSignupTicket() {
  const ref = React.useRef({ ticket: "", at: 0 });
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      fetchTicket()
        .then((t) => {
          if (alive) ref.current = t;
        })
        .catch(() => {});
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return React.useCallback(async () => {
    if (!ref.current.ticket || Date.now() - ref.current.at > FRESH_MS) {
      try {
        ref.current = await fetchTicket();
      } catch {
        return ref.current.ticket; // the server will say so
      }
    }
    const wait = MIN_AGE_MS - (Date.now() - ref.current.at);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return ref.current.ticket;
  }, []);
}

// The field people never see. Bots that fill every field fill this one.
export const HONEYPOT_FIELD = "company_website";
