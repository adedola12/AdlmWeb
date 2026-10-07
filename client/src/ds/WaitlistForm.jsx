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

// Forms recognised by their own id instead of a hidden `topic` field.
//
// The Beyond BIM registration page is generated from his markup and must never
// be hand edited, so a hidden input cannot be added to it. Its form had no
// action and no handler either, so pressing "Register for Beyond BIM" simply
// reloaded the page: every registration for a ₦180,000 programme went nowhere,
// and the visitor was given no reason to think otherwise. `id="bb-form"` is
// stable in his markup, so that is the hook.
const FORMS_BY_ID = new Map([["bb-form", "Beyond BIM registration"]]);

// The Beyond BIM form asks fourteen questions and the waitlist row holds
// name / email / org / message. Rather than drop the rest — a phone number and
// a country on a paid registration are the two things whoever works the list
// needs most — they are written into `message` as labelled lines, in the order
// the form asks them. Nothing the visitor typed is lost, and no schema changes.
const BB_DETAIL_FIELDS = [
  ["phone", "Phone"],
  ["country", "Country"],
  ["role", "Role"],
  ["experience", "Experience"],
  ["organisation", "Organisation"],
  ["membership", "NIQS membership"],
  ["revit", "Revit / model experience"],
  ["adlm", "ADLM tools used"],
  ["seats", "Seats"],
  ["heard", "Heard about us via"],
  ["goal", "What they want from it"],
];

function beyondBimMessage(data) {
  const lines = [];
  for (const [field, label] of BB_DETAIL_FIELDS) {
    const v = String(data.get(field) || "").trim();
    if (v) lines.push(`${label}: ${v}`);
  }
  return lines.join("\n");
}

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
      const hiddenTopic = String(data.get("topic") || "").trim();
      const byId = FORMS_BY_ID.get(String(form.id || ""));
      const topic = KNOWN_TOPICS.has(hiddenTopic) ? hiddenTopic : byId;
      // Not one of ours — let the browser do whatever his markup says.
      if (!topic) return;

      e.preventDefault();
      if (state.status === "sending") return;

      formRef.current = form;
      setHost(form.parentElement);
      setState({ status: "sending", message: "" });

      const isBeyondBim = topic === "Beyond BIM registration";
      const payload = {
        topic,
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        // His Beyond BIM field is "organisation"; the solutions forms use "org".
        org: String(data.get("org") || data.get("organisation") || "").trim(),
        civil3d: String(data.get("civil3d") || "").trim(),
        message: isBeyondBim
          ? beyondBimMessage(data)
          : String(data.get("message") || "").trim(),
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
        className={`sform-status ${state.status === "done" ? "done" : ""}`}
        role="status"
        aria-live="polite"
      >
        {state.status === "sending" && <p>Sending…</p>}
        {state.status === "done" && (
          <>
            <h4>Thank you</h4>
            <p>{state.message}</p>
          </>
        )}
        {state.status === "error" && (
          <>
            <h4>That didn&apos;t send</h4>
            <p>{state.message}</p>
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
