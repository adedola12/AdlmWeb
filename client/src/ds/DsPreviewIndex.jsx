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
    note: "Staged for review only — the real routes keep their own logic and backends.",
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
    slugs: ["work-home", "work-projects", "work-project", "work-library", "work-rate", "work-programme"],
  },
  { title: "Other", slugs: ["ada", "doc-preview"] },
];

function Row({ slug }) {
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
          new route
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
        {DS_PAGES.length} marketing pages ported from Richard&apos;s rebuild, staged beside the
        live site. Nothing here replaces a real route yet, and the whole
        <code className="mx-1 px-1 rounded bg-slate-100 dark:bg-slate-800">/preview/</code>
        tree is disallowed in robots.txt.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-1">{g.title}</h2>
          {g.note && <p className="text-sm text-slate-500 mb-2">{g.note}</p>}
          <ul>
            {g.slugs
              .filter((s) => DS_PAGES.some((p) => p.slug === s))
              .map((s) => (
                <Row key={s} slug={s} />
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
