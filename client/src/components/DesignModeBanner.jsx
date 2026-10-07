// src/components/DesignModeBanner.jsx
// Standing notice for Design Access sessions. It exists so nobody designing
// against the admin UI ever mistakes the placeholder data for production
// figures — or reports a fake number as a bug. Rendered app-wide but only
// visible on /admin screens, which is the only place the mask applies.
import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { isDesignAccess } from "../utils/roles.js";
import { FiShield } from "./icons.jsx";

export default function DesignModeBanner() {
  const { user } = useAuth();
  const loc = useLocation();

  if (!isDesignAccess(user)) return null;
  if (!loc.pathname.startsWith("/admin")) return null;

  // NOT ON THE RELEASE DESK OR THE WORK BOARD.
  //
  // The server exempts the approver on exactly these two paths —
  // server/middleware/designMode.js, RELEASE_DESK = /^\/admin\/(releases|work)/,
  // which returns next() before req.designMode is set when the caller is the
  // approver. His verdicts there are real, recorded and acted on: a merge
  // happens off the back of them.
  //
  // This banner did not know that, so it told him "saving is simulated and
  // changes nothing" on the one screen where his saving is the most
  // consequential thing he does. On 3 October he approved a batch, read this
  // banner, and reported that approving had done nothing — it had worked, and
  // the merge went out on it. A notice that contradicts what the screen is
  // doing is worse than no notice.
  //
  // The two pages say it themselves when the mask really did apply, because
  // they know whether this session is the approver (the payload carries
  // isApprover) and this component does not.
  if (/^\/admin\/(releases|work)(\/|$)/.test(loc.pathname)) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center gap-2.5 px-4 md:px-8 py-2 bg-adlm-orange/15 text-adlm-navy dark:text-amber-100 border-b border-adlm-orange/40 backdrop-blur"
    >
      <span className="shrink-0 grid place-items-center w-6 h-6 rounded-md bg-adlm-orange/25 ring-1 ring-adlm-orange/40">
        <FiShield className="w-3.5 h-3.5" />
      </span>
      <p className="text-[12px] md:text-[13px] leading-snug">
        <span className="font-semibold">Design Access</span>: every figure, name
        and record on this screen is placeholder data. Saving is simulated and
        changes nothing.
      </p>
    </div>
  );
}
