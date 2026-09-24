// Makes the ported marketing forms actually submit.
//
// His forms are `action="thanks" method="get"` — they render, they navigate to
// a thank-you page, and they send nothing anywhere. Rather than re-authoring
// the markup (his design, his fields, his classes), this wraps the page and
// intercepts the submit event as it bubbles, posts the fields to /waitlist,
// and replaces the form with a confirmation.
//
// Wrapping rather than editing means his form keeps working exactly as he
// designed it, and re-porting his page cannot undo the wiring.
//
// WHERE THE MESSAGE GOES
// The confirmation is portalled into the form's own container, not rendered at
// the end of the wrapper. Rendering it as a sibling of the page put it after
// every section — a visitor on the solutions pages submitted, saw nothing, and
// had to scroll past the closing CTA to find out whether it had worked.

import React from "react";
import { createPortal } from "react-dom";
import { API_BASE } from "../config.js";

// Only these forms are wired. Anything else keeps its original behaviour, so a
// form he adds later fails visibly rather than silently posting somewhere odd.
const KNOWN_TOPICS = new Set([
  // His own hidden `topic` values, taken verbatim from the forms — see
  // `grep 'name="topic"' src/*.html` in his repo. Using his labels rather than
  // invented ones means the markup needs no edit and the admin list reads the
  // same words the page does.
  "CIVIQ waitlist",
  "Firms & consultancies",
  "Individual QS",
  "Students & early career",
  "Institutions",
]);

export default function WaitlistForm({ children }) {
  const [state, setState] = React.useState({ status: "idle", message: "" });
  // The container the confirmation is portalled into — the form's own parent,
  // so the message appears exactly where the form was.
  const [host, setHost] = React.useState(null);
  const formRef = React.useRef(null);

  const onSubmit = React.useCallback(
    async (e) => {
      const form = e.target.closest?.("form");
      if (!form) return;

      const data = new FormData(form);
      const topic = String(data.get("topic") || "").trim();
      // Not one of ours — let the browser do whatever his markup says.
      if (!KNOWN_TOPICS.has(topic)) return;

      e.preventDefault();
      if (state.status === "sending") return;

      formRef.current = form;
      setHost(form.parentElement);
      setState({ status: "sending", message: "" });

      const payload = {
        topic,
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        org: String(data.get("org") || "").trim(),
        civil3d: String(data.get("civil3d") || "").trim(),
        message: String(data.get("message") || "").trim(),
        sourcePath: window.location.pathname,
      };

      try {
        const res = await fetch(`${API_BASE}/waitlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) {
          throw new Error(out.error || "That did not go through.");
        }
        setState({ status: "done", message: out.message || "You're on the list." });
        // Hide the fields but keep the card, so the confirmation lands where
        // the form was rather than the page jumping.
        form.style.display = "none";
      } catch (err) {
        setState({
          status: "error",
          message:
            err instanceof TypeError
              ? "Could not reach the server. Please check your connection and try again."
              : String(err.message || err),
        });
      }
    },
    [state.status],
  );

  const status =
    state.status === "idle" || !host ? null : (
      <div
        className="sform-status"
        role="status"
        aria-live="polite"
        style={{
          marginTop: state.status === "done" ? 0 : "14px",
          padding: "18px 22px",
          borderRadius: "14px",
          border: "1px solid var(--line)",
          background: "var(--bg-alt)",
          textAlign: "center",
        }}
      >
        {state.status === "sending" && <p>Sending…</p>}
        {state.status === "done" && (
          <>
            <h4 style={{ marginBottom: "6px" }}>Thank you</h4>
            <p>{state.message}</p>
          </>
        )}
        {state.status === "error" && (
          <>
            <h4 style={{ marginBottom: "6px" }}>That didn&apos;t send</h4>
            <p style={{ marginBottom: "14px" }}>{state.message}</p>
            <button
              type="button"
              className="ds-btn btn-o"
              onClick={() => {
                // Put his form back so they can correct and retry in place.
                if (formRef.current) formRef.current.style.display = "";
                setState({ status: "idle", message: "" });
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );

  return (
    <div onSubmit={onSubmit}>
      {children}
      {host ? createPortal(status, host) : null}
    </div>
  );
}
