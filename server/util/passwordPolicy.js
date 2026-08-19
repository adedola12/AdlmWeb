// What counts as an acceptable ADLM password.
//
// One definition, because the same password is now set from three places —
// signing up, resetting a forgotten one, and a social user creating one so the
// desktop plugins will let them in. Three copies of "at least 8 characters"
// is three chances for them to disagree, and the one that disagrees is the one
// that lets a weak password through.

/**
 * @param {string} password
 * @returns {string|null}  the reason it is unacceptable, or null if it is fine
 */
export function validatePasswordStrength(password) {
  const pw = String(password || "");
  if (pw.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

export default validatePasswordStrength;
