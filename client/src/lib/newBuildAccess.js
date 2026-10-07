// Who is sent to the new build's screens, decided once.
//
// Before go-live five places each asked canViewPreview(user) for themselves:
// the route gate (components/NewBuildGate.jsx), the rail and the account links
// in ds/DsAppShell.jsx (lib/railGate.js), the project-card links
// (lib/useProjectHref.js) and the /projects/:tool?project= redirect
// (components/ClassicProjectRedirect.jsx). The 1 October go-live (11da95ca, "the
// new build is the build") lowered the route gate and nothing else, so the
// other four kept sending customers to classic pages: Projects to /portfolio,
// the tool pages to /projects/:tool, Billing to /profile, Overview to
// /dashboard (which now redirects to /manage — a hop for nothing) and every
// project card to the classic workspace.
//
// So the answer lives here, and all five ask it. While GATE_NEW_BUILD is false
// everyone signed in sees the new build. Raise it again and every one of them
// goes back to staff-only in the same deploy, which is the one-line revert the
// go-live commit promised — not just for the route but for every link that
// points at it, so a raised gate never leaves links bouncing off it.
//
// WHAT THIS DELIBERATELY DOES NOT COVER
//
//   * PreviewHostGate (preview.adlmstudio.net) and DsPreviewGate (/preview/*,
//     /fit) stay staff-only. They serve the NEXT batch of Richard's work before
//     he has signed it off, which is a different question from the one this
//     answers.
//   * The "Open the classic workspace" escape (?classic=1) on the project page.
//     Pricing, the Excel export and editing the budget still live there, so
//     ClassicProjectRedirect lets it through for everyone.
//   * ArchiCAD and RateGen projects, which have no page under /work/project.

import { canViewPreview } from "../utils/roles.js";

// The one switch. FLIPPED AT GO-LIVE, 1 October 2026: false means the new build
// is the build. Kept as a visible, revertible record of when customers were
// moved — put it back to true and the classic screens serve again in one deploy.
//
// It had to move in the SAME change as the /dashboard redirect and
// AFTER_SIGN_IN. While it was true, those two made a customer's home an
// infinite loop: /dashboard -> /manage -> the gate -> /dashboard. That is the
// invariant components/newBuildGate.golive.test.js exists to hold.
//
// Deliberately NOT derived from the launch date: this decides which dashboard a
// customer sees, and a browser with a wrong clock would switch them early or
// leave them behind. Go-live is a deploy either way (docs/CLASSIC-BUILD.md), so
// the flip is a reviewed line rather than something nobody can see coming.
export const GATE_NEW_BUILD = false;

/**
 * Should this viewer be sent to /manage/* and /work/*?
 *
 * Everyone while the gate is down. While it is up, only those who may view
 * the preview — canViewPreview, not isStaff, because Tech Support holds only
 * the "preview" area and handles the tickets about these very screens.
 */
export function seesNewBuild(user) {
  return !GATE_NEW_BUILD || canViewPreview(user);
}

export default seesNewBuild;
