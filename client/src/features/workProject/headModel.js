// His project header (work-proj.js:334-346) — the sync indicator, the "Jump to
// project" list and the … overflow — as plain functions.
//
// The header is the one part of the page that is about the project rather than
// its contents, which is why its logic is worth separating from its markup: what
// the overflow offers depends on who is reading, and that is a rule, not a view.

/**
 * His .pj-sync wording (work-proj.js:356-360).
 *
 * He has two states, "Saved" and "Saving…". We need a third: a save here is a
 * network PUT that can fail, and a failure that says "Saved" is worse than no
 * indicator at all — somebody would believe a progress figure was recorded.
 */
export function syncLabel(state) {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Saved just now";
  if (state === "failed") return "Not saved";
  return "Saved";
}

/** Whether the indicator should read as a problem rather than as reassurance. */
export const syncFailed = (state) => state === "failed";

/**
 * The other projects on the account, for his Jump to project popover
 * (work-proj.js:445-453).
 *
 * His filter is on name alone. Ours also matches the client, because a QS with
 * forty projects remembers whose job it was more readily than what the file was
 * called.
 */
export function jumpList(projects, currentId, term = "") {
  if (!Array.isArray(projects)) return [];
  const q = String(term || "").trim().toLowerCase();
  const here = String(currentId || "").toLowerCase();
  return projects
    .filter((p) => {
      const id = String(p?._id || p?.id || "").toLowerCase();
      const slug = String(p?.slug || "").toLowerCase();
      if (id === here || (slug && slug === here)) return false;
      if (!q) return true;
      return (
        String(p?.name || "").toLowerCase().includes(q) ||
        String(p?.client || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 40);
}

/**
 * His rule for which tab survives a jump (work-proj.js:440).
 *
 * The five tabs every project has are kept; Model, Drawings and Services are
 * not, because the project jumped to may not have them and would land on a tab
 * that is not there.
 */
const KEPT = new Set(["overview", "bill", "rates", "pm", "activity", "valuations"]);
export const keepTabOnJump = (tab) => (KEPT.has(tab) && tab !== "overview" ? tab : "");

/** His 'ADLM-PRJ-' + id.toUpperCase() (work-proj.js:477). */
export function projectIdLabel(project) {
  const id = String(project?._id || project?.id || "").trim();
  return id ? `ADLM-PRJ-${id.toUpperCase()}` : "";
}

/**
 * What the … offers this reader.
 *
 * His list is Collaborators, Copy project ID, Project report, Export to Excel,
 * Open in the plugin, Switch source and Delete. Ours differs in three places and
 * each is deliberate:
 *
 *  • Export to Excel and Switch source are not here. Both exist — the export is
 *    ~400 lines of workbook building in ProjectsGeneric, and switching source
 *    re-runs an import — and re-implementing either against the same project
 *    would be two ways to do one thing. The classic workspace entry goes there.
 *  • Delete is not here. Deleting from a menu on a page whose purpose is reading
 *    is how a project goes by accident; it stays where the confirmation and the
 *    30-day restore message already are.
 *  • Collaborators is read-only for us. The roster is on the project the owner
 *    is already holding; adding and removing needs /collab, which the classic
 *    workspace drives.
 *
 * THE LAST TWO ARE NOT THE SAME THING
 *
 * `full` puts THIS page full screen: the rail and the app bar go, and the
 * workspace takes the viewport. It is a mode, so it toggles and its label says
 * which way it will go.
 *
 * `classic` LEAVES for /projects/:tool, the older screen that still owns
 * uploading, linking, certificates and the Excel export. One used to do both
 * jobs under the first name, which is why "Open the full workspace" navigated
 * away instead of filling the screen.
 */
export function overflowActions({ isOwner = false, canSeePm = true, fullScreen = false } = {}) {
  const list = [
    { key: "people", label: "Collaborators", show: isOwner },
    { key: "id", label: "Copy project ID", show: true },
    { key: "report", label: "Project report", show: true },
    { key: "pm-report", label: "Project management report", show: canSeePm },
    {
      key: "full",
      label: fullScreen ? "Leave the full workspace" : "Open the full workspace",
      show: true,
    },
    { key: "classic", label: "Open the classic workspace", show: true },
  ];
  return list.filter((a) => a.show).map(({ key, label }) => ({ key, label }));
}

/** His roster wording for an access level (ShareCodeSchema's two levels). */
export const accessName = (level) =>
  String(level) === "full" ? "Can edit and export" : "Can view";
