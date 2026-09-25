// His splash sheet (assets/css/splash.css, 22 Sep), for the staged
// /preview/splash-* references and the rebuilt HERON plugin page, which now
// loads it too. A component rather than an import inside the generated pages,
// for the same reason as DsBeyondBimStyles: the porter owns those files.
import "../styles/ds-splash.css";

export default function DsSplashStyles() {
  return null;
}
