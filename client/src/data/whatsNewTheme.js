// whatsNewTheme.js
//
// Shared icon + accent maps for the "What's New" hub and product pages.
// Front matter in each src/data/changelogs/*.md sets `icon` and `accent`
// (string keys); these maps turn those keys into a React icon component and a
// bundle of Tailwind class strings.
//
// NOTE: the class strings here are written out in full (no interpolation) so
// Tailwind's scanner sees them and keeps them in the build.

import {
  FiBox,
  FiMap,
  FiLayers,
  FiZap,
  FiDollarSign,
  FiPlayCircle,
  FiTrendingUp,
  FiBookOpen,
} from "react-icons/fi";

export const ICONS = {
  cube: FiBox,
  map: FiMap,
  layers: FiLayers,
  zap: FiZap,
  dollar: FiDollarSign,
  play: FiPlayCircle,
  trending: FiTrendingUp,
  book: FiBookOpen,
};

export function iconOf(key) {
  return ICONS[key] || FiBox;
}

// Each accent bundles: text colour, icon-tile tint, a soft glow blob, and a
// gradient pair for the detail-page "Latest" pill. Dark-mode variants baked in.
export const ACCENTS = {
  orange: {
    text: "text-adlm-orange",
    icon: "bg-adlm-orange/10 text-adlm-orange",
    glow: "bg-adlm-orange/25",
    pill: "bg-adlm-orange/15 text-adlm-orange ring-adlm-orange/30",
  },
  blue: {
    text: "text-adlm-blue-700 dark:text-adlm-blue-400",
    icon: "bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-400",
    glow: "bg-adlm-blue-600/25",
    pill: "bg-adlm-blue-700/15 text-adlm-blue-700 ring-adlm-blue-700/30 dark:text-adlm-blue-400",
  },
  sky: {
    text: "text-sky-600 dark:text-sky-400",
    icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    glow: "bg-sky-500/25",
    pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  },
  emerald: {
    text: "text-emerald-600 dark:text-emerald-300",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    glow: "bg-emerald-500/25",
    pill: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-300",
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    glow: "bg-violet-500/25",
    pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-300",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    glow: "bg-amber-500/25",
    pill: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-300",
  },
};

export function accentOf(key) {
  return ACCENTS[key] || ACCENTS.blue;
}
