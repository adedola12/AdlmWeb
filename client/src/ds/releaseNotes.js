// Note handling for the release desk.
//
// Its own module rather than a function inside DsAdminReleases.jsx for two
// reasons: that file may export only its component (react-refresh), and this
// rule is worth testing without rendering a 1,100-line screen.

/**
 * Fill the note boxes from the notes already stored on a batch.
 *
 * THE FAILURE THIS EXISTS TO STOP IS SILENT, AND IT COSTS THE APPROVER HIS OWN
 * WORDS.
 *
 * The boxes start empty. So a note he saved last week is invisible when he
 * comes back — and because the note travels with every verdict POST, changing
 * his mind on a flow sends note:"" and the server writes that straight over
 * what he wrote (server/routes/admin.batch.js). The card this screen replaces
 * seeded the field from the stored value; losing that turned a re-skin into
 * data loss on the one screen whose whole job is recording his decisions.
 *
 * Only fills a box he has not typed into: a reload after a failed save must
 * not discard what is in front of him. Keys exactly as the rows do, "item:<key>",
 * because a seed under any other prefix silently does nothing.
 *
 * @param {object} current  note state, keyed "item:<key>"
 * @param {Array}  items    the batch's items, each possibly carrying `note`
 * @returns {object} the next note state
 */
export function seedNotes(current, items) {
  const next = { ...(current || {}) };
  for (const it of Array.isArray(items) ? items : []) {
    if (!it?.key) continue;
    const k = `item:${it.key}`;
    if (next[k] === undefined && it.note) next[k] = it.note;
  }
  return next;
}

export default seedNotes;
