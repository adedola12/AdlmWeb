// Where somebody lands once they are signed in.
//
// One constant, because the answer was spread across five places — the two
// defaults in socialAuth.js, the default prop on SocialSignIn, the `next`
// fallback on the login page, and the nav. Five copies of a routing decision
// is five things to find when the decision changes, and this one is changing:
// /manage is his Manage overview, which replaces /dashboard when the makeover
// lands.
//
// /dashboard is deliberately still reachable from the nav while both exist.
// The old screen still carries things /manage has not grown yet — courses,
// classrooms, trainings — and making it unreachable would lose them.
export const AFTER_SIGN_IN = "/manage";

export default AFTER_SIGN_IN;
