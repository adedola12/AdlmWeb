import React from "react";

// A designed empty state, in place of a bare line of grey text.
//
// The project explorer's "No projects found." told the user nothing they
// could act on. Projects arrive in this list from the desktop plugins, not
// from anything on this page, so an empty list is nearly always a person
// who has not saved a takeoff to the cloud yet — that is the sentence the
// state has to say, with the two things they *can* do next beside it.
//
// Corporate mode per docs/BRAND_SYSTEM.md §1: pale ground, generous
// whitespace, hexagon field, one blue accent. No orange unless the state is
// a dead end the user needs pushing out of.

export default function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions = null,
  hint = null,
  tone = "neutral",
  compact = false,
}) {
  const accent =
    tone === "search"
      ? "from-slate-400 to-slate-500 shadow-none"
      : "from-adlm-blue-700 to-adlm-blue-600 shadow-glow-blue";

  return (
    <div
      className={[
        "hex-field relative overflow-hidden rounded-2xl border border-slate-200 text-center",
        "bg-gradient-to-b from-white to-slate-50",
        "dark:border-adlm-dark-border dark:from-adlm-dark-panel dark:to-adlm-dark-bg",
        compact ? "px-6 py-10" : "px-6 py-16",
      ].join(" ")}
    >
      <div className="mx-auto max-w-md">
        {Icon ? (
          <div
            className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-white ${accent}`}
          >
            <Icon className="text-xl" />
          </div>
        ) : null}

        {eyebrow ? <div className="eyebrow mt-4">{eyebrow}</div> : null}

        <h3 className="mt-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h3>

        {description ? (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-adlm-dark-muted">
            {description}
          </p>
        ) : null}

        {actions ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        ) : null}

        {hint ? (
          <p className="mx-auto mt-5 max-w-sm text-xs leading-relaxed text-slate-400 dark:text-adlm-dark-dim">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
