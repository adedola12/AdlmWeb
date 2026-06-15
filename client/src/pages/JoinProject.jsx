import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FaSpinner, FaExclamationTriangle, FaUserPlus } from "react-icons/fa";
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

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      {state === "joining" ? (
        <>
          <FaSpinner className="mb-4 animate-spin text-3xl text-adlm-blue-700" />
          <div className="text-lg font-semibold text-slate-800 dark:text-white">
            Joining project…
          </div>
          <div className="mt-1 text-sm text-slate-500 dark:text-adlm-dark-muted">
            Redeeming your share code.
          </div>
        </>
      ) : null}

      {state === "upsell" ? (
        <>
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
            <FaUserPlus className="text-xl" />
          </div>
          <div className="text-lg font-semibold text-slate-800 dark:text-white">
            Subscription required
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-adlm-dark-muted">
            {err ||
              `You need an active ${upsell?.productName} subscription to open this shared project.`}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Link
              to={`/product/${upsell?.requiredProductKey}`}
              className="btn-3d rounded-lg px-4 py-2 text-sm font-bold text-white"
            >
              Get {upsell?.productName}
            </Link>
            <Link
              to="/dashboard"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-adlm-dark-border dark:text-adlm-dark-text"
            >
              Go to dashboard
            </Link>
          </div>
        </>
      ) : null}

      {state === "error" ? (
        <>
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-orange-100 text-orange-700">
            <FaExclamationTriangle className="text-xl" />
          </div>
          <div className="text-lg font-semibold text-slate-800 dark:text-white">
            Couldn't join
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-adlm-dark-muted">
            {err}
          </p>
          <Link
            to="/dashboard"
            className="mt-5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-adlm-dark-border dark:text-adlm-dark-text"
          >
            Go to dashboard
          </Link>
        </>
      ) : null}
    </div>
  );
}
