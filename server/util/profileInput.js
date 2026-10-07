// Blank profile fields mean "leave it as it is", not "set it to nothing".
//
// Profile forms send every field on every save. An account that never chose a
// state or zone (518 of 586 on 18 Sep 2026) sent state:"" or zone:"", which the
// server rejected as "Invalid state" / "Invalid zone" -- so those accounts could
// not save anything on the profile, a new photo included. A blank username
// would also collide in the unique index. Treat blank as absent.

export function blankToUndefined(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}
