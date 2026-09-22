// What chrome a staged redesign page gets, at /preview/<slug>.
//
// Its own module rather than constants inside DsPreview.jsx, because a file
// that exports both a component and a helper loses fast refresh (and eslint
// says so). Both answers come from his build, site/build.js:
//
//   * A page with "nochrome": true in its meta block is emitted with no nav,
//     no footer and no promo band. Today that is his 32 admin-* screens, which
//     carry their own .adm-rail, plus plugin-quiv and plugin-heron, which are
//     full-window simulations of QUIV docked in Revit and HERON docked in
//     PlanSwift. A marketing nav around a Revit ribbon is simply wrong.
//   * adaFor() leaves the floating Ada off dash-, work-, doc-, admin- and,
//     since 17 Sep 2026, plugin- pages.

const BARE_SCREEN = /^(admin|plugin)-/;
const PLUGIN_SCREEN = /^plugin-/;

/** Does this staged page render with no shell of ours around it? */
export const isBareScreen = (slug) => BARE_SCREEN.test(String(slug || ""));

/**
 * Does this staged page get our floating Ada?
 *
 * We keep her on the preview dash- and work- screens although his adaFor()
 * would not: Ada is ours, not his — Claude-backed through /agent/chat rather
 * than keyword matching over published copy — and a reviewer walking the
 * staged app screens should be able to open her.
 *
 * The plugin references are the exception. They picture a panel docked inside
 * Revit or PlanSwift, where a floating web chat button has nothing to float
 * over and only suggests the desktop add-in ships one. It does not.
 */
export const hasFloatingAda = (slug) => !PLUGIN_SCREEN.test(String(slug || ""));
