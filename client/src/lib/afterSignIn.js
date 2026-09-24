// Where somebody lands once they are signed in.
//
// One constant, because the answer was spread across five places — the two
// defaults in socialAuth.js, the default prop on SocialSignIn, the `next`
// fallback on the login page, and the nav. Five copies of a routing decision
// is five things to find when the decision changes.
//
// Home, as it has always been for customers. /manage is his Manage overview,
// which replaces /dashboard only when the new build goes fully live; switch
// this to "/manage" then, and not before. The 15 Sept release switched it
// early, and customers lost their dashboard until it was put back.
export const AFTER_SIGN_IN = "/";

export default AFTER_SIGN_IN;
