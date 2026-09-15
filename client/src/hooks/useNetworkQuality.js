// src/hooks/useNetworkQuality.js
// Online/offline plus how strong the connection to ADLM Cloud is, as bars.
//
// The bars come from a timed GET of /health on the API, not from
// navigator.connection: the browser's own estimate is coarse ("4g"), missing
// in Safari and Firefox, and says nothing about whether our server is up. The
// same thresholds are compiled into HERON, QUIV, RateGen, the MEP plugin and
// the Installer Hub, so four bars mean the same thing in every ADLM product.
//
// Median of the last three round trips, so a single stalled request cannot
// flip the display. Polling pauses while the tab is hidden.
import React from "react";
import { API_BASE } from "../config.js";

export const THRESHOLDS_MS = { excellent: 300, good: 700, fair: 1500 };
const SAMPLE_WINDOW = 3;
const ONLINE_INTERVAL_MS = 20000;
const OFFLINE_INTERVAL_MS = 10000;
const PROBE_TIMEOUT_MS = 8000;

/** @returns {"offline"|"poor"|"fair"|"good"|"excellent"|"unknown"} */
export function levelFor(hasNetwork, cloudReachable, rttMs) {
  if (!hasNetwork) return "offline";
  if (!cloudReachable) return "poor";
  if (rttMs == null || rttMs < 0) return "unknown";
  if (rttMs <= THRESHOLDS_MS.excellent) return "excellent";
  if (rttMs <= THRESHOLDS_MS.good) return "good";
  if (rttMs <= THRESHOLDS_MS.fair) return "fair";
  return "poor";
}

export const BARS = { unknown: 0, offline: 0, poor: 1, fair: 2, good: 3, excellent: 4 };

export function median(samples) {
  if (!samples || !samples.length) return null;
  const s = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const LABELS = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  offline: "Offline",
  unknown: "Checking",
};

function browserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

// What the browser itself thinks, for the tooltip only. Chrome and Edge fill
// this in; Safari and Firefox do not, and the indicator must not depend on it.
function readConnection() {
  if (typeof navigator === "undefined") return null;
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return null;
  return {
    effectiveType: c.effectiveType || null,
    downlink: typeof c.downlink === "number" ? c.downlink : null,
    rtt: typeof c.rtt === "number" ? c.rtt : null,
  };
}

export function useNetworkQuality() {
  const [state, setState] = React.useState(() => ({
    status: "checking", // checking | online | unreachable | offline
    level: "unknown",
    rttMs: null,
    lastRttMs: null,
    lastChecked: null,
    connection: readConnection(),
  }));
  const samplesRef = React.useRef([]);
  const timerRef = React.useRef(null);
  const aliveRef = React.useRef(true);
  const statusRef = React.useRef("checking");

  const publish = React.useCallback((status, lastRtt) => {
    if (!aliveRef.current) return;
    const reachable = status === "online";
    const rtt = reachable ? median(samplesRef.current) : null;
    statusRef.current = status;
    setState({
      status,
      level: levelFor(status !== "offline", reachable, rtt),
      rttMs: rtt,
      lastRttMs: lastRtt ?? null,
      lastChecked: new Date(),
      connection: readConnection(),
    });
  }, []);

  const probe = React.useCallback(async () => {
    if (!browserOnline()) {
      samplesRef.current = [];
      publish("offline", null);
      return;
    }
    if (!API_BASE) {
      publish("unreachable", null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const t0 = performance.now();
    try {
      // Any HTTP status proves the server answered; only a thrown fetch means
      // unreachable. No credentials: this must never trigger a refresh.
      await fetch(`${API_BASE}/health?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });
      const rtt = performance.now() - t0;
      const next = [...samplesRef.current, rtt];
      samplesRef.current = next.slice(-SAMPLE_WINDOW);
      publish("online", rtt);
    } catch {
      samplesRef.current = [];
      publish(browserOnline() ? "unreachable" : "offline", null);
    } finally {
      clearTimeout(timer);
    }
  }, [publish]);

  React.useEffect(() => {
    aliveRef.current = true;

    const schedule = () => {
      clearTimeout(timerRef.current);
      const delay = statusRef.current === "online" ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS;
      timerRef.current = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      await probe();
      schedule();
    };

    const onOffline = () => {
      samplesRef.current = [];
      publish("offline", null);
    };
    const onOnline = () => {
      // The adapter came back: verify the cloud now rather than waiting out the interval.
      clearTimeout(timerRef.current);
      tick();
    };
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timerRef.current);
        tick();
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    tick();

    return () => {
      aliveRef.current = false;
      clearTimeout(timerRef.current);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [probe, publish]);

  const recheck = React.useCallback(() => {
    clearTimeout(timerRef.current);
    probe().then(() => {
      if (!aliveRef.current) return;
      clearTimeout(timerRef.current);
      const delay = statusRef.current === "online" ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS;
      timerRef.current = setTimeout(() => probe(), delay);
    });
  }, [probe]);

  const bars = BARS[state.level] ?? 0;
  const label =
    state.status === "online"
      ? LABELS[state.level]
      : state.status === "unreachable"
        ? "No server"
        : state.status === "offline"
          ? "Offline"
          : "Checking";

  return { ...state, bars, label, recheck };
}

/** Multi-line tooltip text, shared wording with the desktop products. */
export function describeNetwork(q) {
  const lines = [];
  if (q.status === "online") {
    lines.push(
      q.rttMs != null
        ? `Connected to ADLM Cloud: ${LABELS[q.level]} (${Math.round(q.rttMs)} ms round trip)`
        : "Connected to ADLM Cloud.",
    );
    if (q.level === "poor") lines.push("Saving, syncing and AI features will be slow on this connection.");
    else if (q.level === "fair") lines.push("Usable, but large uploads will take a while.");
  } else if (q.status === "unreachable") {
    lines.push("Internet is up but the ADLM server is not responding. Saving and sign-in may fail.");
  } else if (q.status === "offline") {
    lines.push("No internet connection. Nothing you do here will save until it is back.");
  } else {
    lines.push("Checking the connection to ADLM Cloud...");
  }
  const c = q.connection;
  if (c && (c.effectiveType || c.downlink != null)) {
    const bits = [];
    if (c.effectiveType) bits.push(c.effectiveType.toUpperCase());
    if (c.downlink != null) bits.push(`~${c.downlink} Mbps`);
    lines.push(`Browser estimate: ${bits.join(", ")}`);
  }
  if (q.lastChecked) {
    lines.push(
      `Last checked ${q.lastChecked.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}. Click to re-check.`,
    );
  } else {
    lines.push("Click to re-check.");
  }
  return lines.join("\n");
}
