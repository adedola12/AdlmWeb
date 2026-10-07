// Opening a project sends you to the project page you are meant to be on.
//
// The classic workspace lives at /projects/:tool and opens one project when the
// URL carries ?project=<slug>. Richard's project page lives at
// /work/project/:productKey/:id. Both are real. Until 1 October only staff saw
// the new one; since go-live everyone signed in does (lib/newBuildAccess.js) —
// this file was still asking canViewPreview after launch, so a customer's
// bookmark or share link kept opening classic.
//
// The card links already decide this per viewer (lib/useProjectHref.js), but
// links are not the only way into a project: the classic gallery's own cards,
// the Portfolio list, the portfolio dashboard's rows, a share claim, a
// bookmark, a pasted URL and "Open the QUIV workspace" on the tool page all
// arrive at /projects/:tool?project=… directly. Wiring each of those one at a
// time is how one of them stays missed — which is exactly what happened: every
// card was pointed at the new page and a project still opened in the classic
// view, because the journey that got there never went through a card.
//
// So the decision is made once, at the route.
//
// WHERE IT SENDS PEOPLE IS NOT DECIDED HERE
//
// It asks projectWorkspaceHref, the same function the cards ask, and redirects
// only if the answer is a /work/project/ address. That is deliberate: a
// redirect that disagreed with the cards would be worse than no redirect, and
// it keeps the products that are NOT part of this page — ArchiCAD, which has
// its own /archicad/:key/boq screen, and RateGen without a project, which has
// /rategen — going where they already go. A RateGen project (a bill priced in
// RateGen and saved to ADLM Cloud) opens on this page like the others.
//
// THE WAY BACK
//
// The new page offers "Open the classic workspace" for the things it does not do:
// pricing, the Excel export, editing the budget. That link carries ?classic=1,
// and this hands it straight through. Without it the two screens would bounce
// a reader between them.

import React from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { seesNewBuild } from "../lib/newBuildAccess.js";
import { CLASSIC_PARAM, classicProjectTarget } from "../lib/classicProjectTarget.js";

export default function ClassicProjectRedirect({ children }) {
  const { tool = "" } = useParams();
  const [params] = useSearchParams();
  const { user, accessToken } = useAuth();

  // AuthProvider withholds `user` for one hydration frame. While the go-live
  // switch is up, deciding during that frame would read a signed-in staff
  // member as a customer and leave them on the classic screen, so hold rather
  // than guess. With it down the hold costs one frame and changes nothing.
  if (accessToken && !user) return null;

  const to = classicProjectTarget({
    tool,
    project: params.get("project"),
    // Translated to the new build's own spelling on the way, and dropped if
    // this product has no such tab — not passed through raw.
    tab: params.get("tab") || "",
    wantsClassic: params.get(CLASSIC_PARAM) === "1",
    newBuild: seesNewBuild(user),
  });

  // replace, not push: the classic URL should not sit in the history for Back
  // to land on and redirect again.
  return to ? <Navigate to={to} replace /> : children;
}
