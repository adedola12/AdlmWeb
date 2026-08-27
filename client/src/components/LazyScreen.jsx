// A lazily-loaded screen that says something when it cannot load.
//
// Every Manage and Work route was `<Suspense fallback={null}>`. A null fallback
// means a BLANK PAGE for as long as the chunk is pending — and forever if the
// import rejects, because a rejected lazy import inside Suspense with no error
// boundary beneath it renders nothing at all and logs to the console.
//
// That is not a hypothetical. A tab left open across a rebuild holds the old
// module graph and asks for a chunk hash that no longer exists on disk; the
// import 404s, and the person sees a white page with no clue that a reload
// would fix it. Which is exactly what happened on /manage/settings.
//
// Two changes: a real fallback so a slow chunk reads as loading, and a boundary
// that catches the failure and offers the reload that actually fixes it.

import React from "react";

class ChunkBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Worth keeping in the console: the message names the chunk that went
    // missing, which is the difference between "reload" and a real bug.
    console.error("[LazyScreen] a screen failed to load:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="dsh-in">
        <p className="sub">
          This screen could not be loaded. That usually means the app was updated while this
          tab was open, and reloading picks up the new version.
        </p>
        <button
          type="button"
          className="ds-btn btn-p ds-btn-sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}

export default function LazyScreen({ children }) {
  return (
    <ChunkBoundary>
      <React.Suspense
        fallback={
          <div className="dsh-in">
            <p className="sub">Loading…</p>
          </div>
        }
      >
        {children}
      </React.Suspense>
    </ChunkBoundary>
  );
}
