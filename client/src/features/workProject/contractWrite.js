// Folding a contract write back into the held project.
//
// Three routes change the contract and answer the same way — `{ ok, contract,
// version }`, a FRAGMENT and not the project:
//
//   POST .../contract/tendered   records the tender date. No step-up.
//   POST .../contract/lock       takes the snapshot and sets the contract sum.
//   POST .../contract/unlock     releases it, keeping the figures.
//
// So each one needs the same two things merged by hand, and each one is silent
// when it is not done. This is the third time that shape has appeared in this
// folder (withIssuedCertificate, withVariationWrite), and the first two were both
// got wrong before they were got right, so it is a named function with its own
// tests rather than three lines at each call site.
//
//   contract   what the screen reads to know where the project has got to —
//              tenderedAt, locked, the contract sum and every *AtLock figure. Left
//              alone, a QS marks the bill as tendered and the stage strip still
//              says Priced.
//   version    saveProjectPatch sends it as baseVersion on every write
//              (saveProject.js:52). Left stale, the next edit to the bill is a
//              write against a version the server has already moved past.
//
// The contract is REPLACED, not merged field by field.
//
// Today the two are almost the same thing: the server sends the whole subdocument
// (project.contract.toObject() minus lockPinHash), so every key the held copy has
// is in the response and the response wins either way. Replace is chosen because
// it is the semantics that cannot go stale if that ever stops being true — a key
// the server has dropped is dropped here, rather than surviving from a copy taken
// before the write. Merging would make correctness depend on the response staying
// exhaustive, which nothing enforces.
//
// hasLockPin is the one key carried over, and it is not a stale-data risk but a
// real absence: projectForClient derives it from the stored hash and these write
// responses genuinely never include it. Dropped, a reader who had just locked
// would be told their project has no PIN and asked to set one again.

export function withContractWrite(project, out) {
  if (!project || !out?.contract || typeof out.contract !== "object") return project;
  const v = Number(out.version);
  const had = project.contract || {};
  const next = { ...out.contract };
  // Only when the response says nothing about it. `in` rather than a truthiness
  // test, so an explicit false survives.
  if (!("hasLockPin" in next) && "hasLockPin" in had) next.hasLockPin = had.hasLockPin;
  return {
    ...project,
    contract: next,
    version: Number.isFinite(v) ? v : project.version,
  };
}

export default withContractWrite;

/**
 * Why this PIN cannot lock the contract — or "" when it can.
 *
 * Four digits, which is the server's own rule: normalizeLockPin requires
 * /^\d{4}$/ and answers null for anything else, and the lock then refuses with
 * 400 LOCK_PIN_REQUIRED (projects.js:4594-4602). Said here so the button can be
 * disabled with a reason rather than letting a round trip answer it.
 *
 * Only asked for when step-up is OFF. With step-up on, the OTP IS the
 * authorisation and the server asks for no PIN at all.
 */
export function lockPinProblem(pin) {
  const p = String(pin ?? "").trim();
  if (!p) return "Set a four-digit PIN. It is what unlocks the contract again later.";
  if (!/^\d{4}$/.test(p)) return "The PIN is four digits, numbers only.";
  return "";
}
