// "Open in QUIV / HERON" (work board r2-open-in-quiv-heron).
//
// Asks the API for a 10-minute, single-use adlm:// link and hands it to the
// browser. The Installer Hub's handler takes it from there. Contract:
// docs/OPEN_IN_DESKTOP.md.
//
// DESIGN: Richard. Functional placeholder built from the existing .wk-dd
// dropdown pieces; the button, the "opening" note and the not-installed
// fallback are his to design.
import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../../http.js";
import { useDismiss } from "../../ds/dismiss.js";

// Bucket key -> the desktop product that opens it. Only these two have an
// entry point; everything else shows no button.
const DESKTOP_PRODUCTS = {
  revit: { label: "QUIV", host: "Revit" },
  planswift: { label: "HERON", host: "PlanSwift" },
};

function desktopProductFor(productKey) {
  return DESKTOP_PRODUCTS[String(productKey || "").toLowerCase()] || null;
}

// Hand a custom-scheme link to the browser without navigating this page away.
function launch(url) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Header buttons sit at the right of the bar, so the note opens leftwards;
// card buttons sit at the left of the card, so it opens rightwards.
const MENU_BASE = { width: 320, maxWidth: "calc(100vw - 32px)", maxHeight: "none", padding: 14 };
const MENU = {
  right: { ...MENU_BASE, left: "auto", right: 0 },
  left: { ...MENU_BASE, left: 0, right: "auto" },
};

export default function OpenInDesktopButton({
  productKey,
  projectId,
  accessToken,
  disabled = false,
  align = "right",
}) {
  const product = desktopProductFor(productKey);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, close, [ref]);

  if (!product || !projectId) return null;

  async function openInDesktop() {
    setBusy(true);
    setError("");
    setOpen(true);
    try {
      const data = await apiAuthed("/projects/open-intent/issue", {
        token: accessToken,
        method: "POST",
        body: { projectId: String(projectId) },
      });
      if (!data?.url || !String(data.url).startsWith("adlm://open?")) {
        throw new Error("Could not prepare the link. Please try again.");
      }
      launch(data.url);
    } catch (e) {
      setError(e?.data?.error || e?.message || "Could not prepare the link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function copyId() {
    navigator?.clipboard
      ?.writeText(String(projectId))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className={`wk-dd${open ? " on" : ""}`} ref={ref}>
      <button
        type="button"
        className="ds-btn ds-btn-sm btn-o"
        disabled={disabled || busy}
        title={`Open this project in ${product.label} on this computer`}
        onClick={openInDesktop}
      >
        {busy ? "Opening…" : `Open in ${product.label}`}
      </button>

      {open && !busy ? (
        <div className="wk-dd-m" style={MENU[align] || MENU.right} role="status">
          {error ? (
            <>
              <b style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
                Could not open in {product.label}
              </b>
              <p className="wk-fx" style={{ margin: "6px 0 0" }}>
                {error}
              </p>
            </>
          ) : (
            <>
              <b style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
                Sent to {product.label}
              </b>
              <p className="wk-fx" style={{ margin: "6px 0 0" }}>
                If your browser asks whether to open ADLM, allow it. {product.label} opens this
                project in {product.host}; sign in there if it asks.
              </p>
              <p className="wk-fx" style={{ margin: "10px 0 0" }}>
                Nothing opened?{" "}
                <Link to="/manage/downloads" onClick={close}>
                  Install or update the ADLM Installer Hub
                </Link>
                , or copy the project ID and use Open from Cloud in {product.label}.
              </p>
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={copyId}>
              <span>{copied ? "Copied" : "Copy project ID"}</span>
            </button>
            <button type="button" onClick={close}>
              <span>Close</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
