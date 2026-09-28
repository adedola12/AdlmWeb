// Opening and closing his side panel, and holding it open long enough to be
// seen leaving.
//
// Separate from WorkProjectPanel.jsx only because a file that exports a
// component may export nothing else — react-refresh/only-export-components.

import React from "react";

// His transition length (ds-work-proj.css:296). Unmounting before it finishes
// makes the panel vanish instead of sliding away.
export const PANEL_EXIT_MS = 220;

/**
 * One panel, opened with whatever it should show.
 *
 * His closePanel() removes `.on`, waits 220ms, then removes the node. In React
 * the node goes the moment the caller stops rendering it, so the exit would
 * never be seen. This keeps the content mounted for that long with `visible`
 * false, so the slide-out he designed actually happens.
 *
 * Returns:
 *   content  what to render, or null when nothing is open
 *   visible  pass to the panel; false while it slides away
 *   show(x)  open with x (anything truthy)
 *   close()  start the slide-out
 */
export function useProjectPanel() {
  const [content, setContent] = React.useState(null);
  const [visible, setVisible] = React.useState(false);
  const timer = React.useRef(0);

  const show = React.useCallback((next) => {
    window.clearTimeout(timer.current);
    if (!next) return;
    setContent(next);
    setVisible(true);
  }, []);

  const close = React.useCallback(() => {
    window.clearTimeout(timer.current);
    setVisible(false);
    timer.current = window.setTimeout(() => setContent(null), PANEL_EXIT_MS);
  }, []);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return { content, visible, show, close };
}
