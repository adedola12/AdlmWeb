// Telling everybody on a project that its contract has been locked.
//
// WHY THIS IS A NOTIFICATION AND NOT JUST AN ACTIVITY ENTRY
//
// Locking is the moment a bill stops being a working estimate and becomes the
// contract figure. Everything about editing changes with it: re-measuring a line
// no longer moves the contract quantity, it records an actual beside it; work
// that was not in the contract becomes a variation; progress starts feeding the
// valuations. A collaborator who carried on editing without being told would
// believe they were correcting the contract and would in fact be recording a
// variation against it.
//
// The activity trail already records the lock, but nobody reads an activity
// trail to find out the rules have changed under them.
//
// WHO GETS IT
//
// Every collaborator, at whatever access level — a view-only collaborator is
// reading figures whose meaning just changed, so they need it as much as an
// editor. Plus the owner, when somebody else did the locking. Never the person
// who pressed the button: they know.
//
// WHAT THIS FILE DOES NOT DO
//
// It does not send. It works out WHO should be told and WHAT each of them is
// told, and it is pure, so those rules are tested without a database or a mail
// account. routes/projects.js does the sending, after the response — a
// notification must never be awaited in a request somebody is waiting on (see
// the God-login OTP, which was).

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const id = (v) => str(v?._id ?? v);

/**
 * The people to tell that this contract is locked.
 *
 * @param {object} project        the project, with collaborators and userId
 * @param {object} lockedByUser   whoever pressed the button: { _id, email, name }
 * @param {Map|object} [byId]     optional userId -> { email, name }, to address
 *                                somebody by name rather than by email
 * @returns {Array<{userId, email, firstName, role}>} deduplicated, never
 *                                including the locker
 */
export function lockNoticeRecipients(project, lockedByUser, byId = new Map()) {
  const look = (uid) => (byId instanceof Map ? byId.get(uid) : byId?.[uid]) || null;
  const lockerId = id(lockedByUser);
  const lockerEmail = lower(lockedByUser?.email);

  const out = [];
  const seen = new Set();

  const add = (uid, email, role) => {
    const addr = lower(email);
    // No address, nothing to send. Silently skipping is right here: a
    // collaborator row with no email snapshot is a data gap, not an error in
    // locking a contract, and failing the lock over it would be absurd.
    if (!addr) return;
    // Never the person who locked it.
    if (addr === lockerEmail) return;
    if (uid && lockerId && uid === lockerId) return;
    // One mail per person, however many ways they appear.
    if (seen.has(addr)) return;
    seen.add(addr);
    const u = uid ? look(uid) : null;
    out.push({
      userId: uid || "",
      email: addr,
      firstName: str(u?.firstName) || str(u?.name) || "",
      role,
      // Filled in by the caller, which is the only place that can ask whether
      // this person holds RateGen. See maySeeMoney below.
      seesMoney: role === "owner",
    });
  };

  // The owner first, so the list reads the way somebody would say it.
  const ownerId = id(project?.userId);
  if (ownerId) {
    const owner = look(ownerId);
    add(ownerId, owner?.email || project?.ownerEmail, "owner");
  }

  for (const c of Array.isArray(project?.collaborators) ? project.collaborators : []) {
    const uid = id(c?.userId);
    // The snapshot on the row is a fallback: it is taken at join time and can be
    // stale, so a live address from the user record wins.
    add(uid, look(uid)?.email || c?.email, c?.accessLevel === "full" ? "editor" : "viewer");
  }

  return out;
}

/** How to name whoever locked it, in a sentence somebody reads. */
export function lockedByName(user) {
  return (
    str(user?.name) ||
    [str(user?.firstName), str(user?.lastName)].filter(Boolean).join(" ") ||
    str(user?.email) ||
    "Somebody on this project"
  );
}

/**
 * Is this project shared at all?
 *
 * A project with no collaborators is the overwhelming majority, and there is
 * nobody to tell — so the whole notification, including reading the user records
 * it would need, is skipped rather than done and thrown away.
 */
export const isShared = (project) =>
  Array.isArray(project?.collaborators) && project.collaborators.length > 0;

/**
 * May this recipient be told what the contract is worth?
 *
 * THE MAIL MUST NOT SAY WHAT THE SCREEN HIDES
 *
 * util/projectAccess.js gives a collaborator `canSeeRates` only when they hold
 * an active RateGen entitlement. Without it, every GET of that project comes
 * back with `_ratesMasked: true` and `contract.contractSum: 0` — the app shows
 * them no money at all, deliberately.
 *
 * A notification is not an exemption from that. Posting the real contract sum
 * into their inbox would hand over, in writing, the one figure the product is
 * built to withhold — and it would arrive from us, unprompted. So the sum is
 * dropped for anyone the project itself would mask it from, and they get the
 * same mail without the figure: they still need to know the contract is locked,
 * because what editing MEANS has changed for them too.
 *
 * The owner always sees it. So does anyone holding RateGen.
 *
 * @param {object} recipient                     a row from lockNoticeRecipients
 * @param {(userId:string)=>Promise<boolean>} hasRateGen
 */
export async function maySeeMoney(recipient, hasRateGen) {
  if (!recipient) return false;
  if (recipient.role === "owner") return true;
  if (typeof hasRateGen !== "function") return false;
  if (!recipient.userId) return false;
  try {
    return Boolean(await hasRateGen(recipient.userId));
  } catch {
    // An entitlement lookup that fails must not leak the figure.
    return false;
  }
}
