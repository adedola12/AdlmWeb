// src/pages/QuivWhatsNew.jsx
//
// Public "What's New" / changelog page for QUIV.
// Content lives in src/data/quivChangelog.js — edit that file to publish
// an update; this page renders whatever is there. No edits needed here.
import React from "react";
import { Link } from "react-router-dom";
import {
  FiStar,
  FiTrendingUp,
  FiTool,
  FiBox,
  FiCheck,
  FiArrowRight,
} from "react-icons/fi";
import { releases, QUIV_PRODUCT } from "../data/quivChangelog.js";

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

function ReleaseCard({ release }) {
  const anchor = `v${release.version}`;
  return (
    <article
      id={anchor}
      className="relative scroll-mt-24 grid md:grid-cols-[200px_1fr] gap-5 md:gap-8"
    >
      {/* Left rail: version + date (sticks while you read on desktop) */}
      <div className="md:sticky md:top-24 md:self-start">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-adlm bg-adlm-navy text-white text-sm font-semibold dark:bg-adlm-dark-raised">
            <FiBox className="w-3.5 h-3.5 text-adlm-orange" />
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
    </article>
  );
}

export default function QuivWhatsNew() {
  // Set the document title for this SPA route (basic SEO / shareability).
  React.useEffect(() => {
    const prev = document.title;
    document.title = `What's New — ${QUIV_PRODUCT.name} | ADLM Studio`;
    return () => {
      document.title = prev;
    };
  }, []);

  const latest = releases.find((r) => r.latest) || releases[0];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-adlm-xl bg-gradient-to-br from-adlm-navy via-adlm-navy-mid to-adlm-navy-tertiary px-6 py-10 sm:px-10 sm:py-12 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-adlm-orange/20 blur-3xl"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/80 ring-1 ring-white/15">
            <FiBox className="w-3.5 h-3.5 text-adlm-orange" />
            {QUIV_PRODUCT.name}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            What&apos;s New in {QUIV_PRODUCT.name}
          </h1>
          <p className="mt-3 max-w-2xl text-white/70">
            {QUIV_PRODUCT.tagline}. Here&apos;s everything we&apos;ve shipped —
            newest first.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
              <FiCheck className="w-4 h-4 text-emerald-300" />
              {QUIV_PRODUCT.compatibility}
            </span>
            {latest && (
              <a
                href={`#v${latest.version}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-adlm-orange px-3 py-1 font-semibold text-white transition hover:brightness-110"
              >
                Latest: v{latest.version}
                <FiArrowRight className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Timeline of releases */}
      <div className="mt-10 space-y-12 pb-8">
        {releases.map((release) => (
          <ReleaseCard key={release.version} release={release} />
        ))}
      </div>

      {/* Footer CTA */}
      <div className="mb-4 rounded-adlm-lg border border-slate-200 bg-white px-6 py-5 text-center dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
        <p className="text-slate-600 dark:text-adlm-dark-muted">
          Want QUIV for your team?{" "}
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
    </div>
  );
}
