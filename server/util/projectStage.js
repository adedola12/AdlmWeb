// Where a project stands, from the project document itself.
//
// WHY THIS EXISTS ON THE SERVER
//
// A project has no stored `stage`. The field at TakeoffProject.js:872 is inside
// SampleInfoSchema and belongs to seeded samples only — a real project has
// nothing. The gallery works the stage out on the client
// (client/src/lib/projectGallery.js:38, stageOf), from five facts it already
// holds.
//
// That was fine while only the gallery cared. Ada cannot say which stage a
// project is in, cannot answer "which of my projects are still open", and
// cannot tell a tendered job from a priced one — because nothing server-side
// knows the rule. Rather than teach her a second rule that would drift from the
// screens, this is the same ladder, in the same order, over the same five facts.
//
// THE ORDER IS THE RULE
//
// A job that has been certified is "valuing" even though its contract is also
// locked, and a finalised one is "final" whatever else is true. So the ladder is
// read top down and the first hit wins. Changing the order changes what every
// stage means.

export const STAGES = Object.freeze([
  { key: "takeoff", label: "Takeoff", open: true },
  { key: "priced", label: "Priced", open: true },
  { key: "tendered", label: "Tendered", open: true },
  { key: "locked", label: "Contract locked", open: true },
  { key: "valuing", label: "Valuations", open: true },
  // The only closed stage: the account is agreed and the job is done.
  { key: "final", label: "Final account", open: false },
]);

const byKey = new Map(STAGES.map((s) => [s.key, s]));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The stage key for a project document.
 *
 * Takes either a full TakeoffProject or a rollup row — the gallery's rows carry
 * `contractLocked` / `certificateCount` / `finalized` flattened, while a
 * document carries `contract.locked`, `certificates[]` and
 * `finalAccount.finalized`. Both shapes answer the same five questions, so both
 * are read.
 */
export function projectStage(p) {
  if (!p) return "takeoff";

  const finalized = p.finalized === true || p?.finalAccount?.finalized === true;
  if (finalized) return "final";

  const certCount = Array.isArray(p.certificates)
    ? p.certificates.length
    : num(p.certificateCount);
  if (certCount > 0) return "valuing";

  const locked = p.contractLocked === true || p?.contract?.locked === true;
  if (locked) return "locked";

  if (p.tenderedAt || p?.contract?.tenderedAt) return "tendered";

  // A row whose money is withheld carries `priced` as a boolean instead of a
  // figure. Reading the zeroed total there would label a shared, fully priced
  // job "takeoff" — the stage is a state, not an amount.
  if (typeof p.priced === "boolean") return p.priced ? "priced" : "takeoff";

  const value = num(p.totalCost) || itemsValue(p.items);
  return value > 0 ? "priced" : "takeoff";
}

/** The bill's own value, for a document that carries its lines. */
function itemsValue(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((a, it) => a + num(it?.qty) * num(it?.rate), 0);
}

/** "Contract locked" — what a person calls that stage. */
export const stageLabel = (key) => byKey.get(String(key))?.label || "Takeoff";

/**
 * Is the job still live?
 *
 * Everything up to and including Valuations is open; a finalised account is
 * closed. This is what "all open projects" means when somebody asks Ada for the
 * value of theirs — without it she has to count finished jobs too, and the
 * figure is not one anybody wants.
 */
export const stageIsOpen = (key) => byKey.get(String(key))?.open !== false;

/** Convenience: is this project still live? */
export const projectIsOpen = (p) => stageIsOpen(projectStage(p));
