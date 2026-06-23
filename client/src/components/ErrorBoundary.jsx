import React from "react";

/**
 * Top-level render error boundary.
 *
 * React Router's `errorElement` (AppError.jsx) only catches data-layer
 * (loader/action) errors — it does NOT catch exceptions thrown during render.
 * Before this, any render-time crash in a page (a bad `.map`, an undefined
 * access in one of the large workspace components) produced a blank white
 * screen for the user. This boundary catches those so the user sees a
 * recoverable fallback while the Nav/Footer shell stays intact.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface to the console for now; wire to Sentry/monitoring later.
    console.error("[ErrorBoundary] render crash:", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto max-w-lg my-16 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 text-center shadow-sm">
        <div className="text-4xl mb-3" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-adlm-dark-text">
          Something went wrong on this page
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          The rest of the app is fine. You can reload this page or head back
          home. If it keeps happening, please contact support.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={this.handleReload} className="btn">
            Reload page
          </button>
          <a
            href="/"
            className="btn bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-adlm-dark-text"
          >
            Go home
          </a>
        </div>
      </div>
    );
  }
}
