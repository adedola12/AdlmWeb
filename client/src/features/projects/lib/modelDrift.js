// Model drift wording (work-board item r2-model-drift-alerts).
//
// The server sends counts only (see server/services/modelDrift.js). These turn
// them into the one sentence the badge's tooltip carries, so the gallery, the
// project header and anything Richard designs later say the same thing.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 elements added, 1 removed, 2 changed in size" (empty when none). */
export function driftChangeText(drift) {
  const c = drift?.counts || {};
  const parts = [];
  if (c.added) parts.push(`${plural(c.added, "element")} added`);
  if (c.removed) parts.push(`${c.removed} removed`);
  if (c.changed) parts.push(`${c.changed} changed in size`);
  return parts.join(", ");
}

function when(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/** The badge tooltip. */
export function driftTitle(drift) {
  const lines = Number(drift?.counts?.linesAffected) || 0;
  const change = driftChangeText(drift);
  const seen = when(drift?.detectedAt);
  return (
    `The model has changed since this take-off was saved${seen ? ` (found ${seen})` : ""}` +
    `${change ? `: ${change}` : ""}. ` +
    `${plural(lines, "bill line")} may no longer match the model. ` +
    "Re-take them in the plugin and save to the cloud before you price, value or certify."
  );
}

/** The gallery row's tooltip, from the list endpoint's two fields. */
export function driftRowTitle(row) {
  const seen = when(row?.modelDriftDetectedAt);
  return `The model has changed since the last take-off${seen ? ` (found ${seen})` : ""}. Open the project for details.`;
}
