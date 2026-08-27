// A lazily-loaded screen that says what actually went wrong.
//
// Every Manage and Work route was `<Suspense fallback={null}>`. A null fallback
// is a blank page while a chunk is pending, and blank FOREVER if the import
// rejects, because a rejected lazy import with no boundary beneath it renders
// nothing and only logs to the console.
//
// The first version of this fixed the blankness but introduced a worse
// problem: it reported every failure as "the app was updated, reload". A
// boundary catches render errors as well as import errors, so a genuine bug in
// the screen was being described as a stale chunk — which sent both of us
// looking at caches for an hour while the real error sat in the console.
//
// So it now distinguishes them. A failed dynamic import says reload, because
// that is the fix. Anything else is a fault in the screen and says so, with
// the message, because a boundary that hides the error is worse than no
// boundary at all.

import React from "react";

// What a browser says when a chunk is missing. Wording differs per engine,
// which is why this matches loosely rather than on one string.
const CHUNK_FAILURE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Failed to fetch/i;

class ScreenBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[LazyScreen] screen failed:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = String(error?.message || error || "");
    const isChunk = CHUNK_FAILURE.test(message);

    return (
      <div className="dsh-in">
        {isChunk ? (
          <>
            <p className="sub">
              This screen could not be downloaded. That usually means the app was updated while
              this tab was open, and reloading picks up the new version.
            </p>
            <button
              type="button"
              className="ds-btn btn-p ds-btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </>
        ) : (
          <>
            <p className="sub">
              This screen hit an error while rendering. That is a fault in the page rather than
              anything you did, and reloading will not clear it.
            </p>
            <pre
              style={{
                margin: "0 0 16px",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--line-2)",
                background: "var(--bg-inset)",
                color: "var(--ink-2)",
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                overflowX: "auto",
              }}
            >
              {message || "No message was attached to the error."}
            </pre>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  }
}

export default function LazyScreen({ children }) {
  return (
    <ScreenBoundary>
      <React.Suspense
        fallback={
          <div className="dsh-in">
            <p className="sub">Loading…</p>
          </div>
        }
      >
        {children}
      </React.Suspense>
    </ScreenBoundary>
  );
}
