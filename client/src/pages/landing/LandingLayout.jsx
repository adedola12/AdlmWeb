// Shared shell for the search landing pages.
//
// Each of these pages targets one phrase someone actually types, answers it in
// full, and links to the product that does the work. They are deliberately
// plain: no data fetching, no auth, no client state. That is what lets them
// render identically on the server and in the browser, and it means the only
// thing that can break them is the copy being wrong.
//
// Uses the brand tokens already defined in index.css (adlm-navy, adlm-orange,
// adlm-blue-700) rather than introducing a second palette. Lexend is the global
// font, so nothing here sets one.
import React from "react";
import { Link } from "react-router-dom";

import Seo from "../../components/Seo.jsx";
import { metaFor } from "../../lib/pageMeta.js";
import { breadcrumbSchema, faqSchema } from "../../lib/schema.js";

/**
 * Facts stated on every one of these pages. All five are verifiable: the
 * registration number is the CAC one, the partnership is a real designation,
 * and the training figure is the one already published on the About page.
 * Nothing here is rounded up, and nothing gets added without a source.
 */
const COMPANY_FACTS = [
  ["Founded", "2018"],
  ["Registered", "RC 7440343"],
  ["Based in", "Lagos, Nigeria"],
  ["NIQS", "Official Technical Partner"],
  ["Trained", "800+ AEC professionals"],
];

function Section({ heading, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {heading}
      </h2>
      <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-adlm-dark-muted">
        {children}
      </div>
    </section>
  );
}

/**
 * @param {string} path      route this page lives at
 * @param {string} crumb     its label in the breadcrumb trail
 * @param {string} eyebrow   small line above the heading
 * @param {string} h1        matches the phrase the page targets
 * @param {node}   intro     opening paragraphs
 * @param {array}  sections  [{ heading, body }] where body is JSX
 * @param {array}  faq       [{ question, answer }] rendered AND marked up
 * @param {array}  related   [{ label, to, note }] internal links
 */
export default function LandingLayout({
  path,
  crumb,
  eyebrow,
  h1,
  intro,
  sections = [],
  faq = [],
  related = [],
}) {
  const meta = metaFor(path);

  return (
    <div className="mx-auto max-w-4xl px-1 pb-16">
      <Seo
        title={meta?.title}
        description={meta?.description}
        path={path}
        jsonLd={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: crumb, path },
          ]),
          // Built from the same array rendered below, so the marked-up
          // questions are always ones a visitor can actually see.
          faqSchema(faq),
        ].filter(Boolean)}
      />

      <header className="relative overflow-hidden rounded-2xl bg-adlm-navy px-6 py-10 text-white md:px-10 md:py-12">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div
          aria-hidden="true"
          className="absolute -top-16 right-8 h-64 w-64 rounded-full bg-adlm-orange/20 blur-3xl"
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-adlm-orange">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl">
            {h1}
          </h1>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-white/80 md:text-base">
            {intro}
          </div>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {COMPANY_FACTS.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-adlm-dark-panel dark:ring-adlm-dark-border"
          >
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-adlm-dark-dim">
              {label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {sections.map((section) => (
        <Section key={section.heading} heading={section.heading}>
          {section.body}
        </Section>
      ))}

      {faq.length > 0 && (
        <Section heading="Common questions">
          <div className="space-y-5">
            {faq.map((item) => (
              <div key={item.question}>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {item.question}
                </h3>
                <p className="mt-1.5">{item.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {related.length > 0 && (
        <Section heading="Where to go next">
          <ul className="grid gap-3 sm:grid-cols-2">
            {related.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block h-full rounded-xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-adlm-blue-700 dark:bg-adlm-dark-panel dark:ring-adlm-dark-border"
                >
                  <span className="font-semibold text-adlm-blue-700 dark:text-adlm-blue-400">
                    {link.label}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-adlm-dark-muted">
                    {link.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-10 rounded-2xl bg-adlm-navy px-6 py-8 text-white md:px-10">
        <h2 className="text-xl font-semibold tracking-tight">
          Work out what this costs for your firm
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-white/80">
          Pick the tools you need, set how many people use them, and add
          training. The quotation builder prices it in naira or dollars and you
          can print or email the result.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/quote"
            className="rounded-lg bg-adlm-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Build a quotation
          </Link>
          <Link
            to="/products"
            className="rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          >
            See all products
          </Link>
        </div>
      </div>
    </div>
  );
}
