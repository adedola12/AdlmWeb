import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FaExclamationTriangle, FaSpinner, FaUserPlus } from "../components/icons.jsx";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

function normTool(t) {
  return String(t || "").trim().toLowerCase();
}

// Landing page for a share LINK / QR code (/j/:code). It simply redeems the
// code against the same POST /projects/claim endpoint the manual "Add shared
// project" flow uses, then forwards into the project. Unauthenticated users are
// bounced through /login?next=... by ProtectedRoute and land back here after
// signing in, so the link works from a cold open.
export default function JoinProject() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [state, setState] = React.useState("joining"); // joining | upsell | error
  const [err, setErr] = React.useState("");
  const [upsell, setUpsell] = React.useState(null);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return; // claim once, even under StrictMode double-mount
    ranRef.current = true;
    (async () => {
      try {
        const data = await apiAuthed("/projects/claim", {
          token: accessToken,
          method: "POST",
          body: { code },
        });
        const pk = normTool(data?.productKey || "");
        const projKey = data?.slug || data?.projectId || "";
        navigate(`/projects/${pk}?project=${encodeURIComponent(projKey)}`, {
          replace: true,
        });
      } catch (e) {
        if (e?.status === 403 && e?.data?.requiredProductKey) {
          setUpsell({
            requiredProductKey: e.data.requiredProductKey,
            productName: e.data.productName || e.data.requiredProductKey,
          });
          setErr(e?.data?.error || "");
          setState("upsell");
        } else {
          setErr(
            e?.data?.error ||
              e?.message ||
              "This share link is invalid or has expired.",
          );
          setState("error");
        }
      }
    })();
  }, [code, accessToken, navigate]);

  // One centred card in his panel: a status tile, his heading and note, and
  // ds-btn actions. The tile takes his palette for the state it reports.
  const tile = (pal) => ({
    width: 52,
    height: 52,
    margin: "0 auto 16px",
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    border: `1px solid var(--pal-${pal}-line)`,
  });
  const title = { margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-.02em", color: "var(--ink)" };
  const note = { margin: "8px 0 0", fontSize: 14, fontWeight: 300, color: "var(--ink-3)" };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: "24px 0" }}>
      <section
        className="wk-panel"
        style={{ marginBottom: 0, width: "min(460px, 100%)", padding: "32px 28px", textAlign: "center" }}
        aria-live="polite"
      >
        {state === "joining" ? (
          <>
            <div style={tile("light")}>
              <FaSpinner size={22} className="animate-spin" />
            </div>
            <h1 style={title}>Joining project…</h1>
            <p style={note}>Redeeming your share code.</p>
          </>
        ) : null}

        {state === "upsell" ? (
          <>
            <div style={tile("orange")}>
              <FaUserPlus size={22} />
            </div>
            <h1 style={title}>Subscription required</h1>
            <p style={note}>
              {err ||
                `You need an active ${upsell?.productName} subscription to open this shared project.`}
            </p>
            <div className="wk-acts" style={{ justifyContent: "center", marginTop: 22 }}>
              <Link to={`/product/${upsell?.requiredProductKey}`} className="ds-btn ds-btn-sm btn-p">
                Get {upsell?.productName}
              </Link>
              <Link to="/manage" className="ds-btn ds-btn-sm btn-o">
                Go to dashboard
              </Link>
            </div>
          </>
        ) : null}

        {state === "error" ? (
          <>
            <div style={tile("orange")}>
              <FaExclamationTriangle size={22} />
            </div>
            <h1 style={title}>Couldn&apos;t join</h1>
            <p style={note}>{err}</p>
            <div className="wk-acts" style={{ justifyContent: "center", marginTop: 22 }}>
              <Link to="/manage" className="ds-btn ds-btn-sm btn-o">
                Go to dashboard
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
