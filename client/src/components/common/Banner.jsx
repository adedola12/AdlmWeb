import React from "react";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimes,
} from "../icons.jsx";

// Inline status message — an error, a confirmation, a heads-up.
//
// ProjectsGeneric carried two hand-rolled copies of this pair (one in each
// branch of the sidebar), both light-mode only: `bg-red-50 text-red-700`
// with no dark: variant, so in dark mode an error rendered as a pale pink
// slab against a navy page. One component, four tones, both themes.

const TONES = {
  error: {
    icon: FaExclamationTriangle,
    wrap:
      "border-red-200 bg-red-50 text-red-800 " +
      "dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
    icn: "text-red-500 dark:text-red-300",
    role: "alert",
  },
  success: {
    icon: FaCheckCircle,
    wrap:
      "border-emerald-200 bg-emerald-50 text-emerald-800 " +
      "dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    icn: "text-emerald-500 dark:text-emerald-300",
    role: "status",
  },
  warning: {
    icon: FaExclamationTriangle,
    wrap:
      "border-amber-200 bg-amber-50 text-amber-800 " +
      "dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    icn: "text-amber-500 dark:text-amber-300",
    role: "status",
  },
  info: {
    icon: FaInfoCircle,
    wrap:
      "border-adlm-blue-200 bg-blue-50 text-slate-700 " +
      "dark:border-adlm-blue-600/30 dark:bg-adlm-blue-600/10 dark:text-adlm-dark-text",
    icn: "text-adlm-blue-700 dark:text-adlm-blue-300",
    role: "status",
  },
};

export default function Banner({
  tone = "info",
  children,
  onDismiss = null,
  className = "",
}) {
  if (!children) return null;

  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;

  return (
    <div
      role={t.role}
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${t.wrap} ${className}`}
    >
      <Icon className={`mt-0.5 shrink-0 text-[13px] ${t.icn}`} />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss"
          className="-mr-1 shrink-0 rounded p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <FaTimes className="text-[11px]" />
          <span className="sr-only">Dismiss</span>
        </button>
      ) : null}
    </div>
  );
}
