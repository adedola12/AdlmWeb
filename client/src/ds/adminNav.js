// His admin rail, on our routes — and the list of screens he drew that we have
// not built.
//
// Kept out of DsAdminShell.jsx so the shell exports only a component: a module
// that exports both a component and a constant breaks Fast Refresh, and this
// is data rather than markup anyway.
//
// TWO PLACES THIS DEPARTS FROM HIM, BOTH DELIBERATE
//
// 1. His rail is a fixed list of 27 links, because his build has 27 admin
//    pages and no notion of who is looking. Ours has roles: a mini-admin holds
//    some areas and not others, and RBAC that shows a person a screen they
//    will be bounced off is not RBAC. So each entry names the permission the
//    destination is gated with, and the rail is filtered per session. Someone
//    holding everything sees his rail.
//
// 2. His hrefs are his page names and ours are ours — /admin/users-lite is his
//    "People", /admin/rategen-master his "Rate data". The mapping is written
//    out rather than guessed at, and where he drew a screen we have not built
//    the entry is absent rather than a link into a 404.

/**
 * `badge` names the queue on /admin/today whose count sits on that rail entry —
 * his `.tail`. The counts come from the SAME endpoint the Today screen draws,
 * so a badge can never disagree with the number on the page it leads to. A
 * queue we do not record (Ada review) has no badge rather than a zero, for the
 * reason Today gives at length: a dash and a zero are different states.
 */
export const NAV = [
  {
    group: "",
    items: [{ to: "/admin", label: "Today", icon: "hi-overview", area: "adminhub", end: true }],
  },
  {
    group: "Approvals",
    items: [
      // His "Purchases" is our hub's pending tab — the same list under a
      // different name. It is where a purchase waits for a person.
      { to: "/admin/pending", label: "Purchases", icon: "hi-card", area: "adminhub", badge: "purchases" },
      { to: "/admin/installations", label: "Installations", icon: "hi-computer", area: "adminhub", badge: "installations" },
      { to: "/admin/ptrainings", label: "Enrolments", icon: "hi-calendar", area: "trainings", badge: "enrolments" },
      { to: "/admin/course-grading", label: "Submissions", icon: "hi-check", area: "learn", badge: "submissions" },
      { to: "/admin/follow-ups", label: "Follow-ups", icon: "hi-phone", area: "adminhub", badge: "followups" },
    ],
  },
  {
    group: "Accounts",
    items: [
      { to: "/admin/organizations", label: "Organisations", icon: "ai-org", area: "adminhub" },
      { to: "/admin/users-lite", label: "People", icon: "hi-team", area: "users" },
      { to: "/admin/roles", label: "Roles", icon: "hi-shield", area: "adminhub", admin: true },
      { to: "/admin/support-tickets", label: "Support", icon: "hi-support", area: "adminhub", badge: "support" },
    ],
  },
  {
    group: "Commerce",
    items: [
      { to: "/admin/subscriptions", label: "Subscriptions", icon: "hi-shield", area: "adminhub" },
      { to: "/admin/active", label: "Entitlements", icon: "hi-plus", area: "adminhub" },
      { to: "/admin/proposals", label: "Quotations", icon: "ai-quote", area: "proposals" },
      { to: "/admin/invoices", label: "Invoices", icon: "hi-billing", area: "invoices" },
      { to: "/admin/coupons", label: "Coupons", icon: "ai-tag", area: "adminhub" },
      { to: "/admin/waitlist", label: "Waitlist", icon: "ai-mail", area: "waitlist" },
    ],
  },
  {
    group: "Catalogue",
    items: [
      { to: "/admin/products", label: "Products", icon: "hi-products", area: "adminhub" },
      { to: "/admin/pricing", label: "Price book", icon: "hi-doc", area: "adminhub" },
      { to: "/admin/rategen-master", label: "Rate data", icon: "wi-library", area: "rategen" },
      { to: "/admin/rategen/build", label: "Build a rate", icon: "hi-plus", area: "rategen" },
      { to: "/admin/rategen", label: "Rate library", icon: "wi-library", area: "rategen" },
      { to: "/admin/saved-rates", label: "Saved rates", icon: "wi-library", area: "rategen" },
    ],
  },
  {
    group: "Learning",
    items: [
      { to: "/admin/courses", label: "Courses", icon: "hi-learning", area: "adminhub" },
      { to: "/admin/learn", label: "Free lessons", icon: "hi-play", area: "learn" },
      { to: "/admin/quizzes", label: "Quizzes", icon: "hi-check", area: "learn" },
      { to: "/admin/physical-training", label: "Events", icon: "hi-calendar", area: "trainings" },
      { to: "/admin/classrooms", label: "Classrooms", icon: "hi-team", area: "trainings" },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/admin/changelogs", label: "What's New", icon: "hi-alert", area: "adminhub" },
      { to: "/admin/showcase", label: "Marketing", icon: "hi-info", area: "showcase" },
      { to: "/admin/emails", label: "Emails", icon: "ai-mail", area: "adminhub" },
      // Flyers and Freebies were their own entries because they are their own
      // collections. They are kinds inside Marketing now, which is his design
      // and the more honest one: adding a flyer and adding a testimonial are
      // the same act. Both routes still work for anything linking to them.
      { to: "/admin/latest", label: "Latest", icon: "hi-info", area: "showcase" },
    ],
  },
  {
    group: "Documents",
    items: [
      // His split, restored: Composer is the tool, Saved is what it kept. One
      // entry pointing at the register with a button to the composer made the
      // tool feel like a footnote to its own output.
      { to: "/admin/documents/compose", label: "Composer", icon: "hi-doc", area: "adminhub" },
      { to: "/admin/documents", label: "Saved", icon: "hi-doc", area: "adminhub" },
      { to: "/admin/audit-log", label: "Audit log", icon: "hi-shield", area: "adminhub", admin: true },
    ],
  },
  {
    // His last block sits below a rule with no heading: AI usage, System and
    // Sign out are not documents, they are how the place is run. `rule` draws
    // the <div class="adm-rule"> he separates it with.
    rule: true,
    items: [
      { to: "/admin/ai-usage", label: "AI usage", icon: "ai-ada", area: "adminhub" },
      // The Takeoff Time Log: hours saved per firm, user and product, with the
      // baseline it rests on written out. Same area as the hub: it is a report,
      // and the one write on it (a new rate-table version) is a hub decision.
      { to: "/admin/time-saved", label: "Time saved", icon: "hi-check", area: "adminhub" },
      { to: "/admin/storage", label: "Storage", icon: "hi-downloads", area: "adminhub" },
      { to: "/admin/settings", label: "System", icon: "hi-settings", area: "adminhub" },
    ],
  },
];

/**
 * Screens he drew that we have not built. Data, not dead links — the rail
 * cannot offer them, and the port has a worklist instead of a vague sense that
 * something is outstanding.
 *
 *   Ada review   — a queue of Ada's answers for a person to correct.
 *   Certificates — issuing exists; nothing looks over what was issued.
 *   Templates    — document templates are code, not records.
 *   Issued       — no register of what has gone out.
 */
export const MISSING = [
  "Ada review",
  "Certificates",
  "Templates",
  "Issued",
];

/**
 * The page name for his header, taken from the rail rather than passed in per
 * route. The rail already names every destination, so a title cannot drift
 * away from the nav entry that leads to it, and a screen added to the rail
 * gets its heading for free.
 *
 * Longest match wins, so /admin/products/123/edit still reads "Products"
 * rather than falling through to "Today".
 */
export function titleFor(pathname) {
  const p = String(pathname || "");
  let best = null;
  for (const g of NAV) {
    for (const it of g.items) {
      if (p === it.to || p.startsWith(`${it.to}/`)) {
        if (!best || it.to.length > best.to.length) best = it;
      }
    }
  }
  return best?.label || "Admin";
}
