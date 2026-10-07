// What chrome a staged redesign page gets, at /preview/<slug>.
//
// Its own module rather than constants inside DsPreview.jsx, because a file
// that exports both a component and a helper loses fast refresh (and eslint
// says so). Both answers come from his build, site/build.js:
//
//   * A page with "nochrome": true in its meta block is emitted with no nav,
//     no footer and no promo band. Today that is his 32 admin-* screens, which
//     carry their own .adm-rail; plugin-quiv and plugin-heron, which picture
//     QUIV docked in Revit and HERON beside PlanSwift; and, since 22 Sep 2026,
//     the Installer Hub and the four product splash screens, which are Windows
//     applications rather than web pages. A marketing nav around a Revit
//     ribbon, or around an installer running on someone's PC, is simply wrong.
//   * adaFor() leaves the floating Ada off dash-, work-, doc-, admin- and,
//     since 17 Sep 2026, plugin- pages. On 22 Sep he widened that to every
//     chromeless page, in his words because "an installer running on a QS's PC
//     is not a website".
//
// `hub` is anchored rather than prefixed: it is one page, and "hub-something"
// later would be a different thing that has to say so for itself.

const BARE_SCREEN = /^(admin-|plugin-|splash-|hub$)/;

// The screens that picture software running on Windows: the two plugin
// references, the four splash screens, and the Installer Hub.
const DESKTOP_SCREEN = /^(plugin-|splash-|hub$)/;

/** Does this staged page render with no shell of ours around it? */
export const isBareScreen = (slug) => BARE_SCREEN.test(String(slug || ""));

/** Is this staged page a design for a Windows product rather than a web page? */
const isDesktopScreen = (slug) => DESKTOP_SCREEN.test(String(slug || ""));

/**
 * Does this staged page get our floating Ada?
 *
 * We keep her on the preview dash- and work- screens although his adaFor()
 * would not: Ada is ours, not his — Claude-backed through /agent/chat rather
 * than keyword matching over published copy — and a reviewer walking the
 * staged app screens should be able to open her.
 *
 * The desktop references are the exception. They picture a panel docked inside
 * Revit, a window beside PlanSwift, an installer, or a splash screen — none of
 * which a floating web chat button has anything to float over, and putting one
 * there only suggests the desktop products ship one. They do not.
 */
export const hasFloatingAda = (slug) => !isDesktopScreen(slug);
