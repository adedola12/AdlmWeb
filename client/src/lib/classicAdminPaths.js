// The admin paths that show the CLASSIC screens until the new build goes live.
//
// The 15 Sept release moved every admin screen into his admin frame early.
// These are the paths that existed before that release; main.jsx routes them
// to their pre-release screens with <AdminRoute shell={false}>, and App.jsx
// uses this list to give them the site nav and footer again. Admin paths the
// release added (emails, campaigns, documents, ...) keep his frame.
//
// At go-live: delete this file, drop its use in App.jsx, and restore the
// release's elements for these paths in main.jsx.

const CLASSIC_ADMIN_PATHS = new Set([
  "/admin",
  "/admin/pending",
  "/admin/active",
  "/admin/organizations",
  "/admin/physical-training",
  "/admin/subscriptions",
  "/admin/storage",
  "/admin/installations",
  "/admin/training-locations",
  "/admin/settings",
  "/admin/courses",
  "/admin/products",
  "/admin/coupons",
  "/admin/invoices",
  "/admin/proposals",
  "/admin/course-grading",
  "/admin/course-cockpit",
  "/admin/quizzes",
  "/admin/trainings",
  "/admin/learn",
  "/admin/youtube",
  "/admin/users-lite",
  "/admin/showcase",
  "/admin/changelogs",
  "/admin/rategen",
  "/admin/rategen/add-rate",
  "/admin/rategen-master",
  "/admin/ptrainings",
  "/admin/roles",
  "/admin/ai-usage",
  "/admin/support-tickets",
  "/admin/follow-ups",
  "/admin/audit-log",
  "/admin/freebies",
  "/admin/flyers",
]);

// admin/products/:id/edit is the one parameterised classic path.
const CLASSIC_ADMIN_PATTERNS = [/^\/admin\/products\/[^/]+\/edit$/];

export function isClassicAdminPath(pathname = "") {
  const p = String(pathname).replace(/\/+$/, "") || "/";
  return CLASSIC_ADMIN_PATHS.has(p) || CLASSIC_ADMIN_PATTERNS.some((re) => re.test(p));
}

export default isClassicAdminPath;
