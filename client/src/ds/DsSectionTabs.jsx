// Top tabs for the current section (R03).
//
// Everything in the rail was reachable only through the rail, which is a
// drawer on phones and tablets. The screen now shows its own section's
// destinations as tabs across the top, in Richard's .wk-tabs segmented
// control, drawn from the same ds/railConfig.js the rail uses, so the two can
// never disagree. The rail keeps everything; the tabs are the at-a-glance copy.

import React from "react";
import { useNavigate } from "react-router-dom";
import { RAIL } from "./railConfig.js";
import { sectionTabs } from "../lib/railActive.js";

function hrefOf(item) {
  return item.query ? `${item.to}?${new URLSearchParams(item.query)}` : item.to;
}

export default function DsSectionTabs({ activeId, owned = null, rail = RAIL }) {
  const navigate = useNavigate();
  const tabs = sectionTabs(rail, activeId, owned);
  if (tabs.length < 2) return null;
  return (
    <nav className="dsh-sectabs" aria-label="This section">
      <div className="wk-tabs">
        {tabs.map((it) => (
          <button
            key={it.id}
            type="button"
            className={it.id === activeId ? "on" : undefined}
            aria-current={it.id === activeId ? "page" : undefined}
            onClick={() => navigate(hrefOf(it))}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
