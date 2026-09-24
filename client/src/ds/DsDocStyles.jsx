// Loads his doc.css and renders nothing.
//
// Vite needs a static import to code-split a stylesheet, and these three
// sheets are wanted by a handful of screens each — not by the marketing pages
// that make up almost all the traffic. Wrapping each in its own tiny lazy
// module is what lets a screen ask for the sheet it needs without any page
// paying for the ones it does not.
import "../styles/ds-doc.css";

export default function DsDocStyles() {
  return null;
}
