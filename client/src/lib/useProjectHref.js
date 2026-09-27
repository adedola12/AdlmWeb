// Where a project card should go, for the viewer looking at it.
//
// Until 1 October only staff may open Richard's project page; a customer linked
// there is bounced straight back to the classic workspace by NewBuildGate. That
// is the right destination, but it is an extra hop on the journey a QS makes
// more than any other — so the link is decided per viewer instead, the same way
// the rail's destinations are (lib/railGate.js).
//
// One hook rather than four copies of `canViewPreview(user)`, because a card
// that disagrees with the gate is how somebody ends up in a redirect they
// cannot explain.

import React from "react";
import { useAuth } from "../store.jsx";
import { canViewPreview } from "../utils/roles.js";
import { projectWorkspaceHref } from "./projectLinks.js";

/**
 * Returns `href(project)` — the new project page for staff, the classic
 * workspace for everybody else.
 */
export function useProjectHref() {
  const { user } = useAuth();
  const newBuild = canViewPreview(user);
  return React.useCallback(
    (project) => projectWorkspaceHref(project, { newBuild }),
    [newBuild],
  );
}

export default useProjectHref;
