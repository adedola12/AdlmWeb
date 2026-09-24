// Guards UI whose first paint depends on something the server cannot know.
//
// THE PROBLEM IT SOLVES
// The server renders every page logged out — it has no localStorage and no
// session. The browser reads localStorage during its very first render, so on a
// server-rendered page a signed-in visitor would produce different markup than
// the HTML being hydrated. React resolves that mismatch by throwing away the
// server DOM for that subtree, which is both a visible flash and the exact
// class of bug that is miserable to reproduce.
//
// The fix is to make the browser's FIRST render agree with the server, then
// switch to the real state in an effect one tick later.
//
// WHY THE INITIAL VALUE IS CONDITIONAL
// Pages that were not server-rendered have nothing to match, so they start
// hydrated and never flash. Only the marketing routes pay the one-frame cost,
// and only for the parts of the UI that actually depend on session state.
import React from "react";

const wasServerRendered =
  typeof window !== "undefined" && window.__ADLM_SSR__ === true;

export function useHydrated() {
  const [hydrated, setHydrated] = React.useState(!wasServerRendered);

  React.useEffect(() => {
    if (!hydrated) setHydrated(true);
  }, [hydrated]);

  return hydrated;
}

export default useHydrated;
