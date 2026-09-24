// "Coming soon", in Richard's section pieces (R21): his .sec-head with an
// eyebrow, a headline with his .tone accent, a lede and two buttons. Shown on
// a flagged route while its flag is off (config/flags.js).

import React from "react";
import { Link } from "react-router-dom";

export default function DsComingSoon({ eyebrow, title, tone, lede, primary, secondary }) {
  React.useEffect(() => {
    const was = document.title;
    document.title = `${title} | ADLM Studio`;
    return () => {
      document.title = was;
    };
  }, [title]);

  return (
    <section className="sec" style={{ paddingTop: 160, minHeight: "70vh" }}>
      <div className="shell">
        <div className="sec-head mid">
          <span className="eyebrow">{eyebrow || "Coming soon"}</span>
          <h2>
            {title} {tone ? <span className="tone">{tone}</span> : null}
          </h2>
          {lede ? <p className="ds-lede">{lede}</p> : null}
          <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
            {primary ? (
              <Link className="ds-btn btn-p" to={primary.to}>
                {primary.label}
              </Link>
            ) : null}
            {secondary ? (
              <Link className="ds-btn btn-o" to={secondary.to}>
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
