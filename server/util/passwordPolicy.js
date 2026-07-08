// Password complexity policy — enforced on signup, password reset, and the
// profile set/change-password endpoint. Minimum 8 chars, at least one letter
// and one number. Returns an error message, or null when the password is ok.
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
