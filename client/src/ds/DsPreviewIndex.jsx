// Index of the staged redesign, at /preview.
//
// Exists so the pages can actually be reviewed: 25 URLs is more than anyone
// will keep in their head, and every row pairs the staged page with the live
// page it is meant to replace so the two can be compared directly.
//
// Styled with the app's own Tailwind rather than the ported design system —
// this is a review tool, not part of the redesign, and it should not be
// mistaken for one of Richard's pages.

import React from "react";
import { Link, ScrollRestoration } from "react-router-dom";
import { DS_PAGES } from "./pages/manifest.js";
import { MAP } from "../lib/dsRoutes.js";
import { WorkInFlight } from "../features/work/WorkBoard.jsx";

// The staged slug and the key it has in the route map differ for the home
// page only: his file is index.html, the preview path is /preview/home.
const SLUG_TO_KEY = { home: "index" };

const GROUPS = [
  { title: "Core", slugs: ["home", "about", "products", "pricing", "learn", "whats-new", "customers", "contact", "how-it-works", "quote"] },
  { title: "Products", slugs: ["quiv", "heron", "rategen", "mep", "timepro", "civiq", "mobile"] },
  { title: "Solutions", slugs: ["solutions-firms", "solutions-professionals", "solutions-students", "solutions-institutions"] },
  { title: "Company & legal", slugs: ["careers", "press", "privacy", "terms", "licensing"] },
  {
    title: "Auth & commerce",
    note: "Staged for review only. The real routes keep their own logic and backends.",
    slugs: ["login", "signup", "verify", "cart", "checkout", "thanks", "account"],
  },
  {
    title: "Manage / Installer Hub",
    note: "His dash-* screens. We already have working versions of these on real data.",
    slugs: [
      "dash-home", "dash-products", "dash-product", "dash-billing", "dash-downloads",
      "dash-learning", "dash-course", "dash-certificates", "dash-settings",
      "dash-support", "dash-team", "dash-emails",
    ],
  },
  {
    title: "Work surface",
    note: "His work-* screens, against his own sample data.",
    slugs: [
      "work-home", "work-projects", "work-project", "work-tool", "work-library",
      "work-rate", "work-programme",
    ],
  },
  {
    // These two were ported and routable but linked from nowhere, so the only
    // way to see them was to know the URL.
    title: "Plugins (side one)",
    note:
      "Design references for the desktop add-ins: QUIV inside Revit, HERON beside PlanSwift. " +
      "They render bare, as his build does — no nav, no footer, no Ada. The behaviour they " +
      "picture lives in the C# plugins, not here. HERON was rebuilt on 22 Sep 2026 on how it " +
      "actually works: it reads the ADLM template, not the drawing.",
    badge: "design reference",
    slugs: ["plugin-quiv", "plugin-heron"],
  },
  {
    // His 22 September update. Staged so the design is recorded and can never
    // be mistaken for a customer route — not so it can be reviewed here.
    title: "Windows products (Installer Hub and splash screens)",
    note:
      "Designs for software that runs on a QS's PC, not pages of this website: the Installer " +
      "Hub drawn as a desktop app, and the four launch screens, where the splash settles into " +
      "the sign-in. Building them is a desktop job for the owner. Each of his sources is a " +
      "mount point only — what the screen draws is in his assets/js/splash.js and hub.js, " +
      "which are not ported — so these staged pages are near enough empty on purpose. " +
      "Review the real thing in his own repo, ADLMWebNewUI.",
    badge: "design reference",
    slugs: ["hub", "splash-hub", "splash-quiv", "splash-heron", "splash-rategen"],
  },
  { title: "Other", slugs: ["ada", "doc-preview"] },
];

function Row({ slug, badge }) {
  const live = MAP[SLUG_TO_KEY[slug] || slug] ?? null;
  // A route this app does not have yet — the redesign adds it.
  const isNew =
    live === null ||
    !["/", "/about", "/products", "/learn", "/whats-new", "/testimonials"].includes(live) &&
      !live.startsWith("/product/");

  return (
    <li className="flex items-center gap-3 py-2 border-b border-slate-200 dark:border-slate-700">
      <Link
        to={`/preview/${slug}`}
        className="font-medium text-adlm-blue-700 dark:text-adlm-blue-600 hover:underline"
      >
        /preview/{slug}
      </Link>
      <span className="flex-1" />
      {isNew ? (
        <span className="text-xs px-2 py-0.5 rounded bg-adlm-orange/15 text-adlm-orange">
          {/* "new route" is wrong for a page that will never become one — the
              plugin references have no live counterpart by design. */}
          {badge || "new route"}
        </span>
      ) : (
        <a href={live} className="text-sm text-slate-500 hover:underline">
          compare with {live}
        </a>
      )}
    </li>
  );
}

export default function DsPreviewIndex() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <ScrollRestoration />
      <h1 className="text-2xl font-semibold mb-2">Redesign preview</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">
        {DS_PAGES.length} pages ported from Richard&apos;s rebuild, staged beside the live site.
        Nothing here replaces a real route yet — and the design references at the foot never
        will, because they are drawings of the Windows products. The whole
        <code className="mx-1 px-1 rounded bg-slate-100 dark:bg-slate-800">/preview/</code>
        tree is disallowed in robots.txt.
      </p>

      {/* The reviewer's view of the code side: what is being built while he
          designs, and what is waiting for his decision. Needs the release-desk
          permission; anyone else sees a one-line notice instead. */}
      <section className="mb-8">
        <WorkInFlight title="What is being built right now" />
      </section>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-1">New experiences</h2>
        <p className="text-sm text-slate-500 mb-2">
          Built on his components for things his pages point at but do not do yet.
        </p>
        <ul>
          <li className="flex items-center gap-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <Link to="/fit" className="font-medium text-adlm-blue-700 dark:text-adlm-blue-600 hover:underline">
              /fit
            </Link>
            <span className="flex-1" />
            <span className="text-sm text-slate-500">find the product, plan and price from four answers</span>
          </li>
        </ul>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-1">{g.title}</h2>
          {g.note && <p className="text-sm text-slate-500 mb-2">{g.note}</p>}
          <ul>
            {g.slugs
              .filter((s) => DS_PAGES.some((p) => p.slug === s))
              .map((s) => (
                <Row key={s} slug={s} badge={g.badge} />
              ))}
          </ul>
        </section>
      ))}

      <p className="text-sm text-slate-500">
        Mobile navigation works: the burger opens the full drawer below 1000px, and links inside it
        stay within the preview rather than jumping to the live pages.
      </p>
    </main>
  );
}
