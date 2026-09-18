// The signed-in rail, as data (R03).
//
// One array drives the whole rail: DsRailNav renders it with Richard's
// classes (.dsh-grp-t, .dsh-nav, .dsh-tools, .dsh-sub, .tail, .off), and
// lib/railActive.js decides which item is current from it. Richard is
// redesigning the rail; his styling can drop onto this without touching the
// logic, and adding or moving an item is an edit here only.
//
// Order and wording follow his tools/rail.js (17 Sep 2026).
//
// Item fields:
//   id       stable key, also what an alias points at
//   label    what the rail says
//   to       the route (pathname only)
//   query    optional { key: value } the route must carry to be this item
//            (the tool pages share one path and differ by ?t=)
//   also     optional extra exact routes for the same item, with :params
//            (a project page is still "Projects")
//   icon     sprite id (<use href="#…">) or img: "/ds/…png"
//   badge    key into the shell's counts (d.projects, d.certificates, …)
//   dot      key into the shell's red-dot flags (R11: open assignments)
//   product  a tool's productKey. Owned (a live licence, from /me/rail
//            ownedKeys) → a normal link; not owned → greyed with "Add",
//            linking to the product page. Never a fixed sample state.
//   ready    false while the screen behind it is not built yet; rendered
//            greyed and not a link, so the rail never offers a dead end

export const RAIL = [
  {
    group: "Work",
    items: [
      { id: "work-home", label: "Overview", to: "/work", icon: "wi-home" },
      {
        id: "tools",
        label: "My tools",
        icon: "wi-tools",
        fold: "adlm-tools",
        // Each tool opens that tool's projects (the workspace at
        // /projects/:tool). His /work-tool pages replace these routes in P0.4.
        items: [
          { id: "tool-quiv", label: "QUIV", to: "/projects/revit", product: "revit", img: "/ds/ic-quiv.png" },
          { id: "tool-heron", label: "HERON", to: "/projects/planswift", product: "planswift", img: "/ds/ic-heron.png" },
          { id: "work-library", label: "RateGen", to: "/work/library", img: "/ds/ic-rategen.png", also: ["/work/rate/:id"] },
          { id: "tool-mep", label: "Revit MEP", to: "/projects/mep", product: "mep", img: "/ds/ic-mep.png" },
          { id: "tool-civiq", label: "CIVIQ", to: "/projects/civil3d", product: "civil3d", img: "/ds/ic-civiq.png" },
        ],
      },
      {
        id: "work-projects",
        label: "Projects",
        to: "/work/projects",
        icon: "wi-projects",
        badge: "projects",
        also: ["/work/project/:productKey/:id", "/projects/:tool"],
      },
    ],
  },
  {
    group: "Learn",
    items: [
      { id: "dash-learning", label: "My learning", to: "/dash-learning", icon: "hi-learning", also: ["/dash-course/:sku"] },
      { id: "dash-assignments", label: "Assignments", to: "/dash-assignments", icon: "wi-task", dot: "assignments", ready: false },
      { id: "dash-certificates", label: "Certificates", to: "/dash-certificates", icon: "hi-cert", badge: "certificates" },
      { id: "learn", label: "Lessons & events", to: "/learn", icon: "hi-play" },
      { id: "dash-guides", label: "Guides & docs", to: "/manage/guides", icon: "hi-doc" },
    ],
  },
  {
    group: "Manage",
    sub: "Installer Hub",
    items: [
      { id: "dash-home", label: "Overview", to: "/manage", icon: "hi-overview" },
      { id: "dash-products", label: "Products & seats", to: "/manage/products", icon: "hi-products", badge: "seats" },
      { id: "dash-team", label: "Team", to: "/manage/team", icon: "hi-team", badge: "team" },
      { id: "dash-billing", label: "Billing & invoices", to: "/manage/billing", icon: "hi-billing" },
      { id: "dash-downloads", label: "Downloads", to: "/manage/downloads", icon: "hi-downloads" },
      { id: "dash-support", label: "Support", to: "/manage/support", icon: "hi-support" },
    ],
  },
  {
    group: null,
    items: [
      { id: "dash-settings", label: "Account settings", to: "/manage/settings", icon: "hi-settings" },
      { id: "sign-out", label: "Sign out", to: "/", icon: "hi-signout", action: "signOut" },
    ],
  },
];

// A screen whose own route is not in the rail names the item it belongs to.
// Keys are the `page` a route hands DsAppShell (his page names).
export const PAGE_ALIAS = {
  "dash-course": "dash-learning",
  "work-rate": "work-library",
  "work-programme": "work-home",
  "dash-product": "dash-products",
};

/** Every leaf item, in rail order. */
export function railItems(rail = RAIL) {
  const out = [];
  for (const g of rail) {
    for (const it of g.items) {
      if (it.items) out.push(...it.items);
      else out.push(it);
    }
  }
  return out;
}
