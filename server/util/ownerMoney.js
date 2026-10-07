// server/util/ownerMoney.js
//
// ── The owner's switch (R4b) ────────────────────────────────────────────────
// Whoever shares a project decides, per share code and then per collaborator,
// whether the people they share it with see its money (`showMoney` on
// ShareCodeSchema / CollaboratorSchema). It sits ON TOP of the reader's own
// RateGen rule, it never replaces it:
//
//   owner                          → sees money, always
//   collaborator, owner said off   → no money, whatever they subscribe to
//   collaborator, owner said on    → money only with an active RateGen
//
// "On" is the default and a record without the field reads as on, so every
// share that existed before the switch keeps exactly the behaviour it had.
export const SHOW_MONEY_DEFAULT = true;

/** Did the owner leave money on for this collaborator record? Missing = on. */
export const collaboratorShowsMoney = (collab) => collab?.showMoney !== false;

/**
 * The owner's choice for one reader on one project document. True for the
 * owner and for anyone who is not a collaborator (they get no access at all
 * elsewhere, so there is nothing to hide here).
 */
export function ownerAllowsMoney(project, userId) {
  if (!project || !userId) return true;
  const uid = String(userId);
  if (project.userId != null && String(project.userId) === uid) return true;
  const collab = (project.collaborators || []).find(
    (c) => c?.userId != null && String(c.userId) === uid,
  );
  return collab ? collaboratorShowsMoney(collab) : true;
}

/**
 * The same question inside an aggregation, as a boolean field on each row:
 * true when the owner switched money off for THIS reader. An owner's own row is
 * never in its own collaborators list, so it always reads false.
 */
export function ownerHidesMoneyExpr(userId) {
  return {
    $in: [
      userId,
      {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: ["$collaborators", []] },
              as: "c",
              cond: { $eq: ["$$c.showMoney", false] },
            },
          },
          as: "c",
          in: "$$c.userId",
        },
      },
    ],
  };
}
