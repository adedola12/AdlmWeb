// src/pages/WhatsNewProduct.jsx
//
// Public per-product "What's New" / changelog page at /whats-new/:slug.
// Content is data-driven: the product (and its releases) is looked up from
// src/data/changelogs.js, generated from src/data/changelogs/<slug>.md.
// Edit the markdown to publish an update — no edits needed here.
import React from "react";
import { Link, useParams } from "react-router-dom";
import {
  FiStar,
  FiTrendingUp,
  FiTool,
  FiCheck,
  FiArrowRight,
  FiArrowLeft,
  FiClock,
} from "react-icons/fi";
import { bySlug } from "../data/changelogs.js";
import { iconOf, accentOf } from "../data/whatsNewTheme.js";
import { Reveal } from "../components/effects.jsx";

/* Visual treatment per change type — colour, icon and label. */
const TYPE_META = {
  new: {
    label: "New",
    Icon: FiStar,
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "text-emerald-500",
  },
  improved: {
    label: "Improved",
    Icon: FiTrendingUp,
    pill: "bg-sky-100 text-adlm-blue-700 dark:bg-adlm-blue-500/15 dark:text-adlm-blue-400",
    dot: "text-adlm-blue-600 dark:text-adlm-blue-400",
  },
  fixed: {
    label: "Fixed",
    Icon: FiTool,
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "text-amber-500",
  },
};

function ChangeGroup({ type, items }) {
  const meta = TYPE_META[type] || TYPE_META.new;
  const { Icon } = meta;
  return (
    <div className="mt-5 first:mt-0">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.pill}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {meta.label}
      </span>
      <ul className="mt-3 space-y-2.5">
        {items.map((text, i) => (
          <li key={i} className="flex gap-2.5">
            <FiCheck className={`mt-0.5 w-4 h-4 flex-shrink-0 ${meta.dot}`} />
            <span className="text-[15px] leading-relaxed text-slate-700 dark:text-adlm-dark-muted">
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReleaseCard({ release, accent, index }) {
  const anchor = `v${release.version}`;
  return (
    <Reveal as="article" delay={Math.min(index * 60, 240)}>
      <div id={anchor} className="relative scroll-mt-24 grid md:grid-cols-[200px_1fr] gap-5 md:gap-8">
        {/* Left rail: version + date (sticks while you read on desktop) */}
        <div className="md:sticky md:top-24 md:self-start">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-adlm bg-adlm-navy text-white text-sm font-semibold dark:bg-adlm-dark-raised">
              <span className={`h-2 w-2 rounded-full ${accent.text}`} style={{ backgroundColor: "currentColor" }} />
              v{release.version}
            </span>
            {release.latest && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-adlm-orange text-white">
                Latest
              </span>
            )}
          </div>
          <div className="mt-2 text-sm font-medium text-slate-500 dark:text-adlm-dark-dim">
            {release.date}
          </div>
        </div>

        {/* Right: the release body card */}
        <div className="rounded-adlm-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-adlm-dark-text">
            {release.title}
          </h2>
          {release.highlight && (
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
              {release.highlight}
            </p>
          )}
          {release.changes?.map((g) => (
            <ChangeGroup key={g.type} type={g.type} items={g.items} />
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* Shown when a product exists but has no published releases yet. */
function ComingSoon({ product, accent }) {
  const Icon = iconOf(product.icon);
  return (
    <Reveal className="mt-10 mb-4">
      <div className="relative overflow-hidden rounded-adlm-xl border border-slate-200 bg-white px-6 py-14 text-center shadow-depth dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-50 ${accent.glow}`}
        />
        <span
          className={`relative inline-flex h-14 w-14 items-center justify-center rounded-2xl ${accent.icon}`}
        >
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="relative mt-5 text-xl font-semibold text-slate-900 dark:text-adlm-dark-text">
          Updates coming soon
        </h2>
        <p className="relative mx-auto mt-2 max-w-md text-slate-600 dark:text-adlm-dark-muted">
          {product.name} is in active development. Release notes will appear here as soon as
          the first version ships.
        </p>
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/whats-new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-adlm-dark-border dark:text-adlm-dark-text dark:hover:bg-adlm-dark-hover"
          >
            <FiArrowLeft className="h-4 w-4" />
            All products
          </Link>
          <Link
            to="/quote"
            className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-orange px-4 py-2 text-sm font-semibold text-white shadow-glow-orange transition hover:brightness-110"
          >
            Talk to us
            <FiArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

/* Shown when the :slug doesn't match any product. */
function NotFound() {
  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-adlm-dark-text">
        Product not found
      </h1>
      <p className="mt-2 text-slate-600 dark:text-adlm-dark-muted">
        We couldn&apos;t find a What&apos;s New page for that product.
      </p>
      <Link
        to="/whats-new"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-adlm-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0050c8]"
      >
        <FiArrowLeft className="h-4 w-4" />
        Back to What&apos;s New
      </Link>
    </div>
  );
}

export default function WhatsNewProduct() {
  const { slug } = useParams();
  const product = bySlug[String(slug || "").toLowerCase()];

  // Scroll to top when switching products (router doesn't do this on its own).
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  React.useEffect(() => {
    const prev = document.title;
    document.title = product
      ? `What's New — ${product.name} | ADLM Studio`
      : "What's New | ADLM Studio";
    return () => {
      document.title = prev;
    };
  }, [product]);

  if (!product) return <NotFound />;

  const accent = accentOf(product.accent);
  const Icon = iconOf(product.icon);
  const releases = product.releases || [];
  const latest = releases.find((r) => r.latest) || releases[0];
  const hasReleases = releases.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <style>{`@keyframes fade-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Back link */}
      <Link
        to="/whats-new"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-adlm-blue-700 dark:text-adlm-dark-dim dark:hover:text-adlm-blue-400"
      >
        <FiArrowLeft className="h-4 w-4" />
        All product updates
      </Link>

      {/* Hero */}
      <header className="relative mt-3 overflow-hidden rounded-adlm-xl bg-gradient-to-br from-adlm-navy via-adlm-navy-mid to-adlm-navy-tertiary px-6 py-10 text-white opacity-0 motion-safe:animate-[fade-in-up_600ms_ease-out_forwards] sm:px-10 sm:py-12">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl ${accent.glow}`}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/80 ring-1 ring-white/15">
            <Icon className="h-4 w-4" />
            {product.name}
            {product.category ? ` · ${product.category}` : ""}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            What&apos;s New in {product.name}
          </h1>
          <p className="mt-3 max-w-2xl text-white/70">
            {product.tagline}
            {hasReleases ? ". Here's everything we've shipped — newest first." : "."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            {product.compatibility && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                <FiCheck className="h-4 w-4 text-emerald-300" />
                {product.compatibility}
              </span>
            )}
            {hasReleases && latest ? (
              <a
                href={`#v${latest.version}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-adlm-orange px-3 py-1 font-semibold text-white transition hover:brightness-110"
              >
                Latest: v{latest.version}
                <FiArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                <FiClock className="h-4 w-4" />
                Coming soon
              </span>
            )}
          </div>
        </div>
      </header>

      {hasReleases ? (
        <>
          {/* Timeline of releases */}
          <div className="mt-10 space-y-12 pb-8">
            {releases.map((release, index) => (
              <ReleaseCard
                key={release.version}
                release={release}
                accent={accent}
                index={index}
              />
            ))}
          </div>

          {/* Footer CTA */}
          <div className="mb-4 rounded-adlm-lg border border-slate-200 bg-white px-6 py-5 text-center dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
            <p className="text-slate-600 dark:text-adlm-dark-muted">
              Want {product.name} for your team?{" "}
              <Link
                to="/products"
                className="font-semibold text-adlm-blue-700 hover:underline dark:text-adlm-blue-400"
              >
                Explore our products
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
        </>
      ) : (
        <ComingSoon product={product} accent={accent} />
      )}
    </div>
  );
}
