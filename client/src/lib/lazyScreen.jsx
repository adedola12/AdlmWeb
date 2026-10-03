// A screen that declares its own lazy loading, instead of the route doing it.
//
// `React.lazy` + `<LazyScreen>` around the route element is the older shape,
// and is still what the Manage and Work routes use: there the wrapper sits
// inside a gate that is doing other work anyway. It does not scale to the
// admin section, which is seventy routes already two wrappers deep — seventy
// chances to nest a tag wrong for no change in behaviour.
//
// With this the route keeps the shape it already has,
// `<AdminRoute><Thing /></AdminRoute>`, and the boundary and the "Loading…"
// fallback travel with the screen. Props pass straight through, so it also
// works for a screen handed to something else as a prop, which is how
// WorkShellRoute takes one.
//
// What it is NOT for: a screen already rendered inside a `<LazyScreen>`. That
// would nest a boundary in a boundary. Use `React.lazy` directly there.

import React from "react";
import LazyScreen from "../components/LazyScreen.jsx";

export default function lazyScreen(loader) {
  const Inner = React.lazy(loader);
  function Screen(props) {
    return (
      <LazyScreen>
        <Inner {...props} />
      </LazyScreen>
    );
  }
  Screen.displayName = "LazyScreen(pending)";
  return Screen;
}
