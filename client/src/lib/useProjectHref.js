// Where a project card should go.
//
// It used to depend on who was looking. While /work/* was staff-only, a
// customer linked there was bounced straight back by NewBuildGate, so the card
// was decided per reader to save them a hop on the journey a QS makes more than
// any other.
//
// Since 5 Oct 2026 the new project page is everybody's (owner's decision), and
// this hook was the last thing still reading canViewPreview to answer the
// question — so a paying customer's project cards, on the gallery, the Work
// home, the programme and the sample strip, all still pointed at the classic
// workspace, while the route they would have landed on was already sending them
// the other way. One extra redirect per project opened, and the cards and the
// route disagreeing about where a project lives.
//
// It stays a hook rather than collapsing into four direct projectWorkspaceHref
// calls, so there is still ONE place to change if the answer ever depends on
// the reader again.

import React from "react";
import { projectWorkspaceHref } from "./projectLinks.js";

/** Returns `href(project)` — the new project page. */
export function useProjectHref() {
  return React.useCallback((project) => projectWorkspaceHref(project, { newBuild: true }), []);
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
