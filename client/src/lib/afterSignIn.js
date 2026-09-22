// Where somebody lands once they are signed in.
//
// One constant, because the answer was spread across five places — the two
// defaults in socialAuth.js, the default prop on SocialSignIn, the `next`
// fallback on the login page, and the nav. Five copies of a routing decision
// is five things to find when the decision changes, and it has changed:
// /manage is his Manage overview, and it replaced /dashboard.
//
// /dashboard now redirects to /manage (main.jsx), so old links and bookmarks
// still land somewhere. The old dashboard page is no longer routed.
export const AFTER_SIGN_IN = "/manage";

export default AFTER_SIGN_IN;
