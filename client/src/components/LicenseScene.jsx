// Animated persona scene for the Purchase page.
//
// Reacts to the selected license type:
//   • "personal"     → a stylized individual Quantity Surveyor (hard hat + clipboard)
//   • "organization" → a corporate office scene (tower with lit windows + team)
//
// It's a dependency-free, CSS/SVG illustration (not a Three.js model): a 3D
// hover-tilt stage with a cross-fade between the two scenes, idle float, lit
// windows, and a scanning line. All motion is disabled under
// prefers-reduced-motion and the tilt is off on touch devices.
//
// Styling lives in index.css (.license-stage / .license-scene / .license-win …).

import React from "react";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* Window grid for the office tower (lit windows that softly pulse). */
function TowerWindows() {
  const cols = [92, 108, 124];
  const rows = [60, 75, 90, 105, 120, 135];
  const cells = [];
  let i = 0;
  for (const y of rows) {
    for (const x of cols) {
      cells.push(
        <rect
          key={`${x}-${y}`}
          className="license-win"
          x={x}
          y={y}
          width="11"
          height="9"
          rx="1.5"
          fill="#7cc4ff"
          style={{ animationDelay: `${((i++ * 0.27) % 3).toFixed(2)}s` }}
        />,
      );
    }
  }
  return <g>{cells}</g>;
}

const PersonalScene = (
  <svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="110" cy="174" rx="74" ry="13" fill="rgba(35,156,255,0.18)" />
    <g className="lic-float">
      {/* body */}
      <rect x="80" y="98" width="60" height="60" rx="16" fill="#1b3a64" />
      <rect x="86" y="118" width="48" height="5" rx="2.5" fill="#27507f" />
      {/* neck + head */}
      <rect x="103" y="86" width="14" height="12" rx="4" fill="#e9b892" />
      <circle cx="110" cy="76" r="19" fill="#f2c8a8" />
      {/* hard hat */}
      <path d="M88 75a22 22 0 0 1 44 0z" fill="#E86A27" />
      <rect x="84" y="73" width="52" height="6" rx="3" fill="#c2410c" />
      <rect x="106" y="55" width="8" height="11" rx="2" fill="#c2410c" />
      {/* arm + clipboard */}
      <g transform="rotate(-9 78 126)">
        <rect x="56" y="108" width="42" height="32" rx="6" fill="#0f5fd6" />
        <rect x="62" y="114" width="30" height="3" rx="1.5" fill="#cfe3ff" />
        <rect x="62" y="121" width="24" height="3" rx="1.5" fill="#cfe3ff" />
        <rect x="62" y="128" width="28" height="3" rx="1.5" fill="#cfe3ff" />
        <rect x="62" y="135" width="18" height="3" rx="1.5" fill="#9cc6ff" />
      </g>
    </g>
    {/* floating ₦ coin */}
    <g className="lic-float-2">
      <circle cx="170" cy="72" r="16" fill="#E86A27" />
      <circle cx="170" cy="72" r="16" fill="none" stroke="#ffd9bf" strokeWidth="1.5" />
      <text x="170" y="78" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">₦</text>
    </g>
    {/* scanning line */}
    <line className="lic-scan" x1="80" x2="140" y1="96" y2="96" stroke="#36a3ff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const OrgScene = (
  <svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="110" cy="178" rx="92" ry="13" fill="rgba(35,156,255,0.18)" />
    <g className="lic-float">
      {/* left building */}
      <rect x="40" y="100" width="40" height="74" rx="4" fill="#14315a" />
      <rect x="48" y="110" width="9" height="8" rx="1.5" fill="#3f6ea5" />
      <rect x="63" y="110" width="9" height="8" rx="1.5" fill="#3f6ea5" />
      <rect x="48" y="126" width="9" height="8" rx="1.5" fill="#3f6ea5" />
      <rect x="63" y="126" width="9" height="8" rx="1.5" fill="#3f6ea5" />
      {/* right building */}
      <rect x="148" y="88" width="36" height="86" rx="4" fill="#14315a" />
      <rect x="156" y="98" width="8" height="8" rx="1.5" fill="#3f6ea5" />
      <rect x="168" y="98" width="8" height="8" rx="1.5" fill="#3f6ea5" />
      <rect x="156" y="114" width="8" height="8" rx="1.5" fill="#3f6ea5" />
      <rect x="168" y="114" width="8" height="8" rx="1.5" fill="#3f6ea5" />
      {/* main tower */}
      <rect x="84" y="50" width="56" height="124" rx="5" fill="#1d3e6e" />
      <rect x="84" y="50" width="56" height="10" rx="5" fill="#27507f" />
      <rect x="107" y="38" width="10" height="13" rx="2" fill="#E86A27" />
      <TowerWindows />
      {/* door */}
      <rect x="104" y="150" width="16" height="24" rx="2" fill="#0a2342" />
      <rect x="111.5" y="150" width="1.5" height="24" fill="#27507f" />
    </g>
    {/* connected team nodes */}
    <g className="lic-float-2">
      <path d="M70 64 L110 50 L150 64" fill="none" stroke="rgba(124,196,255,0.5)" strokeWidth="1.5" />
      <circle cx="70" cy="64" r="8" fill="#E86A27" />
      <circle cx="110" cy="50" r="9" fill="#36a3ff" />
      <circle cx="150" cy="64" r="8" fill="#E86A27" />
    </g>
  </svg>
);

export default function LicenseScene({ type = "personal", className = "" }) {
  const isOrg = type === "organization";
  const ref = React.useRef(null);
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    const fine =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setEnabled(fine && !prefersReducedMotion());
  }, []);

  function onMove(e) {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = -((e.clientY - r.top) / r.height - 0.5) * 10;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 12;
    el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div className={`license-stage ${className}`}>
      <div
        ref={ref}
        onMouseMove={enabled ? onMove : undefined}
        onMouseLeave={enabled ? reset : undefined}
        className="license-stage__inner"
        role="img"
        aria-label={
          isOrg
            ? "Illustration of a corporate organization"
            : "Illustration of an individual quantity surveyor"
        }
      >
        <div className="license-stage__glow" aria-hidden="true" />
        <div className={`license-scene ${!isOrg ? "is-active" : ""}`} aria-hidden={isOrg}>
          {PersonalScene}
        </div>
        <div className={`license-scene ${isOrg ? "is-active" : ""}`} aria-hidden={!isOrg}>
          {OrgScene}
        </div>
        <div className="license-stage__chip">
          {isOrg ? "Organization plan" : "Personal plan"}
        </div>
      </div>
    </div>
  );
}
