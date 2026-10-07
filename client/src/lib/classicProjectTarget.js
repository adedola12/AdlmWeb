// Where /projects/:tool?project=<id> should actually take this viewer.
//
// Separate from ClassicProjectRedirect.jsx only because a file that exports a
// component may export nothing else — react-refresh/only-export-components.
// The reasoning behind the rule lives with the component.

import { projectWorkspaceHref } from "./projectLinks.js";

/** The marker that means "I asked for the classic workspace on purpose". */
export const CLASSIC_PARAM = "classic";

/**
 * The new project page's address, or null to stay on the classic workspace.
 *
 * Asks projectWorkspaceHref — the same function the project cards ask — and
 * redirects only if the answer is a /work/project/ address. A redirect that
 * disagreed with the cards would be worse than no redirect, and this keeps the
 * products that are not part of that page (ArchiCAD, RateGen) where they are.
 */
export function classicProjectTarget({ tool, project, wantsClassic, newBuild }) {
  if (!project || wantsClassic || !newBuild) return null;
  const to = projectWorkspaceHref(
    { productKey: tool, slug: project },
    { newBuild: true },
  );
  return to.startsWith("/work/project/") ? to : null;
}
