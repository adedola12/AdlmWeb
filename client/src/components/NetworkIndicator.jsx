// src/components/NetworkIndicator.jsx
// Header widget: four bars for the round trip to ADLM Cloud, a short label,
// and the detail in the tooltip. Same shape and thresholds as the indicator
// in HERON, QUIV, RateGen, the MEP plugin and the Installer Hub.
import React from "react";
import { useNetworkQuality, describeNetwork } from "../hooks/useNetworkQuality.js";
import "../styles/network-indicator.css";

const HEIGHTS = [5, 8, 11, 14];

/**
 * @param {object} props
 * @param {boolean} [props.showLabel=true]  hide the word where the bar is short on room
 * @param {string}  [props.className]
 */
export default function NetworkIndicator({ showLabel = true, className = "" }) {
  const q = useNetworkQuality();
  const tone =
    q.status === "unreachable"
      ? "unreachable"
      : q.status === "offline"
        ? "offline"
        : q.level;
  const bars = q.status === "unreachable" ? 1 : q.bars;

  return (
    <button
      type="button"
      className={`net-ind net-ind--${tone} ${className}`.trim()}
      title={describeNetwork(q)}
      aria-label={`Network: ${q.label}`}
      aria-live="polite"
      onClick={q.recheck}
    >
      <svg viewBox="0 0 17 14" width="17" height="14" aria-hidden="true">
        {HEIGHTS.map((h, i) => (
          <rect
            key={i}
            x={i * 4.7}
            y={14 - h}
            width="3"
            height={h}
            rx="1"
            className={i < bars ? "lit" : "unlit"}
          />
        ))}
        {q.status === "offline" && (
          <line x1="1" y1="13" x2="16" y2="1" className="slash" strokeLinecap="round" />
        )}
      </svg>
      {showLabel && <span className="net-ind-label">{q.label}</span>}
    </button>
  );
}
