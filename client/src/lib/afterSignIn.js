// Where somebody lands once they are signed in.
//
// One constant, because the answer was spread across five places — the two
// defaults in socialAuth.js, the default prop on SocialSignIn, the `next`
// fallback on the login page, and the nav. Five copies of a routing decision
// is five things to find when the decision changes.
//
// Home, as it has always been for customers. /manage is his Manage overview,
// which replaces /dashboard only when the new build goes fully live; switch
// this to "/manage" then, and not before.
//
// That instruction has now been ignored twice. The 15 September release
// switched it early and customers lost their dashboard until it was put back.
// The launch build switched it again, and PR #24 merged on 24 September —
// six days before the 1 October go-live — so from that merge every sign-in
// landed on a screen the person had never seen, and /dashboard redirected
// there too. Put back on 26 September.
//
// On 1 October this becomes "/manage" and the /dashboard route in main.jsx
// goes back to redirecting. Both, together, or the site contradicts itself.
export const AFTER_SIGN_IN = "/";

export default AFTER_SIGN_IN;
