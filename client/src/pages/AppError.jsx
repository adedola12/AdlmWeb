// src/pages/AppError.jsx
import React from "react";
import {
  Link,
  isRouteErrorResponse,
  useLocation,
  useRouteError,
} from "react-router-dom";

function getFriendlyMessage(err) {
  // React Router "response" errors (404/401/etc)
  if (isRouteErrorResponse(err)) {
    if (err.status === 404) return "We couldn’t find that page.";
    if (err.status === 401) return "You need to sign in to view this page.";
    if (err.status === 403)
      return "You don’t have permission to view this page.";
    return "Something went wrong while loading this page.";
  }

  // Normal JS errors
  const msg = err?.message || "";
  if (/network/i.test(msg))
    return "Network error. Please check your connection.";
  return "Something went wrong. Please try again.";
}

export default function AppError() {
  const err = useRouteError();
  const loc = useLocation();

  const title = "Unexpected error";
  const friendly = getFriendlyMessage(err);

  // Keep details only for dev/debug; safe to show in production too
  const details = (() => {
    if (isRouteErrorResponse(err)) {
      return `${err.status} ${err.statusText || ""}`.trim();
    }
    return err?.message || String(err || "");
  })();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white ring-1 ring-black/5 shadow-sm p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 p-3">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 9v4" strokeLinecap="round" />
              <path d="M12 17h.01" strokeLinecap="round" />
              <path
                d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-slate-600">{friendly}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Try again
              </button>

              <Link
                to="/"
                className="px-4 py-2 rounded-lg ring-1 ring-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                Go home
              </Link>

              <Link
                to="/products"
                className="px-4 py-2 rounded-lg ring-1 ring-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                View products
              </Link>

              <Link
                to="/support"
                className="px-4 py-2 rounded-lg ring-1 ring-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                Contact support
              </Link>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Path: <span className="font-mono">{loc.pathname}</span>
            </div>

            {/* Debug details (collapsed) */}
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-slate-600 hover:text-slate-900">
                Technical details
              </summary>
              <pre className="mt-2 text-xs bg-slate-50 rounded-lg p-3 overflow-auto ring-1 ring-black/5 whitespace-pre-wrap">
                {details}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
