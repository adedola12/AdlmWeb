// Where /projects/:tool?project=<id> should actually take this viewer.
//
// Separate from ClassicProjectRedirect.jsx only because a file that exports a
// component may export nothing else — react-refresh/only-export-components.
// The reasoning behind the rule lives with the component.

import { newBuildPlaceHref } from "./projectLinks.js";

/** The marker that means "I asked for the classic workspace on purpose". */
export const CLASSIC_PARAM = "classic";

/**
 * The new project page's address, or null to stay on the classic workspace.
 *
 * Asks the same function the project cards ask, and redirects only if the
 * answer is a /work/project/ address. A redirect that disagreed with the cards
 * would be worse than no redirect, and this keeps the products that are not
 * part of that page (ArchiCAD, RateGen) where they are.
 *
 * WHY THE TAB AND THE LINE ARE CARRIED
 *
 * This threw away every parameter but `project`, and since the 5 Oct flip it is
 * the busiest way into the new page: every bookmark, every pasted address and
 * every deep link the classic build ever wrote comes through here. A QS
 * following their own link to a certificate — /projects/revit?project=block-a
 * &tab=valuation — arrived at the project summary with the tab dropped on the
 * floor and nothing on screen to say a tab had been asked for. Dropping a
 * parameter silently is the same bug as mistranslating it; it is just quieter.
 *
 * ?line= is the one that genuinely cannot come across, and it is not in the
 * signature rather than being accepted and ignored. It carries a line KEY; the
 * new Bill addresses a line by its position and searches by text only
 * (billModel.matches reads the description and the element, nothing else), so
 * there is no parameter on the other side to hand it to. The tab arrives, and
 * the reader is on the right bill at the top rather than on the wrong screen.
 */
export function classicProjectTarget({ tool, project, tab, wantsClassic, newBuild }) {
  if (!project || wantsClassic || !newBuild) return null;
  const to = newBuildPlaceHref({ productKey: tool, key: project, tab });
  return to.startsWith("/work/project/") ? to : null;
}
