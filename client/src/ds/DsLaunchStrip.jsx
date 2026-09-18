// The launch countdown, as a strip across the top of every public page (R20).
//
// Built from Richard's Beyond BIM countdown (#bb-count: days, hours, minutes,
// seconds in small tiles) on his tokens, in a strip of its own because his
// design has no site-wide bar. It sits above the fixed nav and pushes it down
// by publishing its height as --launch-strip-h, which both navs read.
//
// Renders nothing until config/launch.js has a date, and takes itself down
// the second the date passes. A visitor can close it for the session.

import React from "react";
import { Link } from "react-router-dom";
import { LAUNCH } from "../config/launch.js";

const KEY = "adlm-launch-strip-closed";

function left(at, now) {
  const ms = new Date(at).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}

const two = (n) => String(n).padStart(2, "0");

export default function DsLaunchStrip({ launch = LAUNCH }) {
  const [now, setNow] = React.useState(() => Date.now());
  const [closed, setClosed] = React.useState(() => {
    try {
      return sessionStorage.getItem(KEY) === launch.at;
    } catch {
      return false;
    }
  });
  const ref = React.useRef(null);
  const t = launch.at && !closed ? left(launch.at, now) : null;

  React.useEffect(() => {
    if (!launch.at || closed) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [launch.at, closed]);

  // Tell both navs how far down to sit, and put it back when the strip goes.
  const on = !!t;
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!on || !el) {
      root.style.removeProperty("--launch-strip-h");
      return undefined;
    }
    const set = () => root.style.setProperty("--launch-strip-h", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--launch-strip-h");
    };
  }, [on]);

  if (!t) return null;
  return (
    <div className="ds" style={{ display: "contents" }}>
      <div className="launch-strip" ref={ref} role="region" aria-label="Launch countdown">
        <span className="lab">{launch.label}</span>
        <span className="launch-count" aria-live="off">
          {[
            [t.d, "Days"],
            [two(t.h), "Hrs"],
            [two(t.m), "Min"],
            [two(t.s), "Sec"],
          ].map(([n, u]) => (
            <span className="u" key={u}>
              <b>{n}</b>
              <span>{u}</span>
            </span>
          ))}
        </span>
        {launch.cta?.to ? (
          <Link className="go" to={launch.cta.to}>
            {launch.cta.label}
          </Link>
        ) : null}
        <button
          type="button"
          className="x"
          aria-label="Close the countdown"
          onClick={() => {
            try {
              sessionStorage.setItem(KEY, launch.at);
            } catch {
              /* private window: closes for this page only */
            }
            setClosed(true);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
