// Existing screens, inside his app frame.
//
// /projects/:tool and /time-management are mature screens — ProjectsGeneric is
// nearly 6,000 lines — and rebuilding them in his design is a project rather
// than a screen. This puts them behind his rail so the signed-in app stops
// changing its navigation halfway through a session, without touching a line
// of what they do.
//
// It is a wrapper, not a port. The content inside is still ours: Tailwind, our
// components, our behaviour. What changes is the frame around it, which is the
// part somebody notices when they click "Projects" in the rail and land
// somewhere that looks like a different product.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";

/**
 * @param {object} props
 * @param {React.ComponentType} props.screen  the existing page component
 * @param {string} props.title                for his top bar
 * @param {string} props.page                 his page name, so the rail marks
 *                                            the right item as current
 */
export default function WorkShellRoute({ screen: Screen, title, page }) {
  return (
    <DsAppShell title={title} page={page}>
      {/* His .dsh-in is the content gutter every other app screen sits in.
          Without it the wrapped page runs edge to edge against the rail. */}
      <div className="dsh-in">
        <Screen />
      </div>
    </DsAppShell>
  );
}
