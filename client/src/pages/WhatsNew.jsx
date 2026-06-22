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
import { FiArrowRight, FiClock, FiZap } from "react-icons/fi";
import { Reveal, TiltCard } from "../components/effects.jsx";
import { products } from "../data/changelogs.js";
import { iconOf, accentOf } from "../data/whatsNewTheme.js";

function ProductCard({ product, index }) {
  const Icon = iconOf(product.icon);
  const accent = accentOf(product.accent);
  const comingSoon = product.status === "coming-soon" || product.releases.length === 0;

  return (
    <Reveal delay={index * 70} className="h-full">
      <Link
        to={`/whats-new/${product.slug}`}
        className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-adlm-blue-700"
        aria-label={`${product.name} — what's new`}
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
  React.useEffect(() => {
    const prev = document.title;
    document.title = "What's New | ADLM Studio";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <style>{`@keyframes fade-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Hero — what ADLM does */}
      <header className="relative overflow-hidden rounded-adlm-xl bg-gradient-to-br from-adlm-navy via-adlm-navy-mid to-adlm-navy-tertiary px-6 py-12 text-white opacity-0 motion-safe:animate-[fade-in-up_650ms_ease-out_forwards] sm:px-10 sm:py-14">
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
            ADLM Studio builds digital tools and training for modern Quantity Surveyors —
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

      {/* Product cards */}
      <div className="mt-10 grid gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, index) => (
          <ProductCard key={product.slug} product={product} index={index} />
        ))}
      </div>

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
