// Page shell for the ported design system.
//
// Mirrors what his build.js assembles per page — icon sprite, nav, body, promo
// band, footer — except the chrome is components rather than string slices, so
// it still cannot drift between pages.
//
// The single `.ds` wrapper is what activates the ported stylesheet. Without it
// none of ds.css applies, which is precisely what keeps un-ported pages safe.

import React from "react";
import DsSprite from "./chrome/DsSprite.jsx";
import DsNav from "./chrome/DsNav.jsx";
import DsFooter from "./chrome/DsFooter.jsx";
import { useDsBehaviours } from "./useDsBehaviours.js";
import WaitlistForm from "./WaitlistForm.jsx";
import { useTheme } from "../theme.jsx";

/**
 * @param {object}  props
 * @param {React.ReactNode} props.children  the page body
 *
 * The promo band is NOT rendered here. It belongs immediately above each
 * page's closing CTA — it is the "Latest from ADLM" section — so the generator
 * injects it into the page body at that point, exactly as his build.js does.
 * Rendering it here instead put it after the CTA and reordered the page.
 */
export default function DsShell({ children, mapHref }) {
  const ref = React.useRef(null);
  // His nav carries a #tt theme button that writes its own data-theme
  // attribute and localStorage key. Handing it ThemeProvider's toggle keeps
  // one theme system rather than two fighting over <html>.
  const { toggle } = useTheme();
  useDsBehaviours(ref, { toggleTheme: toggle, mapHref });

  return (
    <div className="ds" ref={ref}>
      <DsSprite />
      <DsNav />
      {/* Every form in his markup is `action="thanks" method="get"` and sends
          nothing anywhere. Wiring it here rather than per page means each
          ported form is live the moment its page is staged, and the wrapper
          only acts on the topics it knows, anything else is left alone. */}
      <WaitlistForm>{children}</WaitlistForm>
      <DsFooter />
    </div>
  );
}
