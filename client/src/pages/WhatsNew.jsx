// src/pages/WhatsNew.jsx
//
// Public "What's New" hub. Shows what ADLM Studio does, then a card per
// product (QUIV, CIVIQ, HERON, MEP, RateGen, Courses). Each card links to its
// own detail page at /whats-new/:slug.
//
// Content is data-driven: products come from src/data/changelogs.js, which is
// generated from src/data/changelogs/*.md (one markdown file per product).
// Edit the markdown to publish — no edits needed here.
import React from "react";
import { Link } from "react-router-dom";
import PageSeo from "../components/PageSeo.jsx";
import { FiArrowRight, FiBookOpen, FiClock, FiDownload, FiZap } from "../components/icons.jsx";
import { Reveal, TiltCard } from "../components/effects.jsx";
import { useChangelogs } from "../data/changelogsSource.js";
import { iconOf, accentOf } from "../data/whatsNewTheme.js";
import { GUIDES } from "../data/guides.js";

// Short seasonal note shown above the product cards.
//
// It carries an explicit `until` date and disappears on its own once that
// passes, because a hardcoded "happy new month" still sitting there in November
// reads worse than no greeting at all. To change it, edit `message` and push
// `until` to the first of the following month; to pull it early, set
// `message` to "".
const SEASONAL_NOTE = {
  message:
    "Happy new month from all of us at ADLM Studio. August opens with ADLM Time Pro 1.1.1: dark mode, a rebuilt side menu, and Microsoft Project exports that open first time.",
  until: "2026-09-01",
};

function SeasonalNote() {
  const note = SEASONAL_NOTE;
  if (!note?.message) return null;
  if (new Date() >= new Date(`${note.until}T00:00:00`)) return null;

  return (
    <Reveal className="mt-6">
      <div className="flex items-start gap-3 rounded-adlm-xl border border-adlm-orange/25 bg-adlm-orange/5 px-5 py-4 dark:border-adlm-orange/25 dark:bg-adlm-orange/10">
        <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-adlm-orange/15 text-adlm-orange">
          <FiZap className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-adlm-dark-muted">
          {note.message}
        </p>
      </div>
    </Reveal>
  );
}

function ProductCard({ product, index }) {
  const Icon = iconOf(product.icon);
  const accent = accentOf(product.accent);
  const comingSoon = product.status === "coming-soon" || product.releases.length === 0;

  return (
    <Reveal delay={index * 70} className="h-full">
      <Link
        to={`/whats-new/${product.slug}`}
        className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-adlm-blue-700"
        aria-label={`${product.name}, what's new`}
      >
        <TiltCard
          max={6}
          className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-depth transition-all duration-300 hover:-translate-y-1 hover:shadow-depth-lg dark:border-adlm-dark-border dark:bg-adlm-dark-panel"
        >
          {/* corner accent glow */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full blur-3xl opacity-50 transition-opacity duration-300 group-hover:opacity-90 ${accent.glow}`}
          />

          <div className="relative flex items-start justify-between gap-3">
            <span
              className={`tilt-layer inline-flex h-12 w-12 items-center justify-center rounded-xl ${accent.icon}`}
            >
              <Icon className="h-6 w-6" />
            </span>
            {comingSoon ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-adlm-dark-raised dark:text-adlm-dark-muted">
                <FiClock className="h-3 w-3" />
                Coming soon
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Updated
              </span>
            )}
          </div>

          <h3 className="relative mt-4 flex flex-wrap items-center gap-x-2 text-lg font-semibold text-slate-900 dark:text-adlm-dark-text">
            {product.name}
            {product.category && (
              <span className="text-[11px] font-medium text-slate-400 dark:text-adlm-dark-dim">
                {product.category}
              </span>
            )}
          </h3>

          <p className="relative mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
            {product.summary || product.tagline}
          </p>

          <div className="relative mt-auto flex items-center justify-between border-t border-slate-100 pt-3.5 dark:border-adlm-dark-border">
            <span className="text-xs text-slate-500 dark:text-adlm-dark-dim">
              {comingSoon ? (
                "In development"
              ) : (
                <>
                  Latest <b className={accent.text}>v{product.latest}</b>
                  {product.lastUpdated ? ` · ${product.lastUpdated}` : ""}
                </>
              )}
            </span>
            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${accent.text}`}>
              {comingSoon ? "Preview" : "View updates"}
              <FiArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </TiltCard>
      </Link>
    </Reveal>
  );
}

export default function WhatsNew() {
  const { products } = useChangelogs();

  return (
    <div className="mx-auto max-w-6xl">
      {/* Replaces a bare document.title effect. Same title, plus the canonical,
          Open Graph and breadcrumb tags that effect never set. */}
      <PageSeo path="/whats-new" crumb="What's new" />
      <style>{`@keyframes fade-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Hero, what ADLM does */}
      <header className="relative overflow-hidden rounded-adlm-xl bg-gradient-to-br from-adlm-navy via-adlm-navy-mid to-adlm-navy-tertiary px-6 py-12 text-white motion-safe:animate-[fade-in-up_650ms_ease-out_forwards] sm:px-10 sm:py-14">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-adlm-orange/20 blur-3xl animate-float"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float-slow"
        />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/80 ring-1 ring-white/15">
            <FiZap className="h-3.5 w-3.5 text-adlm-orange" />
            Product Updates
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            What&apos;s New across <span className="text-gradient-warm">ADLM Studio</span>
          </h1>
          <p className="mt-3 leading-relaxed text-white/75">
            ADLM Studio builds digital tools and training for modern Quantity Surveyors, 
            model-based takeoff, priced budgets, rate build-ups and BIM-focused learning,
            tuned for the African construction market. Pick a product below to see the latest
            features, improvements and fixes.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
              {products.length} products
            </span>
            <Link
              to="/products"
              className="inline-flex items-center gap-1.5 rounded-full bg-adlm-orange px-3 py-1 font-semibold text-white transition hover:brightness-110"
            >
              Explore products
              <FiArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Seasonal note: self-expiring, see SEASONAL_NOTE */}
      <SeasonalNote />

      {/* Product cards */}
      <div className="mt-10 grid gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, index) => (
          <ProductCard key={product.slug} product={product} index={index} />
        ))}
      </div>

      {/* User guides: illustrated PDFs, free to download */}
      <Reveal className="mt-12">
        <section className="rounded-adlm-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7 dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-400">
              <FiBookOpen className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-adlm-dark-text">
                User guides
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
                Illustrated, step-by-step PDFs for every ADLM product: free to
                download, no sign-in needed.
              </p>
            </div>
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {GUIDES.map((guide) => (
              <li key={guide.id}>
                <a
                  href={guide.file}
                  download
                  className="group flex h-full items-start gap-3 rounded-adlm-lg border border-slate-200 p-4 transition hover:border-adlm-blue-700/40 hover:bg-slate-50 dark:border-adlm-dark-border dark:hover:bg-adlm-dark-hover"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-adlm-blue-700 group-hover:text-white dark:bg-adlm-dark-raised dark:text-adlm-dark-muted">
                    <FiDownload className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900 dark:text-adlm-dark-text">
                      {guide.title}
                      <span className="ml-2 text-xs font-medium text-slate-400 dark:text-adlm-dark-dim">
                        {guide.pages} pages · PDF
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
                      {guide.blurb}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      {/* Footer CTA */}
      <Reveal className="mb-4 mt-6">
        <div className="rounded-adlm-lg border border-slate-200 bg-white px-6 py-5 text-center dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
          <p className="text-slate-600 dark:text-adlm-dark-muted">
            Looking for something specific?{" "}
            <Link
              to="/products"
              className="font-semibold text-adlm-blue-700 hover:underline dark:text-adlm-blue-400"
            >
              Browse all products
            </Link>{" "}
            or{" "}
            <Link
              to="/quote"
              className="font-semibold text-adlm-blue-700 hover:underline dark:text-adlm-blue-400"
            >
              request a quote
            </Link>
            .
          </p>
        </div>
      </Reveal>
    </div>
  );
}
