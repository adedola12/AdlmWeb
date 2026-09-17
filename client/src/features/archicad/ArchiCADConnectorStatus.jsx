// src/features/archicad/ArchiCADConnectorStatus.jsx
// Badge showing whether the local QUIV connector is running. Probes
// http://localhost:4823/api/status every 5s with a 1.5s timeout — plain
// fetch, no auth (it's a local process, not the ADLM Cloud API).
import React from "react";

const CONNECTOR_URL = "http://localhost:4823/api/status";
const POLL_MS = 5000;
const TIMEOUT_MS = 1500;

export default function ArchiCADConnectorStatus() {
  const [running, setRunning] = React.useState(null); // null = probing

  React.useEffect(() => {
    let alive = true;

    async function probe() {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(CONNECTOR_URL, { signal: ctrl.signal });
        if (alive) setRunning(res.ok);
      } catch {
        if (alive) setRunning(false);
      } finally {
        clearTimeout(timer);
      }
    }

    probe();
    const id = setInterval(probe, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const on = running === true;
  return (
    <span
      title={
        on
          ? "The QUIV connector is running on this machine (localhost:4823)."
          : "Start the connector next to ArchiCAD with `node index.js`, then open the panel at http://localhost:4823."
      }
      className="wk-src"
      style={
        on
          ? {
              background: "var(--pal-light-wash)",
              color: "var(--pal-light-key)",
              borderColor: "var(--pal-light-line)",
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: on ? "var(--action)" : "var(--ink-3)",
        }}
      />
      {on ? "Connector running" : "Connector not running"}
    </span>
  );
}
