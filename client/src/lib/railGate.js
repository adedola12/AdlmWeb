// The rail, pointed at screens the viewer can actually open.
//
// DsAppShell is not only the new build's frame. WorkShellRoute wraps ELEVEN
// classic screens in it — /projects/:tool, /time-management, /pm-tracker,
// /revit-projects, /portfolio, /portfolio-dashboard, /archicad/*, /j/:code and
// the rest (main.jsx, App.jsx:41) — all of them open to any signed-in customer.
// So the rail and the section tabs above them are on screen for customers who
// cannot reach most of what they offer: of the seventeen leaf items in
// ds/railConfig.js, fifteen point at /manage/* or /work/*.
//
// Left alone, every one of those fifteen becomes a link that silently throws the
// customer onto /dashboard, and the navigation reads as broken. Hiding them
// instead would leave Richard's rail half empty and change his design.
//
// So each gated destination is REWRITTEN to the classic screen that does the
// same job. The rail keeps its shape, its labels and its icons, and every link
// lands somewhere that answers it. Staff see the rail exactly as designed.
//
// The tool entries show this was already the intent: each one records its
// classic workspace in `also` ("/projects/revit" beside "/work/tool/quiv"), and
// classicFallbackFor produces the same path.

import { classicFallbackFor, isGatedPath } from "./classicPaths.js";

function rewriteItem(item) {
  if (!item || typeof item !== "object") return item;

  const next = item.items ? { ...item, items: item.items.map(rewriteItem) } : { ...item };

  if (typeof next.to === "string" && isGatedPath(next.to)) {
    next.to = classicFallbackFor(next.to);
    // So a caller can tell a rewritten entry from one that was always classic —
    // used by the tests, and available to the chrome if it ever wants to mark
    // one.
    next.gatedRewrite = true;
  }
  return next;
}

/**
 * The rail a given viewer should see.
 *
 * `canSeeNewBuild` is the same answer the route gate gives (canViewPreview).
 * When it is true the rail is returned untouched — the same array, not a copy —
 * so staff get exactly the config Richard wrote and nothing re-renders for it.
 */
export function railForViewer(rail, canSeeNewBuild) {
  if (canSeeNewBuild) return rail;
  if (!Array.isArray(rail)) return rail;
  return rail.map((g) =>
    g && Array.isArray(g.items) ? { ...g, items: g.items.map(rewriteItem) } : g,
  );
}

export default railForViewer;
