// Saving one change to a project from the new project page.
//
// WHAT THE PUT ACTUALLY DOES, AND WHY THAT SHAPES THIS
//
// Two separate rules, and conflating them produces a payload that is wrong in
// both directions:
//
//  1. An array the payload OMITS is left alone. Every one is guarded —
//     `if (Array.isArray(items))`, and the same for provisionalSums (:4069),
//     variations (:4173), preliminaryItems (:4177) and budgetItems (:4101) in
//     routes/projects.js. So a save does NOT have to carry the whole project to
//     avoid deleting the rest of it.
//
//  2. An array the payload SENDS is replaced wholesale, row for row, by the
//     sanitised version of what was sent. That is the rule ProjectsGeneric's
//     saveRatesToCloud warns about: send "whole rows, not a hand-written field
//     list", because a row rebuilt from a few fields loses the rest — "which is
//     how a PC sum used to come back as a provisional sum and an executed
//     variation used to un-execute itself".
//
// The same is true of the scalars: `if (clientName !== undefined)`,
// `if (preliminaryPercent !== undefined)`. A field merely PRESENT in the payload
// is written. So a save that helpfully includes the client name and the three
// contract percentages is a save that can overwrite them with whatever the
// client happened to be holding — which is exactly the bug this file had on its
// first draft, where clientName fell back to the rollup's `client` and a
// progress tick could rewrite the client name.
//
// Hence: send `baseVersion`, send the one array being changed with its rows
// whole, and send nothing else. Anything absent keeps whatever is stored.

import { apiAuthed } from "../../api.js";

/** The arrays this page can change. Each is replaced wholesale when sent. */
const REPLACED_ARRAYS = Object.freeze([
  "items",
  "provisionalSums",
  "variations",
  "preliminaryItems",
  "budgetItems",
]);

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * The payload for one change.
 *
 * Exported so a test can read what would be sent without a network, and so the
 * "nothing unasked-for is written" rule can be asserted rather than trusted.
 */
export function buildSavePayload(project, patch = {}) {
  const payload = { baseVersion: project?.version, ...patch };

  for (const key of REPLACED_ARRAYS) {
    if (!(key in payload)) continue;
    // A non-array here is worse than an error: the server's guard skips it, so
    // the request succeeds, nothing changes, and the page says "Saved".
    if (!Array.isArray(payload[key])) {
      throw new Error(
        `saveProject: ${key} must be an array — the server ignores anything else, so the save would silently do nothing`,
      );
    }
    // Every row must be a whole row. A row rebuilt from a field list loses the
    // fields it left out, which is how a PC sum stopped being a PC sum.
    if (payload[key].some((row) => !row || typeof row !== "object")) {
      throw new Error(`saveProject: every ${key} row must be a whole object, not a value`);
    }
  }
  return payload;
}

/**
 * The id a WRITE has to use.
 *
 * The new project page's route is /work/project/:productKey/:id where :id is a
 * SLUG (planswift-takeoff). Reading copes: /projects/:key/by-slug/:slug exists
 * for exactly that. Writing does not — every write route runs isValidObjectId
 * on its :id param (routes/projects.js:3732 for the PUT,
 * routes/projects.pm.js:280 for the PM generator) and answers
 * 400 "Invalid id" to anything that is not 24 hex characters.
 *
 * Passing the route's :id straight through therefore broke EVERY save on that
 * page — progress, rates, a section moved, a line dragged, the procurement
 * ticks — with nothing to show for it but "Not saved". The loaded document
 * carries the real _id, so this prefers it and falls back to the route only
 * when there is no document yet (the classic page, where :id already IS the
 * ObjectId).
 */
export const writeIdFor = (project, routeId) =>
  String(project?._id || project?.id || routeId || "");

/** The address ProjectsGeneric saves to, so there is one shape, not two. */
export const projectUrl = (productKey, id) =>
  `/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}/${encodeURIComponent(id)}`;

/**
 * Change one thing about a project and save it.
 *
 * Resolves to the updated project as the server returns it, so the caller
 * replaces its copy rather than patching its own and drifting.
 */
export async function saveProjectPatch({ project, productKey, id, token, patch }) {
  const body = buildSavePayload(project, patch);
  return apiAuthed(projectUrl(productKey, id), { token, method: "PUT", body });
}

/**
 * Set one bill line's progress, by index.
 *
 * The index is the line's identity everywhere on this page. Returns a patch for
 * saveProjectPatch rather than saving, so a caller can batch several changes
 * into one request if it ever needs to.
 *
 * Every line goes back, not just the one that changed, because sending `items`
 * replaces the array — the rows that did not change have to be in it, whole.
 */
export function withLineProgress(project, index, percent) {
  const items = arr(project?.items);
  if (index < 0 || index >= items.length) return null;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return {
    items: items.map((it, i) => (i === index ? { ...it, percentComplete: value } : it)),
  };
}

/** Move one bill line into another section. His [data-cat] on the line panel. */
export function withLineElement(project, index, element) {
  const items = arr(project?.items);
  if (index < 0 || index >= items.length) return null;
  const category = String(element || "").trim();
  if (!category) return null;
  return {
    items: items.map((it, i) => (i === index ? { ...it, category } : it)),
  };
}
