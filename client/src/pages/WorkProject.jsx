// The /work/project/:productKey/:id route.
//
// It used to be a bare redirect: every project opened in the full workspace at
// /projects/:tool, which is where the bill, budget, valuation, PM views and
// the Work area are. That is still true for everyone who is not staff, so old
// links and bookmarks keep working exactly as they did.
//
// For staff it now renders the new workspace instead — Richard's project view,
// being adopted a tab at a time (features/workProject/WorkProjectShell.jsx).
// Building it here rather than inside ProjectsGeneric.jsx is deliberate: that
// file is ~5,800 lines and is the screen customers price jobs from, and the
// adoption is a six-to-eight week programme. This route was free, and /work is
// already staff-only on adlmstudio.net, so the new one can be built in the
// open without a flag and without putting the working one at risk.
//
// The isStaff branch is gone: components/NewBuildGate.jsx owns that decision
// for the whole /work/* family now.

import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../store.jsx";
import WorkProjectShell from "../features/workProject/WorkProjectShell.jsx";

/**
 * Who sees the new workspace — answered by the route, not here any more.
 *
 * This screen used to decide for itself: canViewPreview on a preview host, and
 * isStaff on adlmstudio.net, on the reasoning that "on adlmstudio.net nothing
 * has gated the request". That is no longer true. components/NewBuildGate.jsx
 * now gates every /work/* and /manage/* route until launch, using canViewPreview
 * — so a second rule here could only disagree with it, and did: it bounced Tech
 * Support, whose whole role is the "preview" area and who is deliberately not
 * isStaff (utils/roles.js). One rule, in one place.
 *
 * The hydration guard stays: the shell fetches on mount, and it has no business
 * doing that before there is a session to fetch with.
 */
export default function WorkProject() {
  const { productKey = "", id = "" } = useParams();
  const { user, accessToken } = useAuth();
  const key = String(productKey).toLowerCase();

  if (accessToken && !user) return null;
  if (!user) return null;

  return <WorkProjectShell productKey={key} id={id} />;
}
