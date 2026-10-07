// preview.adlmstudio.net (and any other non-production host serving this
// branch) is for ADLM staff only.
//
// The branch build is the unfinished new site. On the live hosts
// (adlmstudio.net, www.adlmstudio.net) and on localhost this gate does
// nothing, so it is safe to carry through go-live. Anywhere else, a visitor
// sees only the sign-in screens until they sign in with a staff role (admin,
// Design Access, mini-admin, or Tech Support, which holds only the "preview"
// area); a signed-in customer is told the preview is staff-only.
//
// Like DsPreviewGate it is a courtesy gate: the bundle is still downloadable.
// Customer data stays protected by the API, which checks every request.

import React from "react";
import { useAuth } from "../store.jsx";
import { canViewPreview } from "../utils/roles.js";
import { isGatedHost, isOpenPath } from "../lib/previewHost.js";

function Wall({ title, children }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        fontFamily: "Lexend, system-ui, sans-serif",
        background: "#070B14",
        color: "#E8EEF7",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#40B0E0" }}>
          ADLM Studio preview
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: 26, fontWeight: 500 }}>{title}</h1>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: "#9FB0C8" }}>{children}</div>
      </div>
    </div>
  );
}

const linkStyle = { color: "#40B0E0" };

export default function PreviewHostGate({ router, children }) {
  const { user, accessToken, clear } = useAuth();
  const gated = typeof window !== "undefined" && isGatedHost(window.location.hostname);
  const [path, setPath] = React.useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  React.useEffect(() => {
    if (!gated || !router) return undefined;
    return router.subscribe((state) => setPath(state.location.pathname));
  }, [gated, router]);

  if (!gated) return children;
  // AuthProvider withholds `user` for one frame while hydrating; wait.
  if (accessToken && !user) return null;
  if (user && canViewPreview(user)) return children;

  if (user) {
    return (
      <Wall title="This preview is for ADLM staff">
        <p>
          You are signed in as {user.email}, which has no access to the preview. The live site is at{" "}
          <a href="https://www.adlmstudio.net" style={linkStyle}>adlmstudio.net</a>.
        </p>
        <p>
          <a
            href="/login"
            style={linkStyle}
            onClick={() => {
              try {
                clear?.();
              } catch {
                /* signing out must not throw */
              }
            }}
          >
            Sign in with another account
          </a>
        </p>
      </Wall>
    );
  }

  if (isOpenPath(path)) return children;

  const next = encodeURIComponent(path + (typeof window !== "undefined" ? window.location.search : ""));
  return (
    <Wall title="Staff preview">
      <p>This is the next version of the ADLM Studio website, open to the ADLM team only.</p>
      <p>
        <a href={`/login?next=${next}`} style={linkStyle}>Sign in with your staff account</a>
        {" · "}
        <a href="https://www.adlmstudio.net" style={linkStyle}>Go to adlmstudio.net</a>
      </p>
    </Wall>
  );
}
