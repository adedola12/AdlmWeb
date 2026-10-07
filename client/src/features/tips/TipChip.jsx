// One live tip, as a dismissible note above a work-project tab.
//
// The rules are in tipsModel.js; this only picks the first one for this tab
// that has not been dismissed on this project, and draws it in his .pj-note
// (styles/ds-work-proj.css) — the same box the shell already uses for "Shared
// with you" — so it reads as part of the page rather than an advert on it.
//
// One tip at a time, on purpose. A strip of five is a to-do list nobody asked
// for; the next one shows when this one is dealt with or dismissed.
//
// Actions:
//   kind "ada"  opens Ada with the prompt in the box (not sent)
//   kind "tab"  moves to that tab through the shell's own onGo
//
// No model call happens here. Ever: this renders on every visit.

import React from "react";
import { FaMagic, FaTimes } from "../../components/icons.jsx";
import { projectTips, firstOpenTip, dismissTip } from "./tipsModel.js";
import { openAda } from "../ada/adaCardsModel.js";

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Reading the property itself throws when site data is blocked.
    return null;
  }
}

export default function TipChip({ project, tab = "", canEdit = true, onGo, tips: given }) {
  const projectId = String(project?._id || project?.id || "");
  // Dismissed in this visit. Covers a browser that refuses storage: the tip
  // still goes away now, it just comes back next visit.
  const [hidden, setHidden] = React.useState(() => new Set());

  const tips = React.useMemo(
    () => (Array.isArray(given) ? given : projectTips(project, { tab, canEdit })),
    [given, project, tab, canEdit],
  );
  const tip = firstOpenTip(
    tips.filter((t) => !hidden.has(t.id)),
    storage(),
    projectId,
  );
  if (!tip) return null;

  const act = () => {
    if (tip.action?.kind === "ada") openAda(tip.action.prompt);
    else if (tip.action?.kind === "tab" && tip.action.tab) onGo?.(tip.action.tab);
  };

  return (
    <div className={`pj-note${tip.tone === "warn" ? " warn" : ""}`} role="note" aria-label="Tip">
      <FaMagic />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{tip.title}.</b> {tip.body}{" "}
        {tip.action ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              act();
            }}
          >
            {tip.action.label}
          </a>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss this tip"
        title="Dismiss"
        onClick={() => {
          dismissTip(storage(), projectId, tip.id);
          setHidden((h) => new Set(h).add(tip.id));
        }}
        style={{
          flex: "none",
          background: "none",
          border: 0,
          padding: 2,
          cursor: "pointer",
          color: "var(--ink-3)",
          lineHeight: 0,
        }}
      >
        <FaTimes />
      </button>
    </div>
  );
}
