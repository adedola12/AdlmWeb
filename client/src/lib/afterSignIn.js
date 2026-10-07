// Where somebody lands once they are signed in.
//
// One constant, because the answer was spread across five places — the two
// defaults in socialAuth.js, the default prop on SocialSignIn, the `next`
// fallback on the login page, and the nav. Five copies of a routing decision
// is five things to find when the decision changes, and it has changed:
// /manage is his Manage overview, and it replaced /dashboard.
//
// SWITCHED AT GO-LIVE, 1 October 2026. It took three attempts to land here,
// and the two failed ones are the reason this comment is long:
//
//   - The 15 September release switched it early and customers lost the
//     dashboard they used. Put back in 1a51cde.
//   - The launch build switched it again in PR #24, merged 24 September — six
//     days before go-live — so from that merge every sign-in landed on a
//     screen the person had never seen. Put back on 26 September.
//
// Both times the damage was the same shape: this constant moved without the
// /dashboard route in main.jsx moving with it, so the site contradicted
// itself — sign-in went one place, every receipt and enrolment email pointed
// at another. They change together or not at all. /dashboard is now a
// redirect here, so the old links in people's history still land.
export const AFTER_SIGN_IN = "/manage";

export default AFTER_SIGN_IN;
