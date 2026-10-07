// Where a project card should go, for the viewer looking at it.
//
// Since go-live (1 October 2026) that is Richard's project page for everybody
// signed in. Before it, only staff could open that page, so a customer's card
// went to the classic workspace instead — and that check outlived the gate it
// mirrored, leaving every customer's project cards on classic after launch.
// The decision now comes from lib/newBuildAccess.js, the same answer the route
// gate and the rail give, so raising GATE_NEW_BUILD again moves all of them.
//
// One hook rather than four copies of the check, because a card that disagrees
// with the gate is how somebody ends up in a redirect they cannot explain.

import React from "react";
import { useAuth } from "../store.jsx";
import { seesNewBuild } from "./newBuildAccess.js";
import { projectWorkspaceHref } from "./projectLinks.js";

/**
 * Returns `href(project)` — the new project page for anyone who sees the new
 * build (everyone, since go-live), the classic workspace otherwise.
 */
export function useProjectHref() {
  const { user } = useAuth();
  const newBuild = seesNewBuild(user);
  return React.useCallback(
    (project) => projectWorkspaceHref(project, { newBuild }),
    [newBuild],
  );
}

export default useProjectHref;
